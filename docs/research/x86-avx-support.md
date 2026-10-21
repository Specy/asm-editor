# AVX support in the x86 Core

**Status 2026-10-21: implemented** (see [Implementation](#implementation) at the end). The sections below are the research the work started from; where the design changed the end says how.

Researched 2026-10-21 against `packages/x86` (Blink). Nothing is implemented. The question came from the Ghidra usability study, where an AVX-built CTF binary stopped at its first `vmovdqa` (`docs/research/ghidra-usability-study.md`, item 1) and `docs/design/reverse-engineering-ux.md` deferred "AVX support in the x86 Core".

## Where Blink stands

| Piece | State | Where |
| --- | --- | --- |
| VEX length decoding (`C4`/`C5`) | Written, **compiled out**: `#define DISABLE_BMI2` is in `libblink/config.h`, and `xed_decode_instruction_length` only calls `xed_vex_scanner` under `#ifndef DISABLE_BMI2`. With it off, `C4`/`C5` are not prefixes, so the instruction is illegal. | `x86.c:386-505,731`, `config.h:30` |
| What the decoder keeps from a VEX prefix | `vvvv` (`Vreg`, 4 bits), `L` (`Ymm`, bit 30), `R/X/B/W`, `pp` folded into `Osz`/`Rep`, `map` folded into `Mopcode` (`0x1xx`, `0x2xx`, `0x3xx`, the same numbers as legacy `0F`, `0F 38`, `0F 3A`). Nothing records that the prefix was VEX. | `rde.h`, `x86.c` |
| EVEX (`62`) | Not decoded. | |
| BMI1/BMI2 handlers | Written (`bmi2.c`, `Op2f5/6/7`, `OpRorx`), but `machine.c:1532` maps them to `OpUd` while `DISABLE_BMI2` is set. CPUID leaf 7 only advertises BMI2 and ADX under the same guard. | `bmi2.c`, `cpuid.c:169` |
| Vector register file | `u8 xmm[16][16]` in `struct Machine`, twice (`machine.h:228`, `:424`). | |
| SSE kernels | `static void SsePaddd(u8 x[16], const u8 y[16])` and about 400 more in `sse.c`, `sse2.c`, `ssefloat.c`, `ssemov.c`. Each has an `X86_INTRINSICS` host-asm branch and a portable C branch. The wasm build takes the portable one. | |
| Dispatch | `kNexgen32e[]` for opcodes below `0x200`, then `GetOp()`'s `XLAT` switch (`machine.c:2074`). `OpSse(A, MmxKernel, SseKernel)` picks MMX or SSE from `Osz(rde)`. | `machine.c`, `sse.c:1496` |
| JIT | Disabled (`DISABLE_JIT`), so there is no second code path to keep in step. | `config.h:15` |
| CPUID | No AVX/XSAVE bits. SSSE3 is advertised, SSE4.1/4.2 are `0 << n`. | `cpuid.c` |
| Save/restore | `OpFxsave`/`OpFxrstor` copy 256 bytes of `xmm`. The signal frame copies `m->xmm`. There is no XSAVE, XRSTOR or XGETBV. | `machine.c:1235`, `signal.c:129,249` |
| Editor bridge | `blinkenlib_get_fpu_state` / `set_fpu_state` image `xmm` as bytes 0-255 of a 356-byte block, guarded by `_Static_assert`s. JS decodes it in `blink-js/src/fpu-state.ts`; the register view, step diff (`x86-emulator.ts:878`), undo snapshot and Pokes all use that block. | `blinkenlib.c:916-980` |
| Disassembly | Zydis 4.1.1 already decodes VEX/EVEX. NASM 3.00 assembles them. The C-output translator rejects them (`unsupported-instruction`). | |

So the work is almost entirely in the execution core and the state block. Parsing is mostly there.

## Design

### 1. Register file: 16 × 32 bytes, upper halves kept separate

Keep `u8 xmm[16][16]` untouched and add `u8 ymmh[16][16]` beside it (the upper 128 bits). Every legacy-SSE handler and every `XmmRexrReg(m, rde)` caller then stays as is, and a legacy SSE write leaves `ymmh` alone, which is the architectural rule. Widening `xmm` itself to `[16][32]` would touch every kernel call and the JIT-shaped pointer code for no gain.

The rules each VEX handler must follow:
- VEX.128 (`L=0`) writes **zero** `ymmh[dst]`.
- VEX.256 writes both halves.
- Scalar VEX forms (`vaddss`, `vmovss`, ...) take the bits above the scalar from `vvvv` (or `rm` for the memory-load forms) and zero `ymmh[dst]`.
- `vzeroupper` zeros all `ymmh`; `vzeroall` zeros both files.

Bridge change: extend the state block with 256 bytes of `ymmh` (append after `dp`, so existing offsets do not move), bump the block size constants on both sides, add a `_Static_assert` for it, and extend `fpu-state.ts`. Undo, step diff and Pokes work on the block, so they get `ymm` for free once the block carries it. The Core's native `beginPoke`/`endPoke` needs the same range.

### 2. VEX flag and dispatch

`rde` is nearly full. The cleanest option is to give VEX its own entry point instead of a flag: in `LoadInstruction`'s decode result, when the scanner sees `C4`/`C5`, store the dispatch key as `Mopcode | 0x400` (a fourth "map" value, one bit above the existing `0x3xx`), so legacy and VEX forms of the same opcode have different keys and `GetOp()` gets a second switch. This also means a VEX byte can never run a legacy handler by accident.

(The risk of skipping this: with the scanner on and no VEX flag, `C5 F9 6F` would decode to Mopcode `0x16F` with `Osz` set and run as legacy `movdqa`, ignoring `vvvv`/`L` and silently giving wrong results. Do not enable `DISABLE_BMI2` by itself; check that every VEX opcode that is not yet wired reaches `OpUd`.)

Needed checks, per the SDM: `#UD` if `vvvv != 1111` on instructions that do not use it, if VEX has `66`/`F2`/`F3`/`REX`/`LOCK` prefixes in front, `L=1` where only 128 is legal, and `W` rules. Without them, malformed encodings run instead of faulting.

### 3. Handlers: wrap the SSE kernels

Most VEX instructions are "legacy op with a third source", and legacy kernels already have the shape `kernel(x, y)`: `x op= y`. A single generic wrapper covers them:

```c
static void OpVex3(P, void Kernel(u8[16], const u8[16])) {
  u8 t[16];
  memcpy(t, m->xmm[Vreg(rde)], 16);           // src1 = vvvv
  Kernel(t, GetXmmAddress(A));                // t op= src2 (reg or 16 bytes)
  memcpy(XmmRexrReg(m, rde), t, 16);
  if (!Ymm(rde)) memset(m->ymmh[RexrReg(rde)], 0, 16);
  else { /* repeat on the high halves with the memory operand + 16 */ }
}
```

This covers the packed integer and float arithmetic, logic, compare, min/max, unpack/pack and shuffle-by-lane ops, and the scalar `ss`/`sd` ops (the kernel only writes the low element, so the rest of `t` is `vvvv`'s, which is exactly VEX's merge rule). Unary and move forms (`vmovaps`, `vsqrtps`, `vpshufd`, `vcvt*`, `vpmovmskb`, `vptest`, `vucomis*`) use a two-operand wrapper that ignores `vvvv`.

Kernels such as `Pshufb`, `Palignr`, `Punpck*`, `Packs*` work per 128-bit lane, so the 256-bit form is the same kernel twice. That is a large share of AVX2 integer code.

Genuinely new code, not wrappable:

| Group | Instructions |
| --- | --- |
| Lane-crossing | `vperm2f128/i128`, `vpermq/pd`, `vpermd/ps`, `vinsertf128/i128`, `vextractf128/i128`, `vbroadcast*` (including `vpbroadcast*`), 256-bit `vpmovzx/sx` (reads 8-16 bytes, not a full vector) |
| VEX-only | `vzeroupper/all`, `vpermilps/pd`, `vtestps/pd`, `vblendv*` (4-operand, register in `imm8[7:4]`), `vpblendd`, `vmaskmov*`, `vpmaskmov*`, `vpsllv/srlv/srav`, `vroundps` forms with changed immediates |
| FMA3 | 36 `vfmadd/vfmsub/vfnmadd/vfnmsub` forms × 132/213/231 × ps/pd/ss/sd. Needs a truly fused multiply-add: `fmaf`/`fma` from the C library are correct (Emscripten uses a software `fma`), plain `a*b+c` is not. |
| Gathers | `vpgather*`, `vgather*`: a loop with a mask register, element-wise fault behaviour, and the mask cleared as elements complete. |
| F16C | `vcvtph2ps`, `vcvtps2ph` (half-float conversion; small). |
| BMI | Already written, just re-enable. Add `tzcnt`/`lzcnt`/`popcnt` checks while there. |

AVX-512 (EVEX, 32 registers, `k0-k7`, masking, broadcast, rounding) is a separate project of similar size to everything above. Not planned.

### 4. Memory operands

`GetXmmAddress` loads 16 bytes. A 256-bit access must load 32 bytes, cross page boundaries, and report the read/write range to `SetReadAddr`/`SetWriteAddr` (the editor's memory highlight uses them). Alignment: VEX loads do not fault on misalignment except `vmovaps/vmovapd/vmovdqa` (32-byte aligned for `ymm`) and a few non-VEX-legacy ones, so the legacy aligned-only check must not be applied blindly to VEX forms.

### 5. State plumbing

- CPUID leaf 1: set AVX (ecx bit 28), OSXSAVE (bit 27), XSAVE (bit 26), FMA (bit 12), F16C (bit 29); leaf 7: AVX2 (ebx bit 5). The order is last: **advertise a feature only when every instruction glibc selects for it is implemented**, because ifunc picks `memcpy`/`strlen`/etc. from these bits. Leaf 0xD must exist if XSAVE is advertised.
- Add `xgetbv` (`0F 01 D0`, returning XCR0 = x87|SSE|AVX = 7) and `xsetbv` as `#GP` or a no-op. Dynamic glibc's lazy-binding trampoline (`_dl_runtime_resolve_xsave*`) uses `xsave`/`xsavec` when the CPU claims them, so that path needs XSAVE, XSAVEC, XRSTOR with the AVX component. Static binaries avoid it. Verify with a dynamically linked fixture.
- `fxsave`/`fxrstor` stay legacy. The signal frame stays legacy too (does not include `ymmh`); if a handler runs AVX code and returns, upper halves would be lost, so either save `ymmh` in the frame extension (what Linux does with `xsave`) or accept it and document it.

### 6. Editor side

Small:
- Register view: `ymm0-15` rows (or expand the existing xmm rows to show 256 bits). `fpu-state.ts` and the step diff add the `ymmh` half.
- The AVX note from the reverse-engineering plan goes away once the Core runs these instructions; keep it for EVEX.
- The translator's `unsupported-instruction` stays unless the Start-unit work wants AVX output, which is a separate ask.

## Verification

This is where most of the cost is: SIMD semantics have many edge rules (saturation, NaN propagation, rounding via MXCSR, signed vs unsigned shifts, lane order) that no reading catches.

- **The host runs AVX2/FMA/BMI2** (`/proc/cpuinfo`, 10 threads), so a differential harness is possible without extra hardware: a native C program that, for each case, `mmap`s a code page, copies the encoded instruction in with random operands in all 16 registers, runs it, and dumps `ymm0-15` + flags; the same bytes and inputs run in the wasm Core (node) and are compared byte for byte.
- Encodings come from Zydis (it enumerates the instruction set) or NASM, one test per opcode × `L` × reg/mem × W. Aim for several hundred opcodes × a few dozen random seeds plus corner values (0, ±0.0, NaN, Inf, denormals, `INT_MIN`, `0x80`/`0x7f` bytes).
- Reuse the shape of the existing C Runtime corpus work (the 426/426 GCC/Clang corpus): compile real programs with `-mavx2 -O2` and compare outputs.
- Fixtures already in the tree: `blink-js/tests/fixtures/elf/avx.c` and the glibc test `reports the faulting address for unsupported AVX` (that expectation flips). Add a dynamic-glibc fixture that runs `strlen`/`memcpy`/`memchr` through their AVX2 ifuncs, and the `not-crypto` picoCTF binary from the study.
- Flag-affecting AVX instructions (`vptest`, `vucomis*`, `vtestps`) need the flags compared too.

## Phases and cost

Estimates are for one person who knows the codebase, including the differential tests.

| Phase | Content | Size |
| --- | --- | --- |
| 0 | Enable the VEX scanner behind a dispatch key, `OpUd` for everything, re-enable BMI1/BMI2 with tests, differential harness skeleton | small |
| 1 | `ymmh` register file, state block v2, JS bridge, undo/Poke range, editor register view | small-medium |
| 2 | Generic wrappers: AVX 128/256 over existing kernels (moves, arithmetic, logic, compare, shuffle-by-lane, scalar, conversions, `vzeroupper`) | medium |
| 3 | AVX2 integer + lane-crossing + broadcast + variable shifts + blends + masked moves | medium |
| 4 | FMA3 and F16C | small-medium |
| 5 | Gathers | small-medium |
| 6 | CPUID, XGETBV, XSAVE family, signal-frame decision, dynamic-glibc fixture, glibc ifunc runs | medium (the risky one) |

Minimum useful milestone is phases 0-3 + 6 without gathers: it runs `-march=x86-64-v3` GCC output and glibc's AVX2 string functions. Phases 4-5 can follow.

## Open questions for the owner

1. **Scope**: AVX/AVX2/FMA/F16C/BMI at 256 bits, no AVX-512 (recommended)? Or only AVX/AVX2 first?
2. **Should CPUID advertise AVX at all**, or stay at SSSE3 so glibc keeps choosing its SSE2 paths and AVX only matters for binaries that already contain it (like the picoCTF one)? The second is much safer and still fixes the study's blocker, because binaries built with `-mavx` use AVX unconditionally. Recommended for the first release.
3. **Signal frames**: legacy frame only (document the limitation), or XSAVE-format frames?
4. **Release**: this is an `@specy/x86` minor (new instructions, state block size change visible to the Core's JS API, so plan the editor bump in the same change).

## Not verified

- I did not build anything. Cost figures and the "wrappers cover most ops" claim come from reading the kernel signatures, not from a spike. A one-day spike on `vmovdqa`, `vpxor`, `vpaddd` (128 and 256) plus `vzeroupper` would confirm or break the estimate.
- Whether Emscripten's `fma()` is correctly rounded in the version pinned for this repo needs a check before relying on it.
- I did not check whether the dynamic `ld.so` fixtures in the tree request XSAVE.

## Implementation

The owner's answers: no AVX-512, `CPUID` unchanged, legacy signal frames. Done in `packages/x86` (not committed, not released).

**What changed from the plan above.**
- The wrapper does not call kernels (`SsePaddd` and friends): it calls the legacy *handler* (`OpSsePaddd`, `OpAddpsd`, ...), after copying `vvvv` into the destination register and, for the second lane, swapping the upper halves into the `xmm` file and adding 16 to the displacement. That reuses the float and conversion handlers too, which are not written as kernels. A destination that is also the r/m source, or a shared shift count, goes through a scratch register.
- The VEX key is the legacy map plus a bit (`XED_VEX_MAP`), so `0f 58` as VEX is `0x558`. `GetOp()` hands those to `GetVexOp()`; a single entry point (`OpVexTop`) checks the prefix against a table before anything runs.
- A VEX instruction that faults restores the registers it touched (`m->vexundo`, restored in `HaltMachine`), and 256-bit stores and masked stores reserve every byte before writing any, so a fault leaves the machine as the host does.
- `SSE4` instructions Blink never had (blends, `pmin/max`, `pmovzx`, `ptest`, rounding, `dpps`, string compares, ...) exist only in their VEX form, in `avx2.c`. Legacy encodings still raise SIGILL because `CPUID` reports none of them.
- `BMI1/2` are written again in `avx2.c` (the old `bmi2.c` stays disabled): it lacked `andn`, `bls*` and `bextr`, and keyed on the legacy map.

**What exists.** AVX, AVX2, FMA3 (every form and order), F16C, gathers, masked moves, BMI1/2, AES-NI, PCLMULQDQ, SSE4.1/4.2 in VEX form. Not AVX-512, VAES or VPCLMULQDQ (the host lacks the latter two, so there was nothing to compare with).

**Verification.** `blink-js/tests/avx/` assembles one program per group of cases, runs it in Blink and on the host (which has AVX2, FMA and BMI2), and compares every register, the memory the case touches and the flags. `coverage.test.ts` places every VEX map, prefix, opcode, length, width, register and memory form in a slot, and a signal handler records which raise SIGILL or SIGSEGV: Blink must agree with the host on all of them. `faults.test.ts` compares 43 faulting and page-straddling accesses, with the address of the fault. Results that depend on which of two NaNs hardware picks are compared only where the rule is defined (`min`, `max`, compares, FMA, `round`), not for `addps` and its relatives, whose NaN payload depends on how the host orders the operands.

**Legacy bugs found on the way** (fixed, they affect SSE too): `unpckhpd`, `sqrtpd`, float to integer conversions of NaN and out-of-range values and the rounding mode of `cvtss2si`, `pextrw` leaving the upper bits of its register.

**Not done.** `vmaskmovdqu`'s memory form does not exist (correct); EVEX; the signal frame keeps the legacy state only. `rcpps` and `rsqrtps` compute exact results where hardware returns approximations that differ between processors, so they are not compared. The editor has not been changed: its register view shows no `ymm`, its "AVX instructions are not currently supported" note should now apply to EVEX only, and it needs the Core release.
