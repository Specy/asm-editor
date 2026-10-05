# Unicorn-based Targets research (ARM first)

Research date: 2026-10-04. The question was whether new Targets, ARM to begin with, can be built on Unicorn (execution), Capstone (disassembly) and Keystone (assembly), editing their sources where needed, so that every function of the emulator contract works.

Sources:

- the upstream repositories and the packages published from them;
- the codebase as of this date (`feat/source-compilation`);
- a spike in a scratch directory, described under [Spike](#spike), with every number measured on this machine under Node 24.18.1 and Emscripten 6.0.9.

This note proposes no production change. Nothing in the app or in the Core submodules was modified.

## Conclusions

**Unicorn can back every execution function of the contract.** It cannot do it alone. A Core needs a small C layer compiled into the same WebAssembly module, the role `blinkenlib.c` plays for blink in the x86 Core. That layer holds the undo journal, instruction budgets, breakpoints, the call stack, Poke transactions and the hand-off of system calls to JavaScript.

The spike built that whole chain. It compiled Unicorn 2.1.4 to WebAssembly for ARM only: 699 KB, 234 KB gzipped. It added a 225-line layer and drove it from Node. On top of that it ran:

- breakpoints set by source line;
- Step and Undo, with memory restored;
- a call stack;
- `write` and `exit` system calls answered by JavaScript;
- untouched GCC output.

**It is fast enough.** Without hooks Unicorn ran 35.5 million instructions a second. With the per-instruction budget and breakpoint check it ran 11.4 million, and with the full undo journal 3.6 million. The editor's own estimates for the existing Cores are 11,022 instructions/ms for MIPS, 5,432 for RISC-V, 15,000 for M68K and 10 for x86.

**Capstone is fine.** It is BSD-licensed and disassembles ARM correctly. It is needed only for display, for example the instructions a source line generated.

**Keystone is not usable, and source edits would not rescue it cheaply.**

- Any `.text` or `.data` directive crashes it, natively as well as in WebAssembly.
- An error comes back as one code for the whole input, with no line number.
- It produces flat bytes, with no sections, no linker and no line table.
- It rejects AArch64 GCC output.

Making it work would mean rebuilding what GNU `as` and `ld` already do. **GNU `as` and `ld` compiled to WebAssembly replace it.** In the spike they assembled and linked untouched Compiler Explorer output, and the result ran on Unicorn with the same answer as a native build. Their diagnostics carry line numbers, and their DWARF line table maps every instruction to its source line. `ld` also gives the [ADR 0030](../adr/0030-cores-resolve-runtime-library-members.md) member resolution for free.

**The spike found a bug in the current WebAssembly port of Unicorn and fixed it.** In unicorn.js 2.1.4, a straight run of about 100 instructions translated under a per-instruction hook crashes the module. So does a run of about 200 VFP instructions, even without hooks. The cause is a TCG temporary leaked by unicorn.js's own helper-call patch, and a ten-line change fixes it ([details](#bugs-and-gotchas)).

**Licensing is the blocker, not the engineering.**

- Unicorn is GPL-2.0, with no "or later" grant in its own files.
- Keystone is GPL-2.0-only.
- The editor is AGPL-3.0.

GPL-2.0-only code cannot be combined with AGPL-3.0 code in one program. This needs the owner's decision before any code is written. See [Licensing](#licensing) and [If GPL-2.0 is not acceptable](#if-gpl-20-is-not-acceptable).

## The contract, one function at a time

The contract is [`BaseEmulator`](../../src/lib/languages/BaseEmulator.svelte.ts) together with what [`GenericEmulator`](../../src/lib/languages/GenericEmulator.svelte.ts) asks of an adapter. Below, "the layer" is the C code compiled next to Unicorn. "Verified" means the spike ran it.

| Contract member                                                                         | How a Unicorn-based Core provides it                                                                                                                                                                                                                                                                                                                                                                                                                       | Spike                                                                               |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `_compile`, `_checkCode`                                                                | GNU `as` then `ld`, run as WebAssembly programs over a virtual filesystem, as the x86 Core runs NASM. `as` reports `main.s:4: Error: bad instruction ...`, with a line but no column; the x86 Core's `locateDiagnosticSpan` approach covers the column. `ld` reports `main.s:5:(.text+0x4): undefined reference to 'nowhere'` and `multiple definition of '_start'; ... first defined here`.                                                               | Verified                                                                            |
| `_initialize`, memory layout                                                            | A linker script places `.text`, `.rodata`, `.data` and `.bss`. The Core maps the ELF's `PT_LOAD` segments, a stack and the device pages with `uc_mem_map`.                                                                                                                                                                                                                                                                                                 | Verified                                                                            |
| `_getCompiledCode`, `_getBuildArtifacts`                                                | The DWARF line table maps each address to a line, Capstone gives each instruction's text, and the bytes come out of Core memory. This also shows what a pseudo-instruction such as `ldr r0, =label` or `push` became.                                                                                                                                                                                                                                      | Line table and disassembly verified                                                 |
| `_getInstructionAt`, `_getNextInstruction`, `_getLastInstruction`, `getLineFromAddress` | The PC is looked up in the line table. The layer records the last executed PC.                                                                                                                                                                                                                                                                                                                                                                             | Verified                                                                            |
| `_step`                                                                                 | The layer runs with a budget of 1. A step costs 19 µs.                                                                                                                                                                                                                                                                                                                                                                                                     | Verified                                                                            |
| `_runSlice`: budget, breakpoints, `skipBreakpointAtPc`, stop reasons                    | The layer's code hook counts instructions, stops at the budget, and stops before an instruction a breakpoint names, except the one the slice starts on. Without history, breakpoints can instead be compiled into the translated code as Unicorn "exits", which costs nothing per instruction; changing them means dropping the translation cache for that range. The stop reasons map to the slice reasons: budget, breakpoint, system call, exit, fault. | Verified, including stop-before and resume                                          |
| `_undo`, `_canUndo`, `_getUndoHistory`                                                  | The layer keeps a ring of entries. Each entry holds the registers before the instruction, the old bytes of every store (a `UC_HOOK_MEM_WRITE` callback runs before the store and also receives the new value), and the call stack change. Bytes a system call writes join the entry of its `svc`, so undoing the `svc` undoes them too. History rows are built from consecutive entries.                                                                   | Verified: 1000 steps undone in about 1 ms, and re-running reproduces the same state |
| `_beginPoke`, `_endPoke`                                                                | The layer opens a poke entry and its setters record the old values. A poke into code has to drop the translation cache for its range (`uc_ctl_remove_cache`), or the old instruction keeps running.                                                                                                                                                                                                                                                        | The cache flush is verified                                                         |
| Registers, flags and Register files                                                     | `uc_reg_read`/`uc_reg_write`. The CPU file is `r0`–`r12`, `sp`, `lr`, `pc` and `cpsr`; the Status flags are N, Z, C and V. A VFP/NEON file holds `s0`–`s31`/`d0`–`d31`/`q0`–`q15` and `fpscr`. On AArch64 it is `x0`–`x30`, `sp`, `pc`, NZCV, `v0`–`v31`, `fpcr` and `fpsr`.                                                                                                                                                                               | Verified, including D and Q reads                                                   |
| `_readMemoryBytes`, `_writeMemoryBytes`                                                 | `uc_mem_read`/`uc_mem_write`                                                                                                                                                                                                                                                                                                                                                                                                                               | Verified                                                                            |
| `_getCallStack`                                                                         | The layer keeps a shadow stack. It pushes a frame when the previous instruction set `lr` to the address after itself and branched, and pops it when execution reaches that return address. No disassembly is needed for this.                                                                                                                                                                                                                              | Verified on nested calls                                                            |
| `_hasTerminated`, `_getStatus`, `_stringifyError`                                       | The exit system call ends the program. A fault comes back as a `uc_err` such as `UC_ERR_READ_UNMAPPED` or `UC_ERR_INSN_INVALID`, with the PC on the faulting instruction, so the error names the right line.                                                                                                                                                                                                                                               | Verified                                                                            |
| Terminal input, `_runTestcase`                                                          | `svc` stops the run through an interrupt hook. The adapter serves the call asynchronously, through the Terminal's `readAsync` or a Testcase's scripted input, journals the bytes it writes, and resumes.                                                                                                                                                                                                                                                   | `write` and `exit` verified; `read` is the same path                                |
| FileSystem, Program time                                                                | Linux EABI system calls through the same `svc` path: `open`/`read`/`write`/`close`/`lseek` for the FileSystem, `clock_gettime`/`nanosleep` for Program time.                                                                                                                                                                                                                                                                                               | Design only                                                                         |
| Screen, Keyboard, Mouse                                                                 | Device pages mapped with `uc_mmio_map`, whose read and write callbacks are C functions in the layer. Alternatively, a RAM framebuffer watched by a write hook limited to its range, plus `_resyncScreenFromMemory` after Undo as for MIPS.                                                                                                                                                                                                                 | MMIO verified                                                                       |
| Language service                                                                        | The worker runs `as` for diagnostics, which takes tens of milliseconds per check. Symbols come from a small label scanner, or from the object's symbol table joined with the line table.                                                                                                                                                                                                                                                                   | Diagnostics verified                                                                |

None of this needs threads or `SharedArrayBuffer`. Unicorn's `timeout` argument starts a thread, which the WebAssembly build does not have, so a Core uses instruction budgets, as every Core here already does.

## Spike

### What was built

- **Unicorn 2.1.4 for WebAssembly, ARM only.** This used [unicorn.js](https://github.com/AlexAltea/unicorn.js) at `1220477` (2026-06-25), which revived the port in June 2026. Its build:
    - re-adds QEMU 5.0.1's TCG interpreter (TCI), because WebAssembly cannot run generated host code;
    - wraps every TCG helper in an adapter with one uniform signature, because WebAssembly traps on a call through a mismatched function pointer.

    The build took 39 s. The published npm package `@alexaltea/unicorn-js` 2.1.4 cannot be used as it is: it does not export `uc_ctl`, which exits, CPU-model selection and cache flushes need, and it has the crash described below.

- **A debugger layer in C** (225 lines), linked into the same module. It holds the history ring, the shadow call stack, the budget and breakpoint check, the `svc` hand-off, and a `journal_memory` entry point for system calls. It also has an MMIO probe.
- **GNU binutils 2.45 for WebAssembly, `arm-none-eabi`, `as` and `ld`.** The configure line is under [Reproducing the spike](#reproducing-the-spike). The build took about 10 minutes, most of it configure checks run through `emcc`. [`@binutils-wasm/gas`](https://www.npmjs.com/package/@binutils-wasm/gas) 0.2.0 already publishes `as` for `armv7-linux-gnueabihf` and `aarch64-linux-gnu`, but no `ld`: its build passes `--disable-ld`. Building `ld` needed only `--enable-ld --disable-plugins --disable-lto`.
- **An end-to-end harness:**
    1. `as -g`, then `ld` with a linker script;
    2. read the ELF program headers and the DWARF line table;
    3. load the program into Unicorn;
    4. run it with breakpoints by line, Step, Undo, the call stack and system calls.

### Measurements

The loop was `add`/`eor`/`str`/`cmp`/`bne`, 2,000,003 instructions. Each figure is the best of three interleaved passes. This machine was shared with other workloads (load average about 3.5 on 10 cores) and single passes swung by up to 2×.

| Configuration                                                                    | Million instructions/s |
| -------------------------------------------------------------------------------- | ---------------------: |
| No hooks; the end address is an exit (how breakpoints would be compiled in)      |                   35.5 |
| Unicorn's own instruction count (`uc_emu_start`'s `count`)                       |                   11.9 |
| Layer: budget and breakpoint check per instruction, no history                   |                   11.4 |
| Layer: undo journal (17 core registers, stores, call stack)                      |                    3.6 |
| The same, in 10,000-instruction slices, as the scheduler would run it            |                    3.5 |
| The same, also saving `d0`–`d31` and `fpscr` per instruction                     |                    1.8 |
| A JavaScript callback per instruction (unicorn.js `hook_add`, earlier quiet run) |                   10.7 |

Some costs are per operation rather than per instruction:

| Operation                                   | Cost                       |
| ------------------------------------------- | -------------------------- |
| One Step through the layer                  | 19 µs                      |
| Undo                                        | 1000 steps in about 1–2 ms |
| Instantiating the Unicorn module            | 20–30 ms                   |
| Instantiating `as` or `ld`                  | 10–40 ms                   |
| Assembling a 500–1,100-line GCC output file | 15–94 ms                   |
| Assembling a 22,000-line file               | 127 ms                     |
| Linking (`ld`)                              | 19–53 ms                   |
| `uc_context_save`/`restore` from JavaScript | 0.5 µs each                |

Undo is on by default with 200 steps (`UNDO_HISTORY_SIZE`), so 3.6 million instructions a second is the default Run speed. That sits between the editor's RISC-V and MIPS estimates.

A slice always needs an instruction budget, so with undo off the realistic figure is 11.4 million, not 35.5. Exits make breakpoints free, but counting still costs a helper call per instruction until budgets are counted per block (see [What each project needs](#what-each-project-needs)).

The journal cost has known headroom, none of it measured yet:

- read `CPUARMState` directly instead of 17 `uc_reg_read` calls;
- save the VFP bank only when it changed;
- build with `-sSUPPORT_LONGJMP=wasm`, since the stack traces show Emscripten's JavaScript `setjmp` wrappers around QEMU's exit path.

On AArch64, the published unicorn.js variant ran the same loop at 15 million instructions/s, measured while the binutils build was loading the machine. Floating point was enabled at reset.

GNU `as` is 1.06 MB, 430 KB gzipped; `ld` is 1.31 MB, 427 KB gzipped. The x86 Core today runs GNU `as` inside blink at about 2 ms per line. The same WebAssembly build of `as` for `x86_64` would fix that Core's GNU-mode Build time too.

### Verified behaviour

- `uc_emu_stop` from a code hook stops _before_ the hooked instruction, and the PC stays on it. That is the [ADR 0023](../adr/0023-run-continues-past-the-breakpoint-it-is-parked-on.md) breakpoint rule.
- An exit address also stops before the instruction. Starting on an exit does not move; the layer runs past it by removing that exit for one step, which is `skipBreakpointAtPc`. Adding an exit needs the translation cache for that range dropped.
- `count = N` runs exactly N instructions.
- A `UC_HOOK_MEM_WRITE` callback sees the old memory contents and receives the new value.
- `svc #0` raises interrupt number 2 with the PC already past the `svc`, so a run resumes there after JavaScript has answered the call.
- An unmapped read stops with `UC_ERR_READ_UNMAPPED` and an undefined word with `UC_ERR_INSN_INVALID`, both with the PC on the faulting instruction.
- Thumb-2 runs when started at an odd address. The default CPU for `UC_MODE_ARM` is a Cortex-A15, which has VFPv4, NEON and integer divide.
- A store into code in another block is picked up. A block that rewrites itself keeps executing its old instructions, which ARM permits without an `ISB`; the store into another block is the case programs rely on.
- MMIO callbacks receive the store's offset and value, and serve loads.
- Untouched Compiler Explorer output ran correctly at O0 and O2. That was ARM GCC 14.2 (`carmug1420`, with `-mcpu=cortex-a15 -mfloat-abi=hard -mfpu=vfpv4 -marm` and the editor's own flags), and the code had `.rodata`, `.data` and `.bss`, a switch table, recursion and double-precision VFP arithmetic. It was linked with a three-line `_start` and returned 1698, the native host build's answer.
- A hand-written program went through the whole harness:
    1. it printed through `write`;
    2. it stopped at a breakpoint set by line number, with `r0 = 55`;
    3. a Step stored the result and an Undo restored the memory;
    4. a breakpoint inside a nested function showed one frame, returning to the calling line;
    5. the program exited with code 0 and printed `"Hello from ARM!\n55\n"`;
    6. twelve Undos then walked back across the `exit` and `write` system calls to the loop they came from.

### Bugs and gotchas

**A TCG temporary leak in unicorn.js 2.1.4.** It crashes with "memory access out of bounds" or "Aborted()", and both the npm package and a fresh build are affected. The failing inputs are:

- a single translated block of about 100 or more instructions while any per-instruction hook is active, Unicorn's own `count` included;
- about 200 consecutive VFP instructions, even with no hooks.

The cause is unicorn.js's `tcg_gen_callN` patch. To give every helper argument a full 64-bit pair, it creates an extension temporary for each narrow argument and never frees it. On wasm32 that leaks two TCG temporaries per narrow argument of every helper call, until the block passes the 1024-temporary limit. The overflow is only asserted in debug builds. The fix is to free the extension temporaries after the call is emitted:

```diff
 /* qemu/tcg/tcg.c, tcg_gen_callN, after unicorn.js's unicorn-adapters.patch */
+    TCGTemp *ext_temps[16] = { 0 };
     for (i = 0; i < nargs; i++) {
         int arg_is_64bit = sizemask & (1 << (i+1)*2);
         if (!arg_is_64bit) {
             TCGv_i64 ext_temp = tcg_temp_new_i64(tcg_ctx);
             TCGv_i64 ext_orig = temp_tcgv_i64(tcg_ctx, args[i]);
             tcg_gen_ext32u_i64(tcg_ctx, ext_temp, ext_orig);
             args[i] = tcgv_i64_temp(tcg_ctx, ext_temp);
+            ext_temps[i] = args[i];
         }
     }
     ...
 #endif /* TCG_TARGET_EXTEND_ARGS */
+    for (i = 0; i < nargs; i++) {
+        if (ext_temps[i]) {
+            tcg_temp_free_i64(tcg_ctx, temp_tcgv_i64(tcg_ctx, ext_temps[i]));
+        }
+    }
 }
```

With it, every crashing case passed: 1000-instruction blocks under a hook, and 512 `vadd.f64` in one block with and without the count hook, each with the right result. Before the fix, an uncapped block of 80 hooked instructions ran and one of 100 crashed. Capping hooked blocks at 96 instructions avoided the crash, and the retry path for oversized blocks never ran. That pointed at a per-block resource, the temporaries, rather than code size. The fix belongs upstream in unicorn.js, and it has not been reported yet.

The other gotchas:

- **A host write into translated code is not seen** until the translation cache for that range is dropped. Pokes and system calls that write into code pages must call `uc_ctl_remove_cache`.
- **32-bit ARM starts with VFP/NEON disabled.** A floating-point instruction is then `UC_ERR_INSN_INVALID` until the Core sets CPACR's cp10/cp11 bits and `FPEXC.EN`. AArch64 starts with them enabled.
- **`uc_ctl` reads its address arguments as 64-bit varargs.** On wasm32 a caller has to pass `uint64_t` explicitly. Passing a 32-bit value silently does the wrong thing, and it did in the spike's first cache-flush helper.
- **The capstone.js 5.0.9 JavaScript wrapper reads the instruction-detail structure at Capstone 4's offsets,** so its `groups` come back empty. Disassembly text is correct. A Core would call Capstone from the C layer, or fix the offsets.

### Keystone

The tests used [keystone.js](https://github.com/AlexAltea/keystone.js) 0.9.2, published in June 2026, and a native `kstool` built from Keystone master `0d9567f` (2026-07-18).

| Input                                                                | Result                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code with labels, `ldr rX, =value` literal pools, Thumb-2, VFP       | Assembles                                                                                                                                                                                                                                   |
| Any `.text` or `.data` directive, even `.text` followed by one `mov` | Crashes: "memory access out of bounds" in WebAssembly, and a segmentation fault in native `kstool`                                                                                                                                          |
| `.section .rodata`                                                   | Prints "unexpected token in '.section' directive" to stderr, then reports success with 0 bytes                                                                                                                                              |
| An error                                                             | One code for the whole input, such as `KS_ERR_ASM_MNEMONICFAIL`. No line, no column, and it stops at the first error                                                                                                                        |
| ARM GCC 14.2 output, O0 and O2                                       | Crashes on its sections                                                                                                                                                                                                                     |
| AArch64 GCC 14.2 output                                              | Fails. Its 2016 LLVM does not know `.arch armv8-a` or the DWARF 5 form `.file 0 "dir" "file"`, and `.section .rodata` is a parse error                                                                                                      |
| The output itself                                                    | Flat bytes, with no symbols, no line table and no relocations. Its ELF writer writes each section's bytes back to back and returns before writing any header, so there is no layout step that could place `.data` or `.bss` apart from code |
| Maintenance                                                          | The last release is 0.9.2 from 2020-06. Since 2023 there has been one commit, a 2026 build fix                                                                                                                                              |

Fixing this from source would mean writing section layout and a linker, a per-instruction line map, line-numbered diagnostics and newer directives. That is what GNU `as` and `ld` already are.

## What each project needs

**Unicorn.** Keep a fork pinned to 2.1.4, as the x86 Core keeps `libblink`. On top of it go:

- unicorn.js's three patches (TCI, helper adapters, PPC symbols);
- the leak fix above;
- the C layer;
- an Emscripten build per architecture (ARM, and AArch64 later).

Upstream released 2.1.4 in 2025-09 and the master branch has been quiet since February 2026. Its next release, 2.2, is announced to move to QEMU 5.1 or later "so semantics could be changed", so a pinned fork is the safer footing.

A faster engine would be a separate project. QEMU itself merged Emscripten support in 32-bit TCI mode, and a TCG backend that emits WebAssembly for hot blocks is in progress ([KVM Forum 2025](https://pretalx.com/kvm-forum-2025/talk/EVRL9V)). Unicorn is still based on QEMU 5.0.1, years older than that work.

These optional source changes would make it faster:

- precise budgets counted per translated block, instead of a helper call per instruction (QEMU's `icount` idea);
- register snapshots read straight out of the CPU state;
- copy-on-write checkpoints with replay, instead of a per-instruction journal, using Unicorn 2.1's memory snapshots. This needs system calls logged for replay.

**Capstone.** No changes. Use the C API from the layer, or fix the wrapper's offsets.

**Keystone.** Do not use it. Replace it with binutils.

**binutils.** Build `as` and `ld` for each target with Emscripten. Its license is GPL-3.0-or-later, which is compatible with the AGPL-3.0 editor. LLVM's `llvm-mc` and `lld` (Apache-2.0 with the LLVM exception) are the alternative if column-precise diagnostics ever matter more than size. They were not measured, and a two-target LLVM build is expected to be several times larger.

## ARM decisions for the owner

1. **Which ARM.** ARMv7-A with A32 and Thumb-2, as on a 32-bit Raspberry Pi and in CPUlator, is the one most teaching material uses, and Unicorn's default CPU covers it. AArch64 is a cheap second Target on the same layer: Compiler Explorer's ARM64 GCC 14.2 (`carm64g1420`) already exists, and its output assembles. M-profile (Thumb-only Cortex-M) is a third option. Recommendation: A32 first, AArch64 second.
2. **Syntax.** GNU syntax (UAL with GNU directives), which is what GCC emits and what Linux tutorials use. ARM's own `armasm`/Keil syntax (`AREA`, `ENTRY`, `END`) would need a different assembler.
3. **How programs reach the Peripherals.**
    - The Terminal, FileSystem and Program time go through Linux EABI system calls: `svc #0`, with the call number in `r7`. That matches the tutorials, GCC, and a Runtime library syscall layer.
    - The Screen, Keyboard and Mouse need a device map. It can be our own, or the DE1-SoC map CPUlator uses, so that existing course material runs unchanged.
4. **Memory map, entry and termination.** This covers the linker script, the stack top, whether a heap via `brk` exists, entry at the ELF entry `_start`, and what returning from `_start` means. Testcases read memory at absolute addresses, so the map is part of the Target's interface.
5. **The licensing question below.** It comes first, because it decides whether Unicorn is the engine at all.

## Licensing

These are facts gathered for a decision; they are not legal advice.

- The editor is AGPL-3.0 (`LICENSE`).
- Unicorn's `COPYING` is GPL-2.0 and its README says "GPLv2". Its own files (`uc.c`, the `unicorn_*.c` glue) carry no "or later" grant. QEMU states that QEMU as a whole is GPL-2.0, even though many of its files are GPL-2.0-or-later, LGPL, BSD or MIT. Unless the maintainers say otherwise, treat Unicorn as GPL-2.0-only.
- Keystone says outright "GPLv2 (without the 'any later version' clause)". It adds a FOSS exception that lists AGPL-3.0, but the exception does not apply when the combined work contains other GPL code, and Unicorn would be other GPL code.
- Capstone is BSD-3-Clause. binutils is GPL-3.0-or-later, which AGPL-3.0 §13 allows to be combined; the x86 Core already ships GNU `as` and `ld` as programs. LLVM is Apache-2.0 with the LLVM exception.
- GPL-2.0-only code cannot be combined with GPL-3.0 or AGPL-3.0 code in one program. An Emulator that bundles a Unicorn-based Core and calls it in-process is one program in the FSF's reading.

The ways out are the owner's to weigh:

1. **Run the Unicorn Core as a separate program,** in its own worker behind a message protocol, the way IDEs drive QEMU's gdbstub. Whether that counts as "separate programs" is a legal judgement. It is also an architecture change: the contract's synchronous reads, such as `_readMemoryBytes` and `_getRegisterValues`, would become messages.
2. **Use a permissively licensed engine** (next section).
3. **Change the editor's license.** That is the owner's call and depends on who holds copyright in it.

## If GPL-2.0 is not acceptable

Everything except the engine stays: GNU `as`/`ld`, Capstone, the layer's design and the ELF/DWARF loading.

- **[Icicle](https://github.com/icicle-emu/icicle-emu)** (MIT or Apache-2.0, Rust) emulates by interpreting Ghidra SLEIGH p-code. Its README names x86-64, AArch64, MIPS and MSP430 among its targets, and Ghidra has SLEIGH specifications for ARM and Thumb. A journal fits it naturally, because every p-code write is a store to a varnode. Its JIT is Cranelift; whether its interpreter builds for WebAssembly, and how fast it is there, would need a spike of its own. SLEIGH semantics are written for decompilation, so some instructions may be approximate.
- **An own interpreter** in Rust compiled to WebAssembly, the way s68k is built, gives full control and a license of our choosing. It is the largest effort. A teaching subset (A32 integer and scalar VFP, no NEON) is bounded but still large. Unicorn can still serve as a native test oracle in CI, since a tool used only for testing is not distributed with the app.
- **[rp2040js](https://github.com/wokwi/rp2040js)** (MIT, TypeScript) emulates the Cortex-M0+, which runs ARMv6-M Thumb only. It is small and narrow, and fits only a "Thumb/Cortex-M0" Target.

## Other Targets the same Core could add

Unicorn also emulates AArch64, MIPS32/64, PowerPC 32/64, SPARC 32/64, RISC-V 32/64, s390x, TriCore, M68K and x86. GNU `as` and `ld` exist for all of them. Each further Target needs:

- that architecture's Unicorn build;
- a binutils build;
- a system-call convention;
- a register list;
- documentation.

AArch64 is the natural second; PowerPC and SPARC are plausible later. Replacing the existing MIPS, RISC-V, M68K or x86 Cores is not recommended. They carry simulator conventions Unicorn does not have, such as MARS and RARS system calls and directives and EASy68K traps.

## Rough plan and effort

Sized relative to work already done here. These are not commitments.

1. **The Core package** (`@specy/arm` or similar, released through the existing CD recipe). This is the largest piece. It contains:
    - the Unicorn fork and the C layer: history, Pokes, call stack, budgets, breakpoints, system-call hand-off, devices;
    - the binutils builds;
    - a TypeScript wrapper: toolchain runner, ELF loader, DWARF line table (`@specy/x86`'s `source-map.ts` and `elf-symbols.ts` already parse these), diagnostics parsing, a system-call table;
    - a conformance suite against native `qemu-arm` or hardware outputs.
2. **The editor.** Target registration, which touched about twenty files for Z80. An Emulator adapter, comparable to the RISC-V one. Register files for VFP/NEON, the Monaco grammar and language features, the language-service adapter, and the Source compilation preset with its flags.
3. **Content.** Instruction and system-call documentation, examples and a Language course. MIPS and RISC-V documentation alone are over 1,000 lines each.

A first runnable ARM Target is a matter of weeks of focused work, and the Core is most of it. The spike already settled the riskiest unknowns: the WebAssembly build, speed, undo, breakpoints and toolchain compatibility.

## Reproducing the spike

The scratch directory was session-scoped. These are the steps.

1. **Unicorn.**
    1. Clone unicorn.js (`1220477`) with its `unicorn` submodule (`8028ec4`, 2.1.4).
    2. Put `~/emsdk` (`source ~/emsdk/emsdk_env.sh`) and a CMake 4.x binary on `PATH`.
    3. Run `python3 build.py arm`.
    4. Apply the leak fix above to `unicorn/qemu/tcg/tcg.c`.
    5. Run `cmake --build unicorn/build --target unicorn_archive`.
    6. Link the layer:

        ```
        emcc -Os -Iunicorn/include layer.c unicorn/build/libunicorn.a -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sEXPORTED_FUNCTIONS=[...]
        ```
2. **binutils 2.45** (release tarball). In a separate build directory:

    ```
    emconfigure ../binutils-2.45/configure --target=arm-none-eabi --host=wasm32 --disable-doc --disable-gprof --disable-nls --disable-binutils --disable-gdb --disable-gdbserver --disable-libdecnumber --disable-readline --disable-sim --disable-werror --disable-plugins --disable-lto --enable-ld=default --disable-gold --without-zstd
    emmake make -j10 "CFLAGS=-DHAVE_PSIGNAL=1 -DELIDE_CODE -Os" "LDFLAGS=-sMODULARIZE=1 -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain -sINVOKE_RUN=0 -sALLOW_MEMORY_GROWTH=1 -sEXPORT_ES6=1 -sEXIT_RUNTIME=0"
    ```

    This produces `gas/as-new(.wasm)` and `ld/ld-new(.wasm)`.

3. **Link.** The linker script was `. = 0x10000; .text; .rodata; . = ALIGN(0x1000); .data; .bss`, with `ENTRY(_start)`.
4. **Load.** Map each `PT_LOAD` segment rounded to 4 KB and a stack below `0x80000000`. Then set CPACR `|= 0xf << 20` and `FPEXC = 0x40000000`.

## Sources

- [Unicorn](https://github.com/unicorn-engine/unicorn): 2.1.4 release notes (2.2 and QEMU 5.1 plans), `COPYING`, `uc.c` (`uc_emu_start`, the count hook), `qemu/target/arm/translate.c` (exits), `include/tcg/tcg.h` (the 1024-temporary limit on 32-bit hosts)
- [unicorn.js](https://github.com/AlexAltea/unicorn.js): `build.py`, `src/patches/*.patch`, `src/qemu/helper-adapter.h`; npm [`@alexaltea/unicorn-js`](https://www.npmjs.com/package/@alexaltea/unicorn-js) 2.1.4
- [Keystone](https://github.com/keystone-engine/keystone): `llvm/keystone/ks.cpp` (`ks_asm`), `llvm/lib/MC/ELFObjectWriter.cpp` (`writeObject`), `README.md` and `EXCEPTIONS-CLIENT`; npm [`@alexaltea/keystone-js`](https://www.npmjs.com/package/@alexaltea/keystone-js) 0.9.2
- [Capstone](https://github.com/capstone-engine/capstone) (6.0.0-Alpha11 and 5.0.9 current); npm [`@alexaltea/capstone-js`](https://www.npmjs.com/package/@alexaltea/capstone-js) 5.0.9
- [binutils-wasm](https://github.com/mnixry/binutils-wasm) (`packages/gas/build/build.sh`); [GNU binutils 2.45](https://ftp.gnu.org/gnu/binutils/)
- QEMU in the browser: [KVM Forum 2025 talk](https://pretalx.com/kvm-forum-2025/talk/EVRL9V) and [FOSDEM 2025 slides](https://fosdem.org/2025/events/attachments/fosdem-2025-6290-running-qemu-inside-browser/slides/237638/slides_1dDtpcS.pdf)
- Compiler Explorer's `/api/compilers/c` list (ARM GCC 14.2 `carmug1420`, ARM64 GCC 14.2 `carm64g1420`)
- [Icicle](https://github.com/icicle-emu/icicle-emu), [rp2040js](https://github.com/wokwi/rp2040js)
- In this repo: [`BaseEmulator`](../../src/lib/languages/BaseEmulator.svelte.ts), [`GenericEmulator`](../../src/lib/languages/GenericEmulator.svelte.ts), [`ExecutionSlice`](../../src/lib/languages/ExecutionSlice.ts), [`X86Emulator`](../../src/lib/languages/X86/X86Emulator.svelte.ts), [the x86 Core's wrapper](../../emulators/x86/blink-js/src/x86-emulator.ts), [`compilerExplorer.ts`](../../src/lib/sourceCompilation/compilerExplorer.ts), [ADR 0023](../adr/0023-run-continues-past-the-breakpoint-it-is-parked-on.md), [ADR 0030](../adr/0030-cores-resolve-runtime-library-members.md)
