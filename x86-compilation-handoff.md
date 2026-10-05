# Handoff: x86 C/C++ compilation (GCC → NASM translator) and the Blink fixes

You are continuing work started on 2026-10-04 in `/home/dev/code/asm-editor` (the Svelte asm-editor) and its x86 Core submodule `emulators/x86` (repo Specy/x86-js, default branch `libblink`; npm package `@specy/x86` lives in `emulators/x86/blink-js`). Everything described below is **uncommitted** in the working tree. Other sessions are working in the same tree at the same time (RISC-V GNU assembler profile, Runtime library design, editor UI); touch only the files this handoff names, and re-read files before editing them.

## Ground rules from the owner

- Do not commit, push, tag, bump versions or publish without an explicit instruction. When committing, do NOT add a `Co-Authored-By` trailer (the owner strips them).
- Releases of the Core are tag-triggered CD on `libblink`: bump with `npm version minor|patch|major --no-git-tag-version` in `blink-js`, commit "Release vX.Y.Z", push the branch first, then the tag. npm can take ~20 min to show the x86 tarball.
- The owner prefers work done with subagents (pass `model: opus`), reviewed independently before handing back.
- Keep NASM as the x86 assembler: GNU as must never run in users' Builds; it is used only at fixture-capture time as a reference oracle.

## Read first

1. `docs/design/x86-compiler-assembly-translation-plan.md` — the plan (milestones 0–3, gates, rules, appendix corpus).
2. `docs/design/x86-gcc-intel-v1.md` — what was implemented and verified (corpus, oracles, Blink fixes, findings). Parts of it are now stale; see "Docs to update" below.
3. `docs/design/source-runtime.md`, `docs/design/source-runtime-plan.md`, ADRs `docs/adr/0029`–`0031` — the Runtime library design that owns `crt0`, library linking and the x86 phase.
4. `CONTEXT.md` — the vocabulary (Core, Target, Source compilation, Compiler driver, Generated assembly, Compilation record, Source map, Runtime library, Library member, Entry file…).

## Current state (all uncommitted)

### A. Translator — milestones 0–2 done (`emulators/x86/blink-js`)

- `src/compiler-output/` — GCC 14.2 `-masm=intel` x86-64 output → NASM 3.00 source. Published as the subpath `@specy/x86/compiler-output` (`translateCompilerOutput(lines, { profile: 'gcc-intel-v1' })`, `GCC_INTEL_V1`, types; diagnostics code `unreadable-line` added). Pure TypeScript, no wasm; never emits startup code; keeps `.init_array` as a section; never throws except for an unknown profile id.
- Generated tables (from NASM 3.00 sources in the untracked `emulators/x86/wasm_nasm/nasm/`): `src/compiler-output/nasm-reserved.ts`, `nasm-instruction-set.ts` via `scripts/generate-nasm-reserved-names.mjs` (byte-reproducible).
- Corpus: `tests/fixtures/gcc-intel-v1/` (40 programs, 187 cases at O0–Os, 36 x87 forms; gzip JSON with stored GNU-as reference executables and address→input-line tables), captured by `scripts/capture-gcc-fixtures.mjs` (the package's only Compiler Explorer contact; refuses non-x86-64-Linux hosts).
- Tests: `tests/compiler-output/*.test.ts` (unit, corpus in Blink and natively, locations vs Compiler Explorer, symbols, GNU-reference byte/trace comparison with FPU/SSE state, x87 matrix), `tests/elf-symbol-table.test.ts`; `src/elf-symbols.ts` gained `readElfSymbolTable`/`readElfSectionBytes`.
- Packaging: `tsdown.config.ts` second entry + `./compiler-output` export, `package.json` exports, `tests/dist-smoke.mjs` (subpath works with WebAssembly stubbed; root export list of 2.8.0 unchanged), README "Compiling C and C++".
- Gate decisions taken (see the record): GNU as only at capture time; `.loc` locations; inline asm rejected; `@gnu_unique_object`+`.weak` → weak object; no `CPU X64` (it silently re-encodes some forms to APX) — a generated instruction allowlist instead; `notrack` rejected; function-entry code alignment kept (C++ pointer-to-member needs even addresses), loop alignment dropped.

### B. Blink fixes (`emulators/x86/libblink/blink/*.c|h`, rebuilt `blink-js/src/wasm/blinkenlib.wasm`, last known sha256 `f1a65fe7…`, 303,774 B; `blinkenlib.js` unchanged)

- x87: FDIV/FDIVR with ST(i) destination swapped; FSUBP ST(i) wrote ST(1); FST/FSTP/FXCH tags; FUCOMPP (`DA E9`) added; empty-register reads return the QNaN indefinite and compare unordered; undefined encodings now #UD per the SDM opcode maps (`DE D8/DA–DF`, `D9 D1–D7`, `DF E1–E7`), FENI/FDISI/FSETPM no-ops; FCOMI-family and COMIS*/UCOMIS* clear OF/SF/AF.
- Integer flags: INC AF, NEG AF fixed; the RFLAGS word programs and the debugger see is now architectural (bit 1 set, bits 3/5/15/22+ clear, IOPL 0, IF 1 for Linux programs; PF computed from Blink's lazy parity byte); initial RFLAGS 0x202; signal frames save the architectural word and `rt_sigreturn` restores through Linux's FIX_EFLAGS mask (minus RF).
- Bridge (`blinkenlib.c`): `blinkenlib_get_flags`/snapshot/step info report the PUSHFQ word; `blinkenlib_set_flags` goes through `ImportFlags`. Memory: debugger reads/writes/spy go through new `PageInAddress` (`memory.c`) so lazily-populated pages read correctly (the editor showed zeros before); Pokes into untouched pages now work.
- `libblink/build/bootstrap/mkdeps.com` made executable (index mode 100755, staged) so header changes trigger recompiles (it creates `~/.ape`).
- Tests: `tests/x87-register-forms.test.ts`, `tests/rflags-word.test.ts`, `tests/flags-parity.test.ts`, `tests/lazy-pages.test.ts`. Native comparisons (this host is an x86-64 i7-10750H under WSL2, so Core-linked ELFs run natively): x87 forms, PUSHFQ/LAHF words, a 3,415-case ALU flag fuzz, all 512 x87 register encodings and int3 signal frames all matched native after the fixes.
- How the wasm was rebuilt (reproducibly): from a clean copy of libblink (the shipped 2.8.0 artifacts were built in `/home/dev/code/asm-editor-x86-perf`), emcc 6.0.9 at `/home/dev/emsdk` (`source /home/dev/emsdk/emsdk_env.sh` in the same shell), the `emmake make` command from `emulators/x86/compile_blink.sh` with `BUILD_TIMESTAMP`/`BLINK_COMMITS` pinned to the shipped values; install by writing temp files beside `src/wasm/` and renaming; confirm `blinkenlib.js` is byte-identical. Do not run `npm run build:wasm` in-tree blindly: `libblink/o` held stale objects from another configure.

### C. TypeScript fallback history — removed (done, verified)

- At the owner's request the `nativeHistory` option and the TypeScript undo recorder are gone; the native wasm history (commit 68aa170) is the only one. `x86-emulator.ts` went from 1,128 to 698 lines; `native-history.ts` now throws at creation (`assertSupported()`) if the wasm lacks history version 1 or `_blinkenlib_run_slice`; `x86-emulator-utils.ts` kept only what the native path needs; benchmark scripts and READMEs updated. After the removal: type-check clean, full suite 2,105 passed / 2 skipped, build and dist smoke OK, root still exports the 46 names of 2.8.0.
- Included fixes: a `run()` hang after `step()`/`undo()` (root cause in `BlinkRuntime.runUntilBlocked`; `resumeScheduled` flag; new `BlinkRuntime.settle()`); a program exiting during `provideInput` at undo size 0 being restarted by the next `run()`/`step()`; `mxcsr` reported twice per step/Poke (duplicate block from 68aa170 removed). Tests: `tests/run-undo-scenarios.test.ts` (24), updates in `native-history`, `write-values`, `undo`, `flags-parity`, `lazy-pages` tests.
- Public API impact: `X86EmulatorOptions.nativeHistory` (added in 2.8.0) is removed and `createX86Emulator()` now rejects a wasm without native history → the next release is technically breaking (3.0.0 vs 2.9.0 is the owner's call).
- Not fixed (dropped with the TypeScript path): a breakpoint stop inside a run longer than one 50,000-instruction slice reports only the last slice's `executedInstructions` (cosmetic; the editor does not use it).

### D. Editor changes (asm-editor repo, uncommitted)

- `src/lib/languages/statusFlagBits.ts` (+ `.test.ts`): per-Target bit layout of recorded status words; `MutationStep.svelte` uses it instead of s68k's `ccrToFlagsArray` (x86 and Z80 history rows lit the wrong flags). `MutationStep.dom.test.ts` updated (s68k mock removed, x86 row test added). Another session edits `MutationStep.svelte` concurrently (Runtime-library "stretch" rows) — keep edits minimal.
- Docs: `docs/design/x86-compiler-assembly-translation-plan.md`, `docs/design/x86-gcc-intel-v1.md` (both untracked).

## Verify first

```sh
cd /home/dev/code/asm-editor/emulators/x86/blink-js
npm run type-check
npx vitest run            # ~90–100 s; last good run: 2,105 passed, 2 skipped (after the fallback removal)
npm run build && npm run test:dist
cd /home/dev/code/asm-editor
npx vitest run src/lib/languages/statusFlagBits.test.ts src/components/specific/project/user-tools/MutationStep.dom.test.ts
npm run check             # svelte-check: 0 errors, 32 existing warnings
```

Gotchas: vitest hides console output of passing tests (`--disable-console-intercept`); never `pkill -f` (it kills the tool shell); to drive a Core from a scratch script pipe it into node from the repo root (`cat x.mjs | node --input-type=module`) or import `emulators/x86/blink-js/dist/index.mjs` by absolute path.

## Open work, in priority order

1. Run the "Verify first" commands; expect the counts above.
2. Undo of the exit syscall followed by Run breaks the instance (`step()` hits `unassert(!s->exited)` and aborts the wasm; `run()` goes through `run_slice`, which re-executes the exit, frees the machine and calls `exit()`). Design from the investigation — in this build (no threads, JIT or fork) the first exit only sets `s->exited`/`s->exitcode` and halts with the PC back on the `syscall`, leaving machine, memory, registers and fds intact, so it is restorable: (a) flag the exit step's C history `Entry` when the step ended with `kMachineExitTrap`; (b) `blinkenlib_history_undo` clears `exited`/`exitcode` when undoing that entry (Pokes made after the exit must not); (c) replace the `unassert` on `exited` in stepi/continue/preempt_resume/faketty_resume, add the missing check to `run_slice`, report the exit again instead of crashing, and make `SysExitGroup` always halt when `trapexit` is set (never free the machine or call `exit()`). The TypeScript side already moves Stopped → Running and clears `stopReason` on undo. Add tests (exit → undo → step/run/run-to-exit again), then rebuild the wasm as described in section B.
3. Check `syscall`'s R11: the SDM says `R11 := RFLAGS`; if Blink's `OpSyscall` writes the raw `m->flags`, the lazy parity byte and wrong reserved/IOPL bits leak into R11. Fix with the architectural word if so, with a native comparison test.
4. Pre-existing Blink deviations found by the documentation review (Intel SDM 093 Sept 2026, AMD APM, Linux v7.2), none fixed yet — fix what the owner wants, each with a native comparison:
    - `FpuSub` is wrong for every infinite operand (∞−1 → −∞); `FpuDiv` gives +∞ for 1/−0 and no IE for ∞/∞; x87 arithmetic on a NaN or empty operand returns +QNaN instead of the operand NaN / the negative indefinite (Intel Vol. 1 Table 4-8); FUCOM* set IE for quiet NaNs (only SNaNs should); C1 not cleared by FXCH/FCOMI without underflow; tags always written 00; FENI/no-op forms update FIP/FOP.
    - Signal handler entry does not clear DF and TF (Linux `arch/x86/kernel/signal.c` clears DF/RF/TF); fault frames lack RF (bit 16) that hardware sets for SIGSEGV/SIGILL/SIGFPE/SIGBUS; CLI/STI/HLT/IN/OUT should deliver SIGSEGV at CPL 3 (Blink: CLI/STI silent, others SIGILL); TF never single-steps.
    - SSE: COMIS* update EFLAGS before an unmasked #I halts; UCOMIS* never sets IE for SNaN; COMIS* clears the sticky IE.
    - The owner explicitly excluded: "a flags-only Poke cannot be undone".
    - Minor: a test comment cites `arch/x86/kernel/signal.c` for FIX_EFLAGS (moved to `signal_64.c` / `asm/sighandling.h` in v6.2); the FCOMI OF/SF/AF rule still lacks a fetched documentation quote (native-confirmed).
5. Record everything in `docs/design/x86-gcc-intel-v1.md` (it predates section B's later fixes, C, D and the documentation review; its line about `nativeHistory: false` is now wrong), then ask the owner about committing (submodule + editor) and the release version; after a release, bump `@specy/x86` in the editor.
6. Editor milestone 3 (x86 Compile), after the release and either the Runtime library's x86 phase (`crt0`, library linking, entry check counting the library's `_start`, DWARF attribution for library units) or an owner-approved interim hidden start unit: `'X86'` in `CompilationTarget`/record validation (`src/lib/sourceCompilation/records.ts`); x86 preset `cg142`/`g142` + `GCC_INTEL_V1` flags, no `-Dmain` rename or wrapper (`compilerExplorer.ts`); make the `assemblerProfile: 'gnu-compiler-v1'` tagging RISC-V-only (today it tags every non-MIPS Target); a `prepareAssembly` x86 branch calling `translateCompilerOutput`, Source map from `lines[].location` (skip the location-less `align` lines), translation Diagnostics on mapped source lines, `main` required in the symbol summary; `isCompilationTarget` gates; optimization list from the profile; handling the default Project's `main.asm` (it defines `_start`, which collides with `crt0` because x86 links every `.asm` File); x86 fixtures and integration tests; browser check. Ideally written against the Compiler driver interface that `source-runtime-plan.md` milestone 4 extracts.
7. Docs follow-ups on acceptance: ADR 0032 (x86 translates compiler output to NASM inside the Core's package; GNU as in Builds rejected) — check the next free number first; replace the GNU-as candidate paragraph in `docs/design/source-compilation.md`; amend CONTEXT.md's Entry file definition (x86 links every source File).
