# x86 GCC Intel translation v1

Implemented on 2026-10-04 under the [translation plan](./x86-compiler-assembly-translation-plan.md): the translator, corpus and packaging of milestones 0–2, in the x86 Core's package ([blink-js](../../emulators/x86/blink-js/)). [ADR 0032](../adr/0032-x86-translates-compiler-output-to-nasm-in-the-core-package.md) records the NASM decision. The work is committed as the x86 Core's 3.0.0 release, and tag-triggered CD has published it. Milestone 3, x86 **Source compilation** in the editor, waits for the **Runtime library**'s x86 phase in the [runtime plan](./source-runtime-plan.md); its interim version, milestone 3a, decided on 2026-10-05, is implemented and recorded under [Interim editor Compile](#interim-editor-compile). The Compiler driver interface is already extracted in the editor.

## Package surface

`@specy/x86/compiler-output` exports `translateCompilerOutput(input, { profile: 'gcc-intel-v1' })`, `GCC_INTEL_V1` and the types of the plan's API sketch, plus the `unreadable-line` Diagnostic code. It is pure TypeScript with no imports. The bundle is 215 kB (46 kB gzipped). The dist smoke test imports it with `WebAssembly` replaced by a stub that throws, and checks that the root still exports 2.8.0's 46 names. `src/compiler-output/` holds the translator. Two tables are generated from NASM 3.00's own sources by `scripts/generate-nasm-reserved-names.mjs`: the 3,175 reserved names that get `$`-escaped, and the allowed operand forms of each mnemonic. The package README's "Compiling C and C++" section documents the flags, the result, the rejections and a start unit.

## Gate decisions

| Gate               | Decision                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. GNU as          | Capture time only. Fixtures store GNU reference executables, address-to-input-line tables and native results; CI loads the executables with `loadElf` and never runs GNU as.                                                                                                                                                                                                                                                       |
| 2. Names           | As recommended.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3. Locations       | From `.file` and `.loc`. They equal Compiler Explorer's `source` (file, line and column) on every instruction of every case that translates.                                                                                                                                                                                                                                                                                       |
| 4. Inline assembly | Rejected (`inline-assembly`) through 4.0.0. A bounded subset translates since the Environment library's milestone M2: see [Inline assembly](#inline-assembly).                                                                                                                                                                                                                                                                     |
| 5. Startup         | A README example only; the translator emits none.                                                                                                                                                                                                                                                                                                                                                                                  |
| 6. Other compilers | Not attempted.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7. Unique objects  | A `.weak` `@gnu_unique_object` becomes a weak object; GCC paired the two in all 201 occurrences seen. An unpaired one is an error.                                                                                                                                                                                                                                                                                                 |
| 8. Instruction set | No `CPU` directive. `CPU X64` silently re-encoded 32-bit `crc32`, `lzcnt`, `tzcnt` and BMI forms as APX instructions that fault. It also rejected SSSE3, `popcnt` and `endbr64`, which Blink runs. A generated allowlist instead accepts the integer baseline, x87, SSE, SSE2, SSE3 and `endbr64`. Everything else is `unsupported-instruction`, including MMX and VEX: this Blink build defines `DISABLE_MMX` and `DISABLE_BMI2`. |
| 9. Always linking  | Editor work; not started.                                                                                                                                                                                                                                                                                                                                                                                                          |

Decided during implementation:

- **Code alignment.** Alignment before a function label is kept, and loop alignment is dropped. The first rule dropped both, which put C++ member functions at odd addresses and broke calls through pointers to members. Plan note 8 is corrected.
- **Control-flow protection.** `notrack` is rejected, because NASM 3.00 reads it as a label and drops the prefix; the profile already requires `-fcf-protection=none`. `.note.gnu.property` is dropped, and `endbr64` passes through.
- **Never throwing.** No input throws. Lookups keyed by input text use `Map`, a control character inside a line is `unreadable-line`, and the lexer is iterative; a fuzz test covers this.
- **Other rejections.** An executable-stack request (`.note.GNU-stack` with `x`) is rejected, and so are system instructions in compiler output.
- **Optimization levels.** `optimizations` lists all five levels.
- **Known limits.**
    - An external function named like a 64-bit register reads as an indirect call, as GNU as reads it.
    - NASM writes `.init_array` read-only where GCC asks for read-write, which is harmless for a start unit that only reads it.

## Corpus and oracles

`scripts/capture-gcc-fixtures.mjs` is the package's only contact with Compiler Explorer. It refuses hosts other than x86-64 Linux, and records untracked files and the hashes of the binaries it used. It captured 40 programs with GCC 14.2 at O0, O1, O2, O3 and Os: the plan's 25 and 15 more. That gives 187 cases: 146 runnable, 15 link failures and 26 translation errors. It also captured 36 hand-written x87 register forms. The fixtures, 1.7 MB of gzipped JSON, are in `tests/fixtures/gcc-intel-v1/`. One correction to the plan's appendix: `int128` names `__modti3` only at O0 and Os.

The oracles run offline in CI:

- **Corpus outcomes.** Every case reaches its intended outcome in Blink and natively, with no NASM or `ld` warnings.
- **Locations.** They match Compiler Explorer's `source`.
- **Symbols.** The symbol summaries match the NASM objects, and translation is deterministic.
- **GNU references (131 cases).** The translated build is compared with the GNU reference build on:
    - bindings;
    - exact data lengths, computed by an independent reader of GCC's layout;
    - section kinds;
    - alignment;
    - `.init_array` order;
    - data bytes, during the run and at exit;
    - per-step traces of the general registers, flags, XMM, MXCSR and x87 state.
- **x87 matrix.** All 36 forms are checked against Intel's semantics, the reference and native runs.

Every deliberate mutation tried fails at least one oracle. The mutations included a data value, jump-table entries, a dropped constructor, constructor order, x87 operand order, string terminators, bindings, section kind, alignment and SSE state. Before the handoff fixes, the full Core suite passed 2,105 tests with the 2 existing skips in 91.77 s; linking in Blink dominates, at about 0.4 s per build.

## Blink x87 register forms

[fpu.c](../../emulators/x86/libblink/blink/fpu.c) had four bugs, now fixed:

- `FDIV` and `FDIVR` with an `ST(i)` destination (`DC F8+i`, `DC F0+i`) were swapped.
- `FSUBP ST(i), ST(0)` always wrote `ST(1)`.
- `FST` and `FSTP ST(i)` left the destination tagged empty.
- `FUCOMPP` (`DA E9`) was missing and raised an illegal-instruction fault.

Further fixes made before this handoff:

- `FXCH` swaps tags, and an empty-register read returns the negative QNaN indefinite and compares unordered.
- The undefined register encodings `DE D8/DA–DF`, `D9 D1–D7` and `DF E1–E7` raise an illegal-instruction fault. `FENI`, `FDISI` and `FSETPM` remain no-ops.
- `FCOMI`-family and SSE `COMIS`/`UCOMIS` instructions clear OF, SF and AF.

`tests/x87-register-forms.test.ts` has 114 tests, including the complete 512-encoding register matrix. The implementation was compared with native x86-64 Linux executions. Blink still computes x87 values at binary64 precision, rather than the processor's extended precision.

The fetched [Intel SDM 093, Vol. 2A, p. 3-327](https://cdrdv2-public.intel.com/929353/253666-093-sdm-vol-2a.pdf) explicitly states: "The FCOMI/FCOMIP and FUCOMI/FUCOMIP instructions set the OF, SF, and AF flags to zero in the EFLAGS register". Its parenthetical applies this clearing even when an invalid-operation exception is detected.

## Exceptional operands and SSE comparisons

The handoff's floating-point fixes cover values representable in Blink's binary64 x87 registers:

- Addition, subtraction, multiplication and division preserve an operand NaN's sign and payload under the SDM's selection rule, quiet signaling NaNs and set invalid-operation status. Invalid non-NaN operations and empty operands produce the negative indefinite.
- Infinity subtraction keeps the correct sign; division honors negative zero, flags zero divided by zero and infinity divided by infinity as invalid, and reports divide-by-zero only for finite nonzero dividends.
- Memory-form arithmetic preserves signaling NaNs through float-to-double promotion. `FLD` of single or double precision quiets signaling NaNs and sets invalid-operation status, while extended-format loads retain the signaling representation.
- `FUCOM` variants accept quiet NaNs without setting invalid-operation status; signaling NaNs remain invalid. Register writes classify zero, special and ordinary finite tags correctly. A binary64 subnormal is normal in x87's extended exponent range.
- `FXCH` and the `FCOMI` family clear C1. `FENI`, `FDISI` and `FSETPM` preserve every x87 state field, including FIP/FOP; `FNOP` still updates FIP.
- SSE `COMIS`/`UCOMIS` keep MXCSR's invalid-operation flag sticky. `COMIS` raises invalid for either NaN class; `UCOMIS` raises it for signaling NaNs. An unmasked invalid exception occurs before any EFLAGS update, preserving OF/SF/AF as well as ZF/PF/CF.

`tests/fpu-exceptional-operands.test.ts` covers 296 probes plus a native oracle, comparing arithmetic results, NaN payloads, exception status, tags, EFLAGS and no-op pointers with the same linked executable run on native x86-64 Linux. This includes 56 single/double memory-format NaN loads and operations. `tests/sse-compare-exceptions.test.ts` covers 88 register/memory, single/double and masked/unmasked comparison probes plus a native oracle, including sticky invalid status and signal-frame EFLAGS before an unmasked exception. Together the two files pass 386 tests.

One observed documentation/silicon difference is retained explicitly: SDM 093, Vol. 2A, p. 3-328 says the `FCOMI` family's C1 is cleared, but this Intel i7-10750H retains C1 previously set by `FXAM`. Blink follows the handoff's SDM requirement. The two affected native probes permit exactly that one status bit to differ; all other values and bits must match, and the Core's clearing is asserted separately.

Limits: full x87 extended precision and denormals, rounding-control fidelity and general unmasked x87 arithmetic remain outside this change. Blink's signal frame still omits MXCSR serialization/restoration. The focused SSE exception tests therefore reset live MXCSR in the handler and edit the native saved frame before returning; they establish compare and EFLAGS behavior rather than MXCSR signal-frame parity.

## Syscall and signal flags

`SYSCALL` now saves next RIP into RCX and the architectural RFLAGS word into R11 before dispatch, including the `clock_gettime` fast path. Previously both registers were left untouched. Undo of an input syscall restores the pre-instruction register snapshot even though a paused read has already performed these architectural clobbers.

Signal delivery saves the interrupted flags before clearing DF, RF and TF for handler entry, following [Linux's `handle_signal`](https://raw.githubusercontent.com/torvalds/linux/v6.12/arch/x86/kernel/signal.c). Software-generated faults save RF in the frame, while INT3 and final single-step traps do not. CLI, STI, HLT, IN and OUT, including string and REP forms, deliver SIGSEGV at user privilege, with Linux's `SI_KERNEL` code and null fault address; undefined instructions use Linux's `ILL_ILLOPN` code. [Linux's trap mapping](https://raw.githubusercontent.com/torvalds/linux/v6.12/arch/x86/kernel/traps.c) is the reference.

The shipped interpreter samples TF before dispatch: enabling it through POPF takes effect after the following instruction, clearing it through POPF still traps after that POPF, and `rt_sigreturn` steps the resumed instruction. Linux defers a syscall's trap until the first user instruction after the syscall. REP traps between iterations with RIP on the string instruction and RF in the saved frame, then retires normally on the final iteration. These boundaries follow [Intel SDM 093, Vol. 3B, sections 20.3.1.1 and 20.3.1.4](https://cdrdv2-public.intel.com/929360/253669-093-sdm-vol-3b.pdf) and the initial native executions. During the 3.0.1 retry, [branch CI](https://github.com/Specy/x86-js/actions/runs/37244320730) returned RF=0 in the first two native frames for both `REP MOVSB` and `REP STOSB`, whereas earlier hosts returned RF=1. The native oracle permits only that observed RF difference in those two frames; RIP, RCX, signal codes and every other flag remain exact. The Core still has an independent exact assertion requiring the SDM's RF=1. This is a native-host comparison adjustment, with no emulator or WASM changes; the cause of the host discrepancy has not been diagnosed.

`tests/syscall-signal-flags.test.ts` has 38 same-executable comparisons: three syscall paths under five flag words, 28 privileged/fault cases, five TF boundaries and two REP traces. The full architectural export includes RF for fault frames; PUSHFQ/debugger snapshots mask RF and VM separately. `rt_sigreturn` continues to omit RF because the Core has no hardware instruction breakpoints. MOV SS and IRET are unsupported in the shipped `DISABLE_METAL` build; JIT, native-host signal faults and SIGBUS are outside the verified scope. The native host runs Linux 6.18.33.2 under WSL2; Linux v6.12 is the fetched source reference, superseding the handoff's unverified v7.2 reference.

## Evidence for the Runtime library's x86 phase

Probes of Blink's `ld` 2.43.50 found:

- Only the needed indexed members are extracted, and references between members resolve in either order.
- A pulled member that also defines a user symbol is a multiple-definition error.
- An archive without an index fails.
- Weak undefined references pull no member.
- The default `ENTRY(_start)` pulls an archive's `crt0` even without `-u`, and a user `_start` silently wins. This supports linking `crt0` as an ordinary object (requirement 2).

The Core also needs work:

- `entryPointDiagnostics` reports a failed Build when `_start` comes only from a non-Project object or an archive, although the program runs.
- DWARF from non-Project units is attributed to the Entry file's lines.
- `ld`'s multiple-definition messages land on line 1, with raw `/__x86_project/` paths.

## Other fixes

The debugger and flag fixes found along the way are included in the local package.

**PF reported wrong.** Blink keeps PF lazily, as the parity of the last result's low byte stored in bits 24–31 of its internal flags. The bridge handed that raw word to JavaScript, so the flags panel, step history and Pokes showed a stale PF: after `xor eax, eax` the panel said PF 0.

- Every value JavaScript reads is now the word `pushfq` pushes, from `ExportFlags` with the same mask. Writes go through `ImportFlags`.
- Native history exposes architectural flag words and restores them through the bridge, which reconstructs Blink's lazy parity byte.
- Test: `tests/flags-parity.test.ts`.

**Architectural flag words.** `ExportFlags` forces bit 1 on, clears reserved bits 3, 5, 15 and 22+, and reports IOPL 0 and IF 1 for Linux programs. Initial RFLAGS is `0x202`; `INC` and `NEG` now calculate AF correctly. Signal frames save the architectural word and `rt_sigreturn` uses Linux's `FIX_EFLAGS` mask. `tests/rflags-word.test.ts` covers arithmetic, POPF, SAHF, LAHF, SSE compares and signal frames. The earlier audit also compared 3,415 ALU flag cases with native execution.

**Untouched pages read as zeros.** A program's pages become resident on first access. The debugger's reads ran with page faults disabled, so a whole page the program had not touched yet read as unmapped, and the editor's x86 adapter shows zeros for that. This affected `.data`, `.rodata`, `.bss`, heap and stack pages.

- The bridge now reads, writes and spies through `PageInAddress`, which pages in a reserved page exactly as the program's first access would. It takes no lock or TLB entry, raises no signal, and preserves the fault state.
- Truly unmapped addresses still fail.
- Pokes into untouched pages, which used to fail, now work and undo.
- Test: `tests/lazy-pages.test.ts`.

**History rows decoded with the wrong layout.** In the editor, `MutationStep.svelte` decoded every Target's recorded flags with s68k's CCR layout, so x86 and Z80 rows lit the wrong flags.

- Each Target now has its own bit table in `src/lib/languages/statusFlagBits.ts`, with tests. The M68K entry is checked against s68k's decoder for every value.

## Native history and execution recovery

The TypeScript Undo recorder and `X86EmulatorOptions.nativeHistory` option have been removed. Native WASM history is the only recorder; creation requires history packet version 1 and `_blinkenlib_run_slice`, and rejects an incompatible WASM immediately. `initialize(0)` still disables recording. This removes the fallback execution path rather than retaining its breakpoint/Step/Run hang.

`BlinkRuntime` tracks whether a scheduled resume is outstanding and can settle it before a new operation. Run after Step or Undo therefore continues correctly; an exit during `provideInput` is reported to the next Run or Step instead of restarting the program. MXCSR changes are recorded once. `tests/run-undo-scenarios.test.ts` covers the execution and input combinations, with and without history.

The trapped exit now retains machine state before any teardown and releases abandoned syscall bookkeeping, page locks and temporary allocations. The native history entry records that it exited; undoing that entry clears `exited` and `exitcode`, while undoing a Poke made after exit leaves the machine exited. Step, bounded Run, Continue, preemption resume and terminal-input resume safely report a retained exit. Re-executing the exit traps again without freeing the machine or calling the host's `exit`. `tests/exit-undo.test.ts` has 17 regressions covering repeated Step/Run replay, edited exit arguments, both exit syscalls, Pokes after exit and every native resume API. A process watchdog bounds the regression for memory access followed by `munmap` after Undo, which leaked syscall locks could otherwise stall. The dist smoke test also replays exit through Step and Run.

Excluded by the owner: Undo of a Poke that changes only flags. A breakpoint stop after more than one 50,000-instruction slice reported only the last slice's `executedInstructions`; since the interim editor Compile it reports the whole run's, which the editor reads.

## WASM build

`libblink/build/bootstrap/mkdeps.com` is executable, so header dependencies trigger recompilation. Builds use a separate clean copy of libblink and emcc 6.0.9, preserving the shipped configuration and pinning `BUILD_TIMESTAMP`, `BLINK_COMMITS` and `BLINK_GITSHA`. Before these handoff fixes, the clean build reproduced both the 303,774-byte WASM (`f1a65fe7886609e2fd8cbf0fa4d616ac1e50a7fb2c8f77034dd986dc5ae1fec7`) and the JavaScript glue byte for byte. Artifacts are installed through adjacent temporary files and atomic renames; the in-tree `libblink/o` cache is not used.

The final WASM is 316,541 bytes, SHA-256 `cda925c646c6089dd62904faa86dd3aa49186c1a3580c447dda168481153f644`. The source JavaScript glue remains byte-identical. Newly generated glue only removes the unused `invoke_v` import and wrapper: the WASM adds no imports and keeps the same exports, so the retained glue remains compatible, as the runtime and dist tests verify.

## Handoff verification

Verified locally on 2026-10-05 against the rebuilt WASM, after independent review of the Core patches:

| Check                                               | Result                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Core `npm run type-check`                           | Passed, including tests.                                                                                                                   |
| Core `npx vitest run --reporter=dot`                | 2,546 passed, 2 existing skips; 30 files passed and 1 skipped, 136.82 s.                                                                   |
| Core `npm run build` and `npm run test:dist`        | Passed: package bundles, translated constructors, source provenance and exit replay through Step/Run; root still exports 2.8.0's 46 names. |
| Editor flag-bit and MutationStep tests              | 12 passed in 2 files.                                                                                                                      |
| Editor `npm run check`                              | 0 errors, 32 existing warnings in 19 files.                                                                                                |
| Documentation formatting and Core whitespace checks | Passed.                                                                                                                                    |

The final Core suite adds 441 tests to the handoff's 2,105-test baseline. All compiler fixtures and GNU reference oracles remain offline. Editor x86 Compile and its browser acceptance checks remain pending behind the release/runtime prerequisites below; these Core results do not enable or validate that feature.

## Release

The owner authorized publishing on 2026-10-05. `@specy/x86` 3.0.0 is committed at [`f27b5498cc82003e787327527afee92e75c3c832`](https://github.com/Specy/x86-js/commit/f27b5498cc82003e787327527afee92e75c3c832) on `libblink`, with the matching annotated `v3.0.0` tag. [Branch CI](https://github.com/Specy/x86-js/actions/runs/37241844420) and [tag CD](https://github.com/Specy/x86-js/actions/runs/37242012739) passed, including the publish step. Removing the public `nativeHistory` option and requiring native WASM history are breaking API changes, so this is a major release.

On 2026-10-05 the owner requested a 3.0.1 retry while 3.0.0 remained under npm processing. The annotated `v3.0.1` tag points at [`c67429c701b56448ca9432e67db7eede3cd8cff4`](https://github.com/Specy/x86-js/commit/c67429c701b56448ca9432e67db7eede3cd8cff4) on `libblink`. Relative to 3.0.0, only the package version, lockfile and native REP/RF comparison above changed; emulator code and the WASM are identical. [Branch CI](https://github.com/Specy/x86-js/actions/runs/37244755959) passed 2,546 tests with two existing skips, type checking, build and dist smoke checks; [tag CD](https://github.com/Specy/x86-js/actions/runs/37244887982) passed and npm accepted the publish, with signed provenance.

After the owner reported that 3.0.0 had published, the registry check on 2026-10-05 (01:57 Europe/Rome) confirmed its availability, expected Git revision and integrity metadata. The editor now pins the installed registry package at exactly 3.0.0 in its manifest and lockfile. All 42 focused x86 emulator, examples, adapter and history-display tests passed across six files; the editor check reported zero errors and 32 existing warnings. The installed `@specy/x86/compiler-output` subpath also imported successfully with WebAssembly access blocked. Version 3.0.1 remained under registry processing at that check; no further polling is needed to consume 3.0.0 because both releases contain identical production code and WASM.

MIPS and RISC-V 3.7.0 are available with their expected release revisions, successful tag CI/CD and registry integrity metadata. The editor's exact pins, lockfile entries and submodule revisions are committed in `9155858`; 222 focused adapter, compiler and Runtime library tests passed against the installed registry packages. The editor check reports zero errors and 32 existing warnings.

Editor x86 Compile remained disabled until the Runtime library's x86 phase would supply startup, library linking, entry-symbol checking and member DWARF attribution, unless the owner chose an interim start unit, which they did on 2026-10-05 (below). No GNU assembler is introduced into users' Builds.

## Interim editor Compile

On 2026-10-05 the owner chose to ship x86 Compile before the Runtime library's x86 phase, for self-contained programs, with the editor's **Start unit** standing in for `crt0`: [milestone 3a](./x86-compiler-assembly-translation-plan.md#3a-interim-compile-before-the-runtime-library) records the design. The Core changes below shipped in `@specy/x86` 4.0.0, published by the owner the same day from [`f9bc7aa`](https://github.com/Specy/x86-js/commit/f9bc7aa0ad64a55203dc89f9cb22524d76eaa564) with a provenance attestation; the editor release metadata still pins it while the local 5.0.0 adoption is verified. It was a major release because of [ADR 0033](../adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md): a Project's other units now link only as the program needs them. The editor work is uncommitted.

### Core changes in 4.0.0

- Archive linking ([ADR 0033](../adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md)): `compileProject` links the Entry's unit as `/program.o` and puts every other unit, after the new `X86Project.library` units, into `/program.a`, written in TypeScript with a symbol index (`src/archive.ts`, byte-identical to GNU `ar rcsD` in probes), so `ld` takes a unit only for a symbol the program still needs, `_start` included. `X86Emulator.projectLinking` says so to a caller. Every unit is still assembled and checked. Diagnostics name archive members' Files, and a Project whose `library` path collides with a File is refused before anything changes. `tests/project-linking.test.ts` and `tests/archive.test.ts` hold 18 tests.
- `setUndoEnabled(enabled)` and `getUndoDepth()`, named as in RARS. Undo off keeps the wasm recording, which keeps the call stack it tracks; undo back on sets an undo floor at the newest entry's serial, below which nothing can be undone, counted or listed. The depth is found by bisection over serials, which stays exact after undo and new steps interleave and as the ring wraps. A change is refused while a Poke is open, an instruction executes or the program waits for input. `tests/undo-recording.test.ts` holds 17 tests.
- `ldDiagnostics` locates `file:line:` messages and those `ld` prefixes with an object, so a duplicate definition lands on the File and line of the second definition with "first defined in _path_, line _n_", and an undefined reference after no label lands in its own File instead of the Entry's.
- A breakpoint stop's `executedInstructions` counts the whole run.
- `getRecordedEntryCount()` returns how many entries the history has recorded since the emulator was created, one per instruction and one per Poke that changed something, whatever was since undone, hollowed or pushed out of a full ring, and also while undo is off; it stands still under `initialize(0)`. The editor counts a Run slice by it, which the depth cannot do once the history is full. `tests/recorded-entries.test.ts` holds 9 tests, including stops for a limit, a breakpoint, the exit, input and a signal handler.
- Undo capture, in C (`memory.c`, `machine.h`, `syscall.c`): the first store into a reserved page captures its old bytes through `PageInAddress`, and the contiguous writes of one instruction merge into one record, upward or downward, up to the 64 KiB a step captures; `SysRead` keeps a record of its own. A store into memory the bridge cannot read back, such as the anonymous `mmap` pages Blink places inside blinkenlib's shadow range, makes its step irreversible instead of one `undo()` would throw on. The capture tries the TLB's translation first and pages in only when it declines, so it costs nothing measurable. Before, both made the step irreversible: the first store into a `.bss` page or a newly grown stack page, and every string instruction over 16 elements, which GCC writes for `int a[100] = {0}` at `-O0` and for struct copies. `tests/undo-capture.test.ts` holds 28 tests, four of which compare faulting stores with native execution; 24 fail on 3.0.0's wasm.
- A history byte budget, in `debughistory.c`: the packets keep 256 MiB at most, since bigger captures let a loop of 64 KiB clears fill the 2 GiB wasm heap and abort it. Over budget, the oldest entries are hollowed to their 88-byte header and become irreversible, while the ring still counts one entry per step, which the editor's instruction count relies on. 14,000 passes of a 64 KiB `rep stosq` clear under `initialize(200000)` now finish with a 302 MiB heap. The budget's per-step bookkeeping makes a Run with history about 2.5% slower than 3.0.0's, measured over 25 alternating rounds of fresh emulators. The decode cache is keyed by serial and packet length, so a hollowed row is decoded again. `tests/history-budget.test.ts` holds 6 tests.
- The WASM is 318,088 bytes, SHA-256 `ee910b8fc638b84b1cc4d7123d4bbdaf5c8f8cac96e87fce3346ca41ad12d6a1`, built with the recipe under [WASM build](#wasm-build), which first reproduced the shipped 316,541-byte `cda925c6…` from a fresh clean copy; two further clean copies reproduced the new one byte for byte. Its imports are unchanged; its exports gain `blinkenlib_history_recorded` and the test-only `blinkenlib_history_budget`, which the byte-identical glue (`a4527ad8…`) does not bind, so the package reaches them through `wasmExports`.

### Editor

- Compilation: `'X86'` Compilation records with no `assemblerProfile` or `runtimeAbi`; a GCC 14.2-only Compiler Explorer request under the corpus's flags with the Runtime library's freestanding headers; the translator, loaded in a chunk of its own only by an x86 compile; the Source map from the translation's locations; translation Diagnostics on their C lines, with plain wording for inline assembly; a Hint for a standard header x86 does not have; four stored compilations, C and C++ at `-O0` and `-O2`, built and run through the real Core.
- Build: the Start unit, `src/lib/languages/X86/start.asm` (`_start`) and `support.asm` (the rest), handed to the Core as library units by Build, live checking and the language worker when an x86 record's Generated assembly is in the Project, so the linker takes `start.asm` only for a program without a `_start` of its own; an x86 record naming a Runtime ABI blocks the Build with a Recompile notice; the start code run up to `main` before a Debug session opens, outside the Undo history on a Core that can pause it and otherwise behind a floor of GenericEmulator's Undo ledger that Undo never crosses; a Step through start-unit code listed and undone as one History row; a Run slice counting the instructions it ran from the Core's recorded-entry count.
- Diagnostics: the linker's duplicate `_start` and `main`, which now arise only when a File defining one is linked for another symbol, with Hints; a failed Build's own diagnostics kept in Problems, for every Target, until the Files change, since x86 live checking does not link. The live warning on a `_start` beside compiled code, added first, went with ADR 0033.

### Verification

| Check                                                             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core `npm run type-check`, `npm run build`, `npm run test:dist`   | Passed; the root still exports 2.8.0's 46 names.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Core `npx vitest run`                                             | 2,638 passed, 2 existing skips, as the release gate before 4.0.0 was committed.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Editor suite against the published 4.0.0                          | 2,741 passed, 2 skipped (the tests for a Core without the new methods); 2 `lectureSections` tests timed out under load and pass alone. The x86 course exercises pass.                                                                                                                                                                                                                                                                                                           |
| `npm run check`, ESLint, Prettier                                 | 0 errors and the 32 existing warnings; clean.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Real GCC 14.2 output through Compiler Explorer and the local Core | `memcpy` for large struct copies, `memmove`/`memcmp`, `main` without `return`, `argc`/`argv`, constructors and static destructors, virtual and aligned virtual destructors, deleted virtual functions, and a pure virtual call exiting with 134, at `-O0` and `-O2`.                                                                                                                                                                                                            |
| Headless Chrome against the local Core                            | Compile shows the mapped pair; Build stops on `main` with Undo disabled and `main` on the call stack; Step reaches `twice` with its C line highlighted; Run ends with exit status 20 in the start unit, shown read-only; the exit undoes and replays; a default `main.asm` beside `main.c` shows the live warning, then the located link error with its Hint, and both clear when `main.asm` is deleted; Undo steps back across GCC's `rep stosq` zeroing of `int values[100]`. |
| Headless Chrome against the published 4.0.0                       | A default Project's `main.asm` beside `main.c`: Compile shows no warning, Build stops on `main` with Undo disabled and `main` on the call stack, and Run exits with 20; setting `main.asm` as the Entry builds and runs the hand-written program, which exits with 0.                                                                                                                                                                                                           |

### Known limits

- No C library: a program has no input or output except through hand-written NASM Files; `#include <stdio.h>` is a compile error with a Hint; libgcc helpers (`__divti3`, `__popcountdi2`) and `operator new` fail at link.
- The start unit runs 64 static destructors at most, and a History row for a Step through it names `support.asm` or `start.asm` rather than the function. Its string functions are weak: a program's own `memcpy` wins when it is in the Entry, or in a File the linker takes for another symbol, but not in a File nothing else needs, since the linker takes no File for a symbol the start unit already defines.
- Pre-existing, found on the way and not fixed: memory from anonymous `mmap`, which Blink places inside blinkenlib's shadow range, can be neither read by the debugger nor undone, its stores now irreversible rather than throwing on `undo()`; undo does not restore what `uname`, `fxsave` and `pread` wrote, and `readv`, `preadv`, `recvfrom` and `recvmsg` record no writes; string stores and `push` ignore `PROT_READ`. In the editor, the MARS and RARS pacers count a Run slice that stopped early as its whole chunk, so Undo after a Run to a breakpoint can take a Runtime library Step back one instruction at a time; the x86 adapter now counts exactly.

## Inline assembly

Implemented on 2026-10-05 for milestone M2 of the [Environment library plan](./environment-library-plan.md) (decision 1, the amendment to [ADR 0034](../adr/0034-environment-library-is-header-only.md)), so that `<sim.h>`'s `syscall` wrappers translate. It is uncommitted in the submodule and unreleased; the plan names it `@specy/x86` 4.1.0.

- **The subset.** The lines between `#APP` and `#NO_APP` are read by the rules for GCC's own output, so each must be an instruction or directive GCC itself could have written, one to a line, in Intel syntax. GCC substitutes the operands before writing the block, so a register-bound operand arrives as a plain register. Two rules differ from GCC's output:
    - `syscall`, which GCC never writes, is allowed.
    - Every memory operand except `lea`'s needs a size. A probe of both assemblers found NASM picking a size where GNU as calls the operand ambiguous (`inc [rdi]` is a byte, `add [rdi], 1` a word), and a different one where both accept it (`pop [rdi]` is a word to NASM, a quadword to GNU as). GCC writes a size on every memory operand but `lea`'s.
- **GCC's framing.** GCC's line markers around each statement, `# <line> "<file>" 1` and `# 0 "" 2`, are dropped, since `.loc` already locates the statement; GCC's own `.loc`, `.cfi_*` and alignment directives inside a block are read as usual (GCC writes the next C line's `.loc` before `#NO_APP`). A file-scope `asm` opens a block without markers that GCC may never close, which changes nothing about the lines after it.
- **Diagnostics.** Every error on a line inside a block, from any pass, has the code `inline-assembly`, and its message quotes the line: ``inline assembly `movl $1, %eax`: `%eax` is AT&T syntax; ...``. AT&T syntax is named by a `%` register, a `$` immediate or a size-suffixed mnemonic (`movl`). Comments, several statements on one line and numeric labels are rejected with what to write instead.
- **Profile.** The profile stays `gcc-intel-v1`. The output contract makes new constructs a new profile version so that an output never changes within one; every input with `#APP` used to be an error, so no output that existed changes.
- **Corpus.** `inlineasm` (`add %0, 2`) now runs, returning 42, and six programs join it, compiled like the rest and, for `<sim.h>`, with `-nostdinc -isystem sysroot/include` as the editor compiles:
    - `simwrite`: `sim_write`, `sim_exit` and a negative errno from C, inlined and as a local function, writing two lines and exiting with 27.
    - `cppsimwrite`: the same header from C++, through `extern "C"` and an inline member function, with `sim_exit_group`.
    - `cppinlineasm`: `asm("nop")` and a two-line `asm volatile` in an unrolled loop.
    - `toplevelasm`: a function defined by a file-scope `__asm__`.
    - `inlineasmatt` and `inlineasmrept`: AT&T syntax and `.rept`, rejected on their lines; `.rept`'s GNU reference runs, exiting with 7.

    That makes 46 programs and 211 cases: 171 runnable, 15 link failures and 25 translation errors, with 156 GNU references.

- **Oracles.** An `exit` outcome may name its standard output, checked in Blink and natively, and the capture records native output. The capture leaves GCC's line markers out of the GNU reference's input: GNU as reads them as `.linefile` and filed a template's instructions under the C line in the reference's line table. The trace comparison checks `rcx` after a `syscall` against the address after it in each build, since an exit leaves it pointing at whatever each layout put next, and a mutation that turns a `syscall` into a two-byte NOP fails it. GNU as's alignment padding may now sit before a `#NO_APP`.
- **C spelling.** Under `-std=c17`, C has no `asm` keyword, only `__asm__`; C++ has both.
