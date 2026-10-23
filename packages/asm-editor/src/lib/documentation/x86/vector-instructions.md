**AVX** (Advanced Vector Extensions) extends the x86 vector registers from 128 bits to 256 bits (`ymm0` to `ymm15`) and introduces a three-operand syntax with a `v` prefix. You can write AVX instructions directly in NASM assembly or debug them in imported [Executables](/documentation/x86/executables).

## Registers {#registers}

There are sixteen 256-bit vector registers, `ymm0` through `ymm15`. Each `xmmN` register is the low 128 bits (**low half**) of the corresponding `ymmN` register, and bits 128 to 255 are its **high half**:

```
            low half = xmm0 (bits 0..127)      high half (bits 128..255)
ymm0  [ s0   | s1   | s2   | s3   ||  s4   | s5   | s6   | s7   ]   8 × float32
      [ d0          | d1          ||  d2          | d3          ]   4 × float64
```

Because `xmmN` and `ymmN` share the same storage, writing to `xmm3` modifies the low half of `ymm3`. Lanes are numbered starting from the lowest bits (lane 0 is bits 0–31 for 32-bit values and sits at the lowest memory address).

In the **Registers** panel, switch to the **AVX** tab to inspect all sixteen `ymm` registers as 32-bit floats, 64-bit doubles, or hexadecimal bytes. The **SSE** tab shows the low 128-bit halves (`xmm0`–`xmm15`) alongside the `mxcsr` status register.

## Three operands {#three-operands}

AVX instructions add a `v` prefix to the SSE mnemonic and take a separate destination register followed by two sources:

```x86
    vaddps ymm0, ymm1, ymm2         ; ymm0 = ymm1 + ymm2 (ymm1 and ymm2 are unchanged)
    vaddps ymm0, ymm1, [rel b]      ; second source can be in memory
    vshufps ymm0, ymm1, ymm2, 0x44  ; immediate masks come last
```

Unlike two-operand SSE instructions (`addps xmm0, xmm1`), which overwrite their first source, three-operand `v` instructions leave both source registers intact. You can use the `v` forms with either 128-bit `xmm` registers or 256-bit `ymm` registers.

Instructions with only one source—such as moves, conversions, and single-register shuffles—still take two operands (plus an immediate when needed), as in `vmovups ymm0, [rel a]`, `vcvtdq2ps ymm0, ymm1`, and `vpshufd ymm0, ymm1, 0x1b`. Fused multiply-add instructions take three operands and overwrite the first; see [FMA](#fma).

## Upper bits {#upper-bits}

When an instruction writes to a 128-bit `xmm` register, what happens to the high half (`bits 128–255`) of the enclosing `ymm` register depends on whether you use the `v`-prefixed AVX form or the legacy SSE form:

| Instruction               | Low half (`bits 0–127`)                         | High half (`bits 128–255`) |
| ------------------------- | ----------------------------------------------- | -------------------------- |
| `addps xmm0, xmm1`        | `xmm0 + xmm1`                                   | Unchanged                  |
| `vaddps xmm0, xmm1, xmm2` | `xmm1 + xmm2`                                   | Set to zero                |
| `vaddps ymm0, ymm1, ymm2` | Low 4 lanes of sum                              | High 4 lanes of sum        |
| `vaddss xmm0, xmm1, xmm2` | Bits 0–31: sum; bits 32–127: copied from `xmm1` | Set to zero                |

Every `v`-prefixed instruction that writes to an `xmm` register clears bits 128 to 255. Scalar `v` instructions (`vaddss`, `vmovss`, `vcvtsi2sd`, and others) compute their scalar result in the lowest lane, copy the remaining bits of the low half (`32–127` or `64–127`) from their **first source** register, and zero the high half.

- `vzeroupper` zeroes bits 128–255 of all sixteen `ymm` registers while keeping `xmm0`–`xmm15`.
- `vzeroall` zeroes all 256 bits of all sixteen `ymm` registers.

On physical processors, mixing 256-bit AVX instructions with legacy SSE instructions causes a performance penalty if the upper halves hold nonzero bits. Standard calling conventions therefore run `vzeroupper` before calling external functions or returning from a function that used `ymm` registers.

## 128-bit lanes {#lanes}

Most 256-bit instructions treat a `ymm` register as two independent 128-bit halves (**128-bit lanes**), performing the same 128-bit operation on the low half and the high half in parallel. For element-by-element arithmetic like `vaddps` or `vpaddd`, this is invisible. For instructions that rearrange or reduce elements, it means data does not cross the middle boundary between bit 127 and bit 128.

### Instructions that stay within each 128-bit half

- **Byte and word/dword shuffles** (`vpshufb`, `vpshufd`, `vpshuflw`, `vpshufhw`, `vshufps`, `vpermilps`): select elements only from the same 128-bit half. When an immediate is used, the same 8-bit control mask is applied to both halves.
- **Double-precision shuffles** (`vshufpd`, `vpermilpd`): immediate bits 0–1 select within the low half and bits 2–3 select within the high half.
- **Unpacks and packs** (`vpunpck*`, `vunpcklps`, `vunpckhps`, `vpackss*`, `vpackus*`): interleave or pack the low halves together in the low 128 bits, and the high halves together in the high 128 bits.
- **Horizontal operations and byte shifts** (`vhaddps`, `vhaddpd`, `vpalignr`, `vpslldq`, `vpsrldq`): operate independently inside each 128-bit half.

### Instructions that cross between halves

Use these instructions when you need to move elements between the low 128 bits and the high 128 bits:

| Instruction                                                      | What it does                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `vextractf128`, `vextracti128`                                   | Copy the low (`0`) or high (`1`) 128-bit half of a `ymm` register to `xmm`/memory  |
| `vinsertf128`, `vinserti128`                                     | Replace the low (`0`) or high (`1`) half of a `ymm` register from `xmm`/memory     |
| `vperm2f128`, `vperm2i128`                                       | Build each 128-bit half from either half of two `ymm` sources (or zero)            |
| `vpermq`, `vpermpd`                                              | Rearrange the four 64-bit elements across the full 256 bits using an immediate     |
| `vpermd`, `vpermps`                                              | Rearrange the eight 32-bit elements across the full 256 bits using index registers |
| `vbroadcastss`, `vbroadcastsd`, `vpbroadcast*`, `vbroadcastf128` | Replicate one element (or 16 bytes) across all lanes of the destination            |
| `vpmovzx*`, `vpmovsx*`, `vcvtdq2pd`, `vcvtps2pd`                 | Widen elements from a 128-bit source across a 256-bit `ymm` destination            |
| `vcvtpd2ps`, `vcvttpd2dq`, `vcvtpd2dq`                           | Narrow four 64-bit elements in a `ymm` source into a 128-bit `xmm` destination     |

To sum all eight floats in `ymm0` into a single value, extract the high half into `xmm1` once and finish the reduction in 128 bits:

```x86
    vextractf128 xmm1, ymm0, 1      ; copy high half of ymm0 into xmm1
    vaddps xmm0, xmm0, xmm1         ; 4 partial sums in xmm0
    vhaddps xmm0, xmm0, xmm0        ; 2 partial sums
    vhaddps xmm0, xmm0, xmm0        ; total sum in every lane of xmm0
```

## Memory operands {#memory}

A 256-bit memory operand is 32 bytes (`yword` in NASM), and a 128-bit memory operand is 16 bytes (`oword`). NASM does not use `xword`.

Most instructions determine the memory size from the register operand (`vmovdqu ymm0, [rel v]` reads 32 bytes). Specify `yword` or `oword` when an instruction accepts two different memory sizes for the same destination register:

```x86
    vcvtpd2ps xmm0, yword [rel p]   ; convert 4 doubles (32 bytes) to 4 floats
    vcvtpd2ps xmm0, oword [rel p]   ; convert 2 doubles (16 bytes) to 2 floats
    vcvtdq2pd ymm1, oword [rel i]   ; convert 4 int32s (16 bytes) to 4 doubles
```

Be careful with `vcvtpd2ps xmm0, [rel p]`: without a size keyword, NASM defaults to the 16-byte `oword` form and converts only two doubles.

## Alignment {#alignment}

Unaligned moves (`vmovups`, `vmovupd`, `vmovdqu`), broadcasts, and memory operands inside `v`-prefixed arithmetic, comparison, or shuffle instructions (`vaddps ymm0, ymm1, [rel v]`) work at any memory address.

Only the explicitly aligned move instructions require aligned addresses:

- `vmovaps`, `vmovapd`, `vmovdqa`, `vmovntps`, `vmovntpd`, `vmovntdq`, and `vmovntdqa` require **16-byte alignment** for `xmm` operands and **32-byte alignment** for `ymm` operands.
- Accessing an unaligned address with an aligned move stops the program with `SIGSEGV` (segmentation fault) at that instruction without modifying the destination.

Use `align 32` before a label in `.data` or `.bss` to align it for 256-bit aligned moves:

```x86
section .data
align 32
table:  dd 1, 2, 3, 4, 5, 6, 7, 8

section .text
    vmovdqa ymm0, [rel table]       ; aligned to 32 bytes: succeeds
    vmovdqa ymm1, [rel table + 4]   ; misaligned: stops with SIGSEGV
```

### Masked moves and gathers

- **Masked moves** (`vmaskmovps`, `vmaskmovpd`, `vpmaskmovd`, `vpmaskmovq`) load or store only the lanes where the corresponding lane of the mask register has its sign bit (top bit) set. Lanes with a `0` sign bit are zeroed on load, left untouched on store, and never trigger a memory fault even if their address is invalid.
- **Gathers** (`vpgatherdd`, `vgatherdps`, `vgatherqpd`, and others) load elements from base + scaled-index addresses `[base + ymm_index * scale]` for lanes where the mask register's top bit is set, clearing the mask register as elements are loaded.

## Instruction families {#families}

Most vector mnemonics support both 128-bit (`xmm`) and 256-bit (`ymm`) operands:

| Family                      | Representative mnemonics                                              | Notes                                                                    |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Moves                       | `vmovups`, `vmovdqu`, `vmovaps`, `vmovd`, `vmovq`                     | `vmovaps`, `vmovapd`, and `vmovdqa` require [alignment](#alignment)      |
| Arithmetic                  | `vaddps`, `vmulpd`, `vpaddd`, `vpmulld`, `vsqrtps`, `vpsllvd`         | 256-bit integer operations and per-lane variable shifts belong to AVX2   |
| Compare, min, max           | `vcmpps`, `vpcmpeqd`, `vpcmpgtq`, `vminps`, `vpmaxsd`                 | Vector comparisons write all-`1` or all-`0` bits into each matching lane |
| Shuffles and permutes       | `vpshufb`, `vshufps`, `vpermq`, `vperm2f128`, `vpermd`                | Check whether the instruction crosses [128-bit lanes](#lanes)            |
| Blends and masks            | `vblendps`, `vblendvps`, `vpblendvb`, `vptest`, `vmovmskps`           | `vblendv*` selects lanes using the sign bit of the last operand          |
| Conversions                 | `vcvtdq2ps`, `vcvtps2pd`, `vcvttps2dq`, `vcvtph2ps`, `vcvtps2ph`      | `vcvtph2ps` and `vcvtps2ph` convert 16-bit half-precision floats (F16C)  |
| Fused multiply-add          | `vfmadd231ps`, `vfmsub213pd`, `vfnmadd132ss`                          | Single-rounding multiply-accumulate; see [FMA](#fma)                     |
| Gathers and masked moves    | `vpgatherdd`, `vgatherdps`, `vmaskmovps`, `vpmaskmovd`                | Masked-out lanes do not fault; see [Alignment](#alignment)               |
| Bit manipulation (BMI1/2)   | `andn`, `bextr`, `bzhi`, `pdep`, `pext`, `shlx`, `rorx`, `mulx`       | Operate on general-purpose registers (`rax`–`r15`)                       |
| AES and carry-less multiply | `vaesenc`, `vaesenclast`, `vaesdec`, `vaeskeygenassist`, `vpclmulqdq` | 128-bit `xmm` forms only                                                 |
| String compares             | `vpcmpistri`, `vpcmpistrm`, `vpcmpestri`, `vpcmpestrm`                | 128-bit `xmm` forms only                                                 |

## FMA {#fma}

Fused multiply-add (**FMA3**) instructions compute `a * b + c` with a single rounding step at the end, rather than rounding `a * b` first and rounding again after adding `c`:

```x86
section .data
a:  dd 0x3F800001                   ; 1 + 2^-23
b:  dd 0x3F7FFFFE                   ; 1 - 2^-23
c:  dd -1.0

section .text
    vmovss xmm0, [rel a]
    vmovss xmm1, [rel b]
    vmovss xmm2, [rel c]
    vmulss xmm3, xmm0, xmm1         ; 1 - 2^-46 rounds to 1.0
    vaddss xmm3, xmm3, xmm2         ; 0.0
    vmovaps xmm4, xmm0
    vfmadd213ss xmm4, xmm1, xmm2    ; exact product + c = -2^-46 (0xA8800000)
```

The three digits in the mnemonic (`132`, `213`, or `231`) refer to the three operands in order (`1` = destination, `2` = first source, `3` = second source or memory). The first two digits are multiplied, the third is added, and the result is stored in operand `1`:

| Form                     | Computes            | Common use                                       |
| ------------------------ | ------------------- | ------------------------------------------------ |
| `vfmadd132ps y1, y2, y3` | `y1 = y1 * y3 + y2` | Multiplier in `y3` (or memory), addend in `y2`   |
| `vfmadd213ps y1, y2, y3` | `y1 = y2 * y1 + y3` | Polynomial evaluation (`y1 = x * y1 + coeff`)    |
| `vfmadd231ps y1, y2, y3` | `y1 = y2 * y3 + y1` | Dot products and accumulating products into `y1` |

The other FMA families use the same operand numbering:

- `vfmsub`: `a * b - c`
- `vfnmadd`: `-(a * b) + c`
- `vfnmsub`: `-(a * b) - c`
- `vfmaddsub` and `vfmsubadd`: alternate subtraction (even lanes) and addition (odd lanes).

## What runs {#what-runs}

The emulator runs all VEX-encoded instructions from these extensions:

| Extension         | Examples                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- |
| AVX               | `vaddps`, `vmovups`, `vperm2f128`, `vbroadcastss`, `vzeroupper`                           |
| AVX2              | `vpaddd ymm`, `vpermq`, `vpsllvd`, `vpbroadcastd`, `vinserti128`                          |
| FMA3              | `vfmadd132ps`, `vfmadd213sd`, `vfmsub231pd`, `vfnmadd213ps`                               |
| F16C              | `vcvtph2ps`, `vcvtps2ph`                                                                  |
| Gathers           | `vpgatherdd`, `vgatherdps`, `vgatherqpd`                                                  |
| Masked moves      | `vmaskmovps`, `vpmaskmovd`                                                                |
| BMI1, BMI2        | `andn`, `blsr`, `blsmsk`, `blsi`, `bextr`, `bzhi`, `pdep`, `pext`, `mulx`, `rorx`, `shlx` |
| AES-NI, PCLMULQDQ | `vaesenc`, `vaesdec`, `vaeskeygenassist`, `vpclmulqdq xmm`                                |
| SSE4.1, SSE4.2    | `vpminsd`, `vpmovzxbw`, `vblendvps`, `vptest`, `vroundps`, `vdpps`, `vpcmpistri`          |

### Edge cases and unsupported instructions

- **Use `v` prefixes for SSE4.1, SSE4.2, and AES-NI**: Most SSE4.1, SSE4.2, and AES-NI instructions are supported only in their `v`-prefixed form (write `vpminsd xmm0, xmm0, xmm1`, not `pminsd xmm0, xmm1`). Only `pmulld`, `movntdqa`, `pclmulqdq`, and `crc32` run without `v`. SSE, SSE2, SSE3, and SSSE3 instructions work both with and without `v`.
- **AVX-512 is not supported**: EVEX instructions, `zmm` registers, `ymm16`–`ymm31`, and `k` mask registers stop with `SIGILL`.
- **256-bit VAES and `vpclmulqdq` are not supported**: Use their 128-bit `xmm` forms.
- **MMX is not supported**: Instructions using the 64-bit `mm0`–`mm7` registers stop with `SIGILL` (except `emms`, which is a no-op).

When a program hits an unsupported instruction, execution stops with `SIGILL` and the **Log** panel reports the instruction and address.

## Where AVX code comes from {#sources}

You can run AVX code in two ways:

1. **NASM assembly files**: Write AVX instructions directly in any `.asm` file in your project.
2. **Imported [Executables](/documentation/x86/executables)**: Import an x86-64 ELF binary compiled outside the editor (for example, with `gcc -mavx2 -mfma`). You can step through its AVX instructions in the Listing and inspect `ymm` registers while debugging.

The editor's built-in C and C++ [**Compile**](/documentation/x86/using-c) targets baseline x86-64 (up to SSE3) and does not emit AVX instructions. To use AVX in a C or C++ project inside the editor, write the vector routine in a separate `.asm` file and call it from C as shown in [Linking project Files](/documentation/x86/using-c#linking-project-files). Under the System V x86-64 ABI, `ymm0`–`ymm15` are caller-saved, and functions using 256-bit registers should execute `vzeroupper` before returning.

## CPUID {#cpuid}

Although the emulator executes AVX, AVX2, FMA, and BMI instructions directly, its `cpuid` instruction reports a baseline x86-64 processor without those feature bits set (for example, `cpuid` with `eax = 1` leaves `ecx` bits 27 and 28 clear, and `eax = 7, ecx = 0` leaves `ebx` bit 5 clear).

Because of this, imported binaries or libraries (such as `glibc`) that check `cpuid` at startup to choose between instruction sets will automatically select their SSE2 code path, while code compiled to run AVX instructions unconditionally will execute them normally.

## Floating-point results {#floating-point}

- **Rounding modes**: `vroundps`/`vroundpd`/`vroundss`/`vroundsd` (when bit 2 of the immediate is set), `vcvtps2ph`, and float-to-integer conversions (`vcvtps2dq`, `vcvtpd2dq`) honor the rounding mode in `mxcsr`. Standard vector arithmetic (`vaddps`, `vmulps`, FMA) always uses round-to-nearest-even regardless of `mxcsr`.
- **Reciprocal and reciprocal square root**: `vrcpps`/`vrcpss` and `vrsqrtps`/`vrsqrtss` compute full single-precision results in the emulator rather than the 12-bit hardware approximation, so bit-exact comparisons against hardware approximation tables may differ in the low mantissa bits.
- **Legacy SSE alignment**: Real hardware faults on unaligned memory operands in legacy 128-bit SSE arithmetic (`addps xmm0, [rel unaligned]`). The emulator enforces alignment on aligned moves (`movaps`, `vmovaps`, `movdqa`, `vmovdqa`) and legacy integer SSE instructions (`paddd`, `pxor`), but allows unaligned memory operands on legacy floating-point arithmetic.
