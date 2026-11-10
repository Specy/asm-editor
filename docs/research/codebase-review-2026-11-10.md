# Editor codebase review (2026-11-10)

A second correctness and simplification review of `packages/asm-editor`, after [the one of 2026-10-26](./codebase-review.md). It found 32 bugs and about 1,650 lines of simplifications. **Nothing was fixed:** this file is the list to work from. Every finding has an id (`emu-1`, `wb-s3`, `site-2`, `tool-1`) to name it by.

Paths are relative to `packages/asm-editor` unless they start at the repository root. Line numbers are those of commit `95a18696`, the head of `main` when the review ran.

## How it was done

1. **Baseline.** `pnpm lint` is clean. `pnpm check` reports 0 errors and 0 warnings over 2,149 files. `pnpm test` passes: 408 files, 8,207 tests passed and 4 skipped, in 213 s. The skipped ones are guarded on a host GCC, the kernel headers or the search model's files.
2. **Sweeps.** A scratch clone finder over normalized lines, a scan of exported names, and counts of event listeners, object URLs and intervals that are never released.
3. **Three reviewers** (Claude Fable 5.2), one area each, each asked for bugs and for simplifications. The previous review's tree is commit `27d1643c`. About 119,000 lines were added across 1,353 files since then, and the reviewers started with that code.

| Reviewer | Area                                                                                                                                   | Non-test lines |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------: |
| `emu`    | `src/lib/languages` (the adapters, peripherals, language services) and `scripts/sim-header`                                            |      about 59k |
| `wb`     | The Workbench, the Project model, storage, stores, compilation, Listings, Pseudocode, their components, `src/routes/projects`          |      about 65k |
| `site`   | The other routes, search, the twins, the Markdown pipeline, documentation, shared components, the build scripts and the service worker |      about 72k |

The Cores (`packages/m68k`, `mips`, `risc-v`, `x86`, `z80`) were not review targets. Reviewers read them where an adapter's correctness depends on the Core.

### How far each finding is proved

- **CONFIRMED** means reproduced with a scratch test, or traced end to end in the code. Each finding says which.
- **PLAUSIBLE** means the code reads that way but the failing case was not run. Each says what was not checked.
- The scratch tests were deleted after their runs. Each finding describes its test well enough to write it again as the regression test of its fix.
- Nothing was run in a real browser. Focus, input methods and service worker timing are unverified.
- After the reviewers reported, nine bugs and one simplification were read again against the code: `emu-1`, `emu-4`, `wb-1`, `wb-3`, `wb-5`, `site-2`, `site-4`, `site-8`, `site-12` and `site-s2`. They hold. For `emu-1`, a loop that pushes to an array and shifts above 200,000 elements was also timed on its own under Node 24.11: the first 200,000 pushes took 17.6 ms, and the next 20,000 took 745 ms.

## Summary

| Id        | Severity      | Status    | What goes wrong                                                                                                   |
| --------- | ------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| `emu-1`   | High          | CONFIRMED | Every Undo journal slows 30 to 50 times once it holds 200,000 records, the default history size.                  |
| `wb-1`    | Medium        | CONFIRMED | Turning Auto save on with unsaved changes saves nothing and hides Save.                                           |
| `site-1`  | Medium        | CONFIRMED | A malformed Playground fence throws out of the Markdown render; an Exam section then shows the previous question. |
| `site-2`  | Medium        | CONFIRMED | Exam links and submission links render their Markdown with the trusted profile.                                   |
| `site-3`  | Medium        | CONFIRMED | The exam builder keeps the exam only in memory.                                                                   |
| `emu-3`   | Medium        | CONFIRMED | Format Document changes NASM string data and indents colon-less labels.                                           |
| `wb-2`    | Medium        | CONFIRMED | An Executable's Listing, Pseudocode and Symbols are blank while the Core loads, and stay blank when it fails.     |
| `emu-4`   | Medium        | CONFIRMED | MIPS and RV32 report a stack pointer above `0x7FFFFFFF` as negative.                                              |
| `emu-5`   | Medium        | PLAUSIBLE | A memory view never notices bytes that become readable (x86 `brk`, `mmap`).                                       |
| `emu-2`   | Medium        | CONFIRMED | The M68K and Z80 Screens journal pixels with Undo off, and keep records Undo can no longer reach.                 |
| `wb-3`    | Low to medium | CONFIRMED | A Build pressed while the Core loads builds the Files as they were at the press.                                  |
| `wb-4`    | Low to medium | CONFIRMED | An editor whose Monaco fails to load keeps the preview and "Loading editor…" for ever.                            |
| `wb-5`    | Low to medium | CONFIRMED | Saving a shared link's Project rebuilds the whole Workbench.                                                      |
| `emu-6`   | Low           | CONFIRMED | `test()` on a program that does not build rebuilds it once per Testcase and reports an empty run.                 |
| `emu-7`   | Low           | CONFIRMED | M68K `run()` or `step()` on a program that ended on an error executes a trap without answering it.                |
| `emu-8`   | Low           | PLAUSIBLE | Testcases pay for a 200,000-step Undo history they cannot use.                                                    |
| `wb-6`    | Low           | PLAUSIBLE | Capitals typed at the code preview run the Shift shortcuts, and a click on the preview is not carried to Monaco.  |
| `wb-7`    | Low           | CONFIRMED | "Show in memory" shows nothing when the debug column is collapsed.                                                |
| `wb-8`    | Low           | PLAUSIBLE | The code preview is capped by lines, not characters.                                                              |
| `wb-9`    | Low           | CONFIRMED | `Draggable` never disconnects its ResizeObserver.                                                                 |
| `wb-10`   | Low           | CONFIRMED | A host panel cannot tell a failed Core from a loading one.                                                        |
| `wb-11`   | Low           | CONFIRMED | A layout change made in the last 200 ms before leaving is not stored.                                             |
| `site-4`  | Low           | CONFIRMED | The Finish prompt left open as the time runs out submits twice.                                                   |
| `site-5`  | Low           | CONFIRMED | `/exam/session?project=…` stays on "Loading exam…".                                                               |
| `site-6`  | Low           | CONFIRMED | In an Exam's Documentation panel, links in entry fields still open a new tab.                                     |
| `site-7`  | Low           | CONFIRMED | Embed builder: Copy within a second of an edit copies the link from before it.                                    |
| `site-8`  | Low           | CONFIRMED | One changelog date is read in local time.                                                                         |
| `site-9`  | Low           | PLAUSIBLE | The service worker holds each uncached response until its whole body is stored.                                   |
| `site-10` | Low           | CONFIRMED | The exam snapshot's 250 ms debounce is never flushed.                                                             |
| `site-11` | Low           | CONFIRMED | The fullscreen-exit count is recorded and shown to nobody.                                                        |
| `site-12` | Low           | CONFIRMED | `encryptData` spreads the ciphertext into `String.fromCharCode`.                                                  |
| `site-13` | Low           | PLAUSIBLE | Enter that confirms an input-method composition opens the selected search result.                                 |
| `wb-12`   | Design note   |           | Autosave has no longest wait (ADR 0076). Not a bug.                                                               |
| `tool-1`  | Low           | CONFIRMED | `mise.toml` pins pnpm 12.7.0 while `packageManager` says 12.17.0.                                                 |
| `tool-2`  | Low           | CONFIRMED | `id()` only ever produces 26 of its 52 letters.                                                                   |
| `tool-3`  | Speed         | Untested  | The test suite spends 131 s creating jsdom 92 times.                                                              |

Totals: 1 high, 9 medium, 3 low to medium and 19 low bugs from the reviewers (26 CONFIRMED, 6 PLAUSIBLE), one design note, and three tooling findings.

## Emulator adapters, peripherals and language services

All timings in this section were taken with scratch tests under Node 24.11 (V8) on a shared, busy machine. Chrome's factors may differ, but the cliffs are an order of magnitude or more.

### emu-1. Undo journals slow down sharply at 200,000 records

High. CONFIRMED (scratch tests, isolated and end to end).

- **Where:**
    - `src/lib/languages/peripherals/TerminalHistory.ts:49`
    - `src/lib/languages/peripherals/screen/ScreenInstructionHistory.ts:25-36`
    - `src/lib/languages/peripherals/FileSystem.ts:690-704`
    - `src/lib/languages/peripherals/screen/ScreenHistory.ts:189-195`
    - The capacity comes from `src/lib/projectSettings.ts:70` (`UNDO_HISTORY_SIZE = 200_000`), and Undo is on by default (`:148`).
- **What happens:** each journal trims its oldest record with `Array.shift()`. On a 200,000-element array that is a full move on every push. Any program that prints, draws, makes syscalls or streams samples more than 200,000 times in one Debug session or Testcase slows permanently from that point.
- **Evidence, isolated** (the first 200,000 records against the next 200,000):

    | Journal                            | First 200k | Next 200k  |
    | ---------------------------------- | ---------- | ---------- |
    | `TerminalHistory`                  | 9.7 ms     | 117,941 ms |
    | `FileSystemSession` (empty frames) | 42 ms      | 7,666 ms   |
    | `ScreenInstructionHistory.record`  | 30 ms      | 29,855 ms  |

    `ScreenInstructionHistory.canUndoAfter` costs 2.6 ms per call at capacity (a linear `find`).

- **Evidence, end to end** (history 200,000 against 0):

    | Program                                        | Before 200k                | After 200k        | Same stretch, history 0 |
    | ---------------------------------------------- | -------------------------- | ----------------- | ----------------------- |
    | MIPS print loop (syscall 11), per 10k prints   | about 65 ms (26 ms per 4k) | 3,252 to 3,497 ms | 35 to 66 ms             |
    | M68K draw-pixel traps, per 10k traps           | about 40 ms                | 1,787 to 2,168 ms | 23 to 34 ms             |
    | MIPS sampled-audio `sw` to Data, per 20k words | about 100 ms               | 3,312 to 3,494 ms | about 40 ms             |

- **Consequences:**
    - At 8 kHz mono the sampled-audio cliff arrives after about 50 s of sound, and sooner at higher rates.
    - `TerminalHistory` is also the journal of `Audio`, `MidiPortDevice`, `SampledAudioDevice` and `InputController`.
    - On MIPS and RISC-V every syscall handler opens a FileSystem frame (`mars/marsHandlers.ts:185-189, 349-359`), and `endInstruction` pushes it even when it is empty. So 200,000 syscalls of any kind reach the cliff.
    - Testcases run with the same 200,000 history (`src/lib/workbench/WorkbenchSession.svelte.ts:4808-4813`) and a limit of 2,000,000 instructions, and the MARS Testcase run is one unsliced Core call. By an estimate from the measured 0.33 ms per print, a program stuck in a print loop would hold the page for minutes per Testcase. That case was not run.
- **Fix:** replace the four `shift()` trims with one ring buffer or a deque with a head index (`emu-s1`). Do not push empty FileSystem frames unless the previous frame has the same id. Binary-search `canUndoAfter`, since positions ascend. Replace `history.find` in the budget eviction (`FileSystem.ts:694`) with a moving index.

### emu-2. The Screen journals pixels with Undo off, and keeps records Undo can no longer reach

Medium. CONFIRMED (scratch test).

- **Where:** `src/lib/languages/peripherals/screen/Screen.ts:1272-1295`; `src/lib/languages/GenericEmulator.svelte.ts:1186-1190` (the budget is applied whatever the Build's undo size); `ScreenInstructionHistory.ts:22-28`.
- **What happens:** on M68K and Z80, whose Screens are not backed by memory, a Build with Undo disabled still copies every drawing operation into `screen.history`, up to the 64 MB budget, though nothing can ever be undone. With Undo on, records older than the oldest retained effect are unreachable but stay until the byte budget evicts them.
- **Evidence:** the M68K draw test with `compile(0, …)` ended with `screen.history depth=240000 bytes=15360000`.
- **Fix:** set the Screen's byte budget to 0 when the Build's undo size is 0 (the Screen then keeps only its sequence counter). When `ScreenInstructionHistory` discards an effect, drop the Screen records below the next effect's `before`.

### emu-3. Format Document changes NASM string data and indents colon-less labels

Medium. CONFIRMED (scratch test).

- **Where:** `src/lib/languages/service/assemblyText.ts:41-49, 102-110` (a backslash is treated as an escape inside every quote), `:141-149`, `:178-191`.
- **What happens:** NASM's `'…'` and `"…"` take no backslash escapes; `X86/x86ScreenDirective.ts:354-372` already has this right. The shared scanner skips the quote after a backslash, splits the operands in the wrong places and joins them again with `", "`.
- **Evidence:**
    - `table: db '/', '\', ',', '.'` formats to `table: db '/', '\', ', ', '.'`: the one-byte string `','` becomes two bytes.
    - `splitAssemblyComment("    db 'C:\\' ; the path", …)` finds no comment.
    - `msg db "Hi", 0` formats to `    msg db "Hi", 0`: the label is taken for an instruction and indented. `name equ 1` goes through the same code path.
- **Fix:** give `AssemblyTextOptions` the quote characters that take escapes (only the backquote for NASM), and recognise NASM's colon-less label before a data directive, as `programSymbols.ts` (`NASM_DATA`) already does. `emu-s5` is the same change.

### emu-4. MIPS and RV32 report a stack pointer above 0x7FFFFFFF as negative

Medium. CONFIRMED (scratch test).

- **Where:** `src/lib/languages/MIPS/MIPSEmulator.svelte.ts:128-130`; `src/lib/languages/RISC-V/RISC-VEmulator.svelte.ts:117-121`.
- **What happens:** a program whose `$sp` points into kernel data (an interrupt handler's own stack, an OS-style example) gets a Stack memory tab at a negative address and a Stack region that starts below zero. The memory views then tint everything under the stack top as Stack.
- **Evidence:**
    - MIPS, `la $sp, kstack` in `.kdata`: `sp = -0x6fffffc0`, Stack tab address `-0x6fffffc0`, region `-0x6fffffc0..0x90000040`.
    - RV32, `li sp, 0x90000040`: the same `sp`, region `-0x6fffffc0..0x7fffeffc`.
- **Fix:** read it unsigned, `BigInt(sp >>> 0)`, as `_getPc`, `_getStackTop` and the Call stack already do.

### emu-5. A memory view never notices bytes that become readable

Medium on x86. CONFIRMED in the function; reaching it on x86 is PLAUSIBLE.

- **Where:** `src/lib/languages/memoryPage.ts:51-54`, and the assumption in its documentation at `:25-27`; called on every refresh from `GenericEmulator.svelte.ts:876`.
- **What happens:** with a `previous` mask at the same address, only the runs known readable are read again and the old mask is returned. The documentation says "the memory map does not change while a program runs", which stopped being true with x86's `brk`, `mmap` and library loading. A view parked on a page that is not mapped yet keeps showing "unreadable" after the program maps it, until the user navigates away and back.
- **Evidence:** a page with bytes 8 to 15 unmapped, then mapped, read again with `previous`, still returns the mask `0000000011111111` and fill bytes. A wholly unmapped page that is mapped later stays `1111111111111111`.
- **Not checked:** the real x86 Core was not driven through a `brk`.
- **Fix:** try the whole page once before trusting the mask, and drop the mask when the adapter says mappings may have changed (x86 already has `mappingsMayChange`). A Core call that says which bytes of a range are mapped would be better (`emu-s8`).

### emu-6. `test()` on a program that does not build rebuilds it once per Testcase and reports an empty run

Low. CONFIRMED (scratch test).

- **Where:** `src/lib/languages/GenericEmulator.svelte.ts:2637-2683`.
- **What happens:** a `CompilationFailedError` that is not an Arguments problem is caught per Testcase and logged, and the loop goes on. The caller receives `[]` with no rejection.
- **Evidence:** M68K source with `movee` and three Testcases: three identical failed Builds, `results: []`, and the Terminal holds `"⏳ Running tests...\n\n"` and nothing else.
- **Fix:** rethrow a Build failure out of the loop so the caller reports one failed Build.

### emu-7. M68K `run()` or `step()` on a program that ended on an error executes a trap without answering it

Low. CONFIRMED (at the API level).

- **Where:** `src/lib/languages/M68K/M68KEmulator.svelte.ts:1897`; `GenericEmulator.svelte.ts:1883, 2404` check only `canExecute`.
- **What happens:** after an instruction-limit error, `run(4)` runs the next `trap #15`, skips its handler because `state.terminated` is still set, and fails with "Attempted to run emulator with pending interrupt". The trap's output is lost and the PC has moved. One Undo repairs it.
- **Reachability:** the Workbench controls and the coding agent both refuse to execute a terminated program, so today only a direct caller reaches this. `runInternal`'s own comment ("if it managed to run…") shows the path is expected to work.
- **Fix:** either refuse `run` and `step` while `state.terminated`, or drop the `state.terminated` test in `answerInterruption` (the Core's own status already says whether it ended).

### emu-8. Testcases pay for a 200,000-step Undo history they cannot use

Low (speed). PLAUSIBLE. It crosses into the Workbench area.

- **Where:** `src/lib/workbench/WorkbenchSession.svelte.ts:4808-4813`; `src/components/shared/InteractiveInstructionEditor.svelte:407`; `GenericEmulator.svelte.ts:2695-2697` (`canUndo = false` after tests).
- **What happens:** each Testcase runs with full journaling. In the MIPS print loop, 185,000 prints took 1,524 ms with history against 926 ms without, before the cliff of `emu-1`.
- **Not checked:** whether anything depends on more than the 20 visible History rows after a test run.
- **Fix:** pass `VISIBLE_HISTORY_STEPS`, or 0, for test runs.

### Simplifications

| Id        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Lines saved                                | Risk                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `emu-s1`  | **One bounded journal.** `TerminalHistory`, `ScreenInstructionHistory.effects`, `FileSystemSession.history` and `ScreenHistory.records/costs` each write "push, then trim the oldest" by hand. One ring-buffer class used by all four fixes `emu-1`. A small journal group could also replace the repeated `track(position, capacity)` and `undoAfter(position)` lists in the four adapters' `_initialize` and `_undo`.                                                                                                                                                                                                                                    | about 40                                   | Low; all four are well tested                                              |
| `emu-s2`  | **A shared skeleton for the three MIPS/RISC-V devices.** `mars/MidiPortDevice.ts:403-448, 643-664`, `mars/SampledAudioDevice.ts:120-160, 396-424` and `mars/InputController.ts:113-162, 404-407` repeat `bus`, `covered`, `base`, `history`, `connect`, the start of `reset`, `setCovered`, `isCovered`, `track`, `push` and the loop that restates the touched words. A small base class holds them.                                                                                                                                                                                                                                                      | 50 to 70                                   | Low                                                                        |
| `emu-s3`  | **The `@screen` entry tokenizer, written four times.** `X86/x86ScreenDirective.ts:201-225` and `:238-255`; `mars/screenDirective.ts:265-284` and `:439` on. One generator that yields `{name, value}` or `{stray}`.                                                                                                                                                                                                                                                                                                                                                                                                                                        | about 40                                   | Low                                                                        |
| `emu-s4`  | **Poke rows built per adapter.** `pokeWriteToMutation` and the `kind: 'poke'` step literal exist in `M68K/M68KEmulator.svelte.ts:3033-3046`, `Z80/Z80Emulator.svelte.ts:1057-1074` and `mars/MarsEmulator.svelte.ts:898-951`, and differ only in the register size. One helper in `commonLanguageFeatures` that takes `sizeOf(name)`. It would also correct M68K reporting a poked SR as a Long.                                                                                                                                                                                                                                                           | about 40                                   | Low                                                                        |
| `emu-s5`  | **One quote scanner.** `assemblyText.ts:41` and `:102` are the same loop; `nasmComments` in `x86ScreenDirective.ts:354` and `formatSeparators` in `M68K/M68K-language.ts` are two more. One scanner with an escape rule per dialect is the fix for `emu-3`.                                                                                                                                                                                                                                                                                                                                                                                                | about 30                                   | Low                                                                        |
| `emu-s6`  | **`GenericEmulator.runTestcase` is called only by tests.** `GenericEmulator.svelte.ts:2502-2523` has about 20 test call sites and no caller in the app. `runTestcaseInternal` also returns `TerminatedWithException` on success, which nothing reads. Remove the method and the return values; the tests move to `test()`.                                                                                                                                                                                                                                                                                                                                 | about 25 production lines                  | Medium effort                                                              |
| `emu-s7`  | **The ledger's `floor` segments and `_canUndoSteps`.** `GenericEmulator.svelte.ts:151, 1126, 1243, 1355-1356, 1397` and the fallback chain at `:1140-1142`. Both adapters with library code (MARS, x86) implement `_setUndoRecording` and `_canUndoHistoryRange`, and the MARS `_canUndoSteps` is literally `_canUndoHistoryRange(0, n)`. No test mentions `floor`.                                                                                                                                                                                                                                                                                        | about 25                                   | Low                                                                        |
| `emu-s8`  | **Let the Cores say which bytes are mapped.** `memoryPage.ts` (about 85 lines of byte-by-byte probing, binary search and mask caching) exists because a Core read fails for the whole range. A Core call that returns the readable sub-ranges replaces it and removes `emu-5`.                                                                                                                                                                                                                                                                                                                                                                             | about 60 editor lines                      | Core work in up to five packages; trivial where memory is flat (Z80, M68K) |
| `emu-s9`  | **Move `clear()` and the first `semanticCheck()` out of the base constructor.** `GenericEmulator`'s constructor calls both before the subclass fields exist, so the adapters carry guards: `this.devices?.` (`mars/MarsEmulator.svelte.ts:626-630`), `if (this.display)` and `this.notedSyscalls?.` (`X86/X86Emulator.svelte.ts:696, 960-974`), `this.device?.` (`Z80/Z80Emulator.svelte.ts:182-190`), the "must be a method, not an arrow field" errors in `createRegisterFiles`, and a second `semanticCheck()` at `X86Emulator.svelte.ts:668`. Every adapter is already made through a factory function, which can call a `start()` after construction. | about 40, and a class of ordering mistakes | Medium                                                                     |
| `emu-s10` | **Dead exports and stale notes.** Named only by tests: `hasX86Description` (`X86/X86-documentation.ts:680`), `x86FormRuns` (`X86/x86Support.ts:117`), `hasGlyph` (`peripherals/screen/bitmapFont.ts:148`). Named nowhere: `statSize` (`mars/marsFolders.ts:43`), `INPUT_KIND_NONE` (`inputControllerRegisters.ts:136`), `SLOT_COUNT` (`peripherals/audio/Audio.ts:101`). Stale notes: `//TODO should this be state?` at `GenericEmulator.svelte.ts:449` (it already is deep state) and the three-line `/*TODO` at `M68K/M68K-documentation.ts:2556`.                                                                                                       | about 25                                   | None                                                                       |

### Looked at closely and found sound

- **The run scheduler and the Undo ledger** in `GenericEmulator`: `sliceLoop`, pause, supersession, the Poke paths. In the MIPS Core an interrupt entry counts as an instruction (`Simulator.java`, `instructionsRun++` in the `finally`), so the ledger and the Core's Undo groups stay aligned.
- **`ExecutionController`.**
- **`LanguageWorkerManager`:** its three listeners are on a Worker that is terminated, so nothing leaks.
- **`MarsDevices`:** receiver and transmitter, interrupt lines, the dirty-block flush, the memory-owner guard, and the order of attach and track in `_initialize`.
- **`MidiPortDevice`, `SampledAudioDevice`, `InputController`:** register semantics against their register tables, drain arithmetic, virtual-clock waits, Undo records. `TimelineSound` copies the buffers it is handed, so the parser buffer and the pending-frame views are not aliased.
- **Terminal Undo** (`Terminal.svelte.ts`'s journal and `undoAfter`, the keystroke put-back), apart from the cost in `emu-1`.
- **`FileSystemSession`:** folder calls, inverses, append-buffer reuse (`fileBytes` always returns a fresh buffer of the exact size).
- **`x86Input`, `Keyboard`, `Mouse`:** the edge rules; wheel notches are integers.
- **M68K:** IRQ timers, the `stop` wait and wake, limit then Undo then Step. **Z80:** run, step, undo, input positions.
- **`ProgramClock`, and Audio's lifetime** (one Audio per Emulator; `reset` disposes the nodes).
- **The sim-header exports the scan called unused** are used by `src/lib/sourceRuntime/x86DeviceHeaders.test.ts`.
- **A `@screen` size that stays after the comment is removed** is by design (`syncDisplay` saves it to the Program).

### Not reached

- **x86 adapter:** Listings, libraries and the Executable paths (`X86Emulator.svelte.ts`, about lines 1265 to 1900); the raw-mode hand-over in depth; `x86Project`, `x86Support`.
- **M68K:** History rendering (`stepMutations`, stack swaps), `M68kUtils`, `M68K-language`, the sound traps in depth.
- **Z80:** `Z80Device`'s ports and the TRS-80 display.
- **Screen and audio internals:** `Screen.ts`'s drawing primitives; `synthesizerEngine`, the chips, `pcmCore`, `browserAudioOutput`, `Synth.ts`.
- **Other language modules:** `registerFormats`, `memoryRegions`, `demangle/`, `languageDetector`, `exceptionHandlerScan`, the RISC-V CSR and interrupt naming.
- **`service/`:** the adapters, the workers, the session registry and the second half of `projectAssemblyLanguage.ts`.
- **The sim-header generator's internals** (`deviceTable`, `deviceHeaders`, `simHeader`) and `measurements/`.

## The Workbench, the Project model and what a Build produces

Three findings were reproduced with scratch tests; the rest are traced in the code. Commit `95a18696`, which shows the Workbench before its Core has loaded, holds up at the session level. Its one real gap is `wb-2`.

### wb-1. Turning Auto save on with unsaved changes saves nothing and hides Save

Medium. CONFIRMED (scratch test).

- **Where:** `src/lib/workbench/WorkbenchSession.svelte.ts:1631-1636` (`changed`), `:1660-1671` (`saveNow`); `src/routes/projects/[project]/+page.svelte:175-179` (`unsaved`).
- **What happens:** with Auto save off, edit a Project, then switch Auto save on in Settings. The Save button disappears and nothing is saved until the next change. A reload, closing the tab or the browser's Back then loses the work without a prompt. Only the top bar's Back and Home still ask.
- **Evidence:** `changed()` returns before it sets `autosavePending` when the Preference is off, so `saveNow()` later has nothing to save. The page's `unsaved` is `dirty && (!autoSave || lastSaveFailed)`, which turns false. The test: edit with Auto save off, turn it on, wait three times `AUTOSAVE_DELAY`, dispatch `pagehide`, call `saveNow()`; `onSave` was called 0 times.
- **Fix:** set `autosavePending` in `changed()` whatever the Preference is, and start the debounce when the Preference turns on while a change is pending.

### wb-2. An Executable's Listing, Pseudocode and Symbols are blank while the Core loads, and stay blank when it fails

Medium. CONFIRMED (scratch test; the Symbols part is traced).

- **Where:** `WorkbenchSession.svelte.ts:470-485` (`listingFor` needs `emulator.listings`); `src/lib/workbench/EditorGroup.svelte.ts:586-602`; `src/components/specific/workbench/EditorPane.svelte:384`; `SymbolsPanel.svelte:135-149, 479-491`; `src/lib/languages/X86/X86Emulator.svelte.ts:602`.
- **What happens:** open an x86 Project whose tab is an ELF (a binary import, a CTF challenge). Until the Core arrives the pane is an empty read-only editor with no notice. If the Core fails it stays empty for good, and the Symbols panel shows "Generating the Listing…" for ever. Before `95a18696` the Workbench waited for the Core, so the Listing started at once.
- **Evidence:** a test with `pendingCore` and `crackme`, both while loading and after `failToLoad`: `view: 'listing'`, `listing: null`, `modelIdentity` set, `code: ''`, `listingFor: null`.
- **Fix:** let the session own `ListingDocuments`, as it already owns `PseudocodeDocuments`; it only needs `listingClient`, not the Core. That would also remove the `emulator?.listings` chains in the session, `EditorGroup` and the search host. Failing that, show "Loading the x86 emulator…" or the failure in the notice's place.

### wb-3. A Build pressed while the Core loads builds the Files as they were at the press

Low to medium. CONFIRMED (scratch test).

- **Where:** `WorkbenchSession.svelte.ts:4518` (where `sources` is read) against `:4537` (the wait); `:3146-3148` (`filesLocked` leaves out `building`).
- **What happens:** press Build while "Loading the … emulator…" shows, then delete, rename, create or upload a File in the Explorer, which is not locked. The Debug session runs the old Files, a deleted one included. `test()` reads `sourceInput` after its wait (`:4809`), so the two differ.
- **Evidence:** the test calls `build()`, deletes `lib.inc`, adds `extra.asm` and lets the Core arrive. `compile` received `['main.asm','lib.inc']` while the Project had `['main.asm','extra.asm']`.
- **Fix:** add `this.building` to `filesLocked` and `uploadRefusal`, as `fileEdited`, `changeFileBytes` and `programsLocked` already have it. That also covers the seconds an x86 compile takes. Or read `sourceInput` after the wait.

### wb-4. An editor whose Monaco fails to load keeps the preview and "Loading editor…" for ever

Low to medium. CONFIRMED (traced).

- **Where:** `src/components/specific/project/Editor.svelte:307-313` (an async `onMount` with no catch), `:1202-1213`.
- **What happens:** offline, or after a deploy removed the chunk, `Monaco.get()` or `registerLanguage` rejects. The pane keeps the read-only preview with its spinner and a `progress` cursor, with no message and no retry. A failed Core gets a notice and Reload; Monaco gets nothing, though it fails for the same reasons.
- **Evidence:** the rejection leaves `onMount` unhandled and `editor` is never set. `lazyLoad` retries only on a later call, which never comes.
- **Fix:** catch it, set a failed state and show "The editor didn't load" with Reload.

### wb-5. Saving a shared link's Project rebuilds the whole Workbench

Low to medium. CONFIRMED (traced).

- **Where:** `src/routes/projects/[project]/+page.svelte:552` (`{#key project.id}`), `:339-353`; `src/lib/storage/db.ts:151`.
- **What happens:** open a shared link, edit, Build, then Save and answer Yes. `addProject` gives the Project its id, the key remounts the Workbench, and the Debug session, Monaco's undo history, the open panel, the cursors and the session's Edit history are gone.
- **Evidence:** the page loads a Project only in `onMount`, so this change of id is the only thing the key ever reacts to.
- **Fix:** drop the key. The session already reads `host.editJournals` through a getter; the journals made while shared would need registering with the new store. The key predates the last review, so this is the owner's call.

### wb-6. Capitals typed at the code preview run the Shift shortcuts, and a click on the preview is not carried to Monaco

Low. PLAUSIBLE (traced, not run in a browser).

- **Where:** `WorkbenchSession.svelte.ts:4912-4929`; `src/components/specific/project/EditorPreview.svelte`.
- **What happens:** the code is now on screen 0.5 to 1.1 s before Monaco. Someone who clicks it and types sends the keys to `window`: Shift+D opens Documentation, Shift+P opens Settings, Shift+B starts a Build. Monaco does not take the focus when it mounts, so this lasts until the next click.
- **Evidence:** `handleKeyDown` exempts only `INPUT`, `TEXTAREA` and `.monaco-editor`; the preview is a `<pre>` that takes no focus.
- **Fix:** remember a pointer down on the preview and focus the editor at that spot when it mounts; skip the single-key shortcuts while the focused pane waits for Monaco.

### wb-7. "Show in memory" shows nothing when the debug column is collapsed

Low. CONFIRMED (traced).

- **Where:** `src/components/specific/workbench/pointerMenu.ts:34-41`; `DebugColumn.svelte:142`; `WorkbenchCompact.svelte:177`.
- **What happens:** with the column on its strip (or "Registers & memory" folded on a tablet or phone), a Symbols row without a definition, or the menu's Show in memory, moves the memory page out of sight.
- **Evidence:** `showInMemory` undoes the hidden-memory Preference but never calls `setDebugCollapsed(false)` or unfolds `compact:registers`.
- **Fix:** do both there.

### wb-8. The code preview is capped by lines, not characters

Low. PLAUSIBLE (the tokenizer was measured, the DOM was not).

- **Where:** `EditorPreview.svelte:31-41`.
- **What happens:** a File whose first 200 lines are very long (generated `.byte` or `.word` tables, a minified text File) is tokenized whole and gets a span per token before Monaco loads.
- **Evidence:** 150 lines of 20,000 values (13.7 MB) took 1.9 s in `tokenizeAssembly` for 6.0 million spans, and 5.3 s in `tokenizeCpp`. The site's own examples have short lines.
- **Fix:** also cap the characters shown, and the characters per line, as Monaco does.

### wb-9. `Draggable` never disconnects its ResizeObserver

Low. CONFIRMED (traced).

- **Where:** `src/components/shared/draggable/Draggable.svelte:33-42`.
- **What happens:** the effect disconnects only when it runs again, so a destroyed window's observer keeps observing and its debounced callback can fire once more. It returns at once then; nothing is visible.
- **Fix:** return `() => observer.disconnect()` from the effect and clear the debouncer.

### wb-10. A host panel cannot tell a failed Core from a loading one

Low. CONFIRMED (traced).

- **Where:** `src/lib/workbench/hostApi.ts:37-41`; `src/components/specific/exam/ExamAssemblySection.svelte:76-84`.
- **What happens:** the exam's review panel shows "Loading emulator…" for ever when the Core failed.
- **Fix:** add `coreStatus` to `WorkbenchPanelContext`.

### wb-11. A layout change made in the last 200 ms before leaving is not stored

Low. CONFIRMED (traced).

- **Where:** `src/stores/workbenchLayoutStore.svelte.ts:184-194`.
- **What happens:** collapse the column or drop a window, then reload at once; the write's timer never fires.
- **Fix:** write on `pagehide` too.

### wb-12. Autosave has no longest wait

A design note, not a bug: ADR 0076 chose the 3 s debounce.

- **Where:** `WorkbenchSession.svelte.ts:1631-1636`.
- **What happens:** each change restarts the 3 s wait, so typing without a 3 s pause is never saved until the page is hidden or closed. A crash loses everything since the last pause.
- **Possible change:** a cap, such as a save at least every 30 s.

### Simplifications

| Id       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Lines saved                                                                 | Risk                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| `wb-s1`  | **Host props nobody passes: `onBack`, `onShare`, `hostLinks`.** In `hostApi.ts`, `WorkbenchShell.svelte`, `workbenchContext.ts`, `workbenchRail.ts` (`link()`), `IconRail.svelte` (the Back button, `withBack`, the `entry.action` branches), `SidePanel.svelte:64`, `WorkbenchCompact.svelte:96`. The project page uses its own `header` and the exam passes none of them. The Examples page's `onShare` goes to `ProjectTopBar`, not the Workbench.                                                                                                                                                                                         | about 60, plus `hostLinks: []` in two tests                                 | Low; it narrows ADR 0024's host API                 |
| `wb-s2`  | **One `MemoryArea.svelte`.** `DebugColumn.svelte:167-216` and `WorkbenchCompact.svelte:199-234` repeat the `MemoryControls` and `MemoryVisualiser` block with the same props. `RegistersArea` and `ScreenArea` already exist for the same reason.                                                                                                                                                                                                                                                                                                                                                                                             | about 30                                                                    | Low                                                 |
| `wb-s3`  | **Dead exports and methods only tests call.** Named nowhere: `hasExecutable` (`src/lib/executables.ts:52`), `R_X86_64_64` (`src/lib/listing/elfModel.ts:25`). Named only by tests: `resetLocal` (`annotations.ts:190`), `pseudocodeVariableAt` (`pseudocodeMap.ts:256`), `loadedEnvironmentHeader` and `hasEnvironmentLibrary` (`environmentLibrary.ts:78, :60`). Session methods only tests call: `renameLabel`, `renameVariable`, `setComment`, `setFunctionComment` (`WorkbenchSession.svelte.ts:2152-2204`); the UI goes through the prompts. The other test-only exports that were checked are used inside their own files and are fine. | about 75 plus their tests; about eight test files move onto the prompt path | Low                                                 |
| `wb-s4`  | **"Built at the first Build" written three times.** `WorkbenchShell.svelte:96-100`, `WorkbenchDesktop.svelte:67-71`, `WorkbenchCompact.svelte:115-119`, each a `$derived.by` that writes a plain `let`. One flag on the session or on `WorkbenchUi`.                                                                                                                                                                                                                                                                                                                                                                                          | about 10                                                                    | Low                                                 |
| `wb-s5`  | **Desktop and Compact repeat two more blocks:** the `restoring`/`wasMaximized` effect, and the `growForProgramIo` set-up with `resizeBottom`, in `WorkbenchDesktop.svelte` and `WorkbenchCompact.svelte`. Move both into `WorkbenchUi` or one helper.                                                                                                                                                                                                                                                                                                                                                                                         | about 25                                                                    | Low to medium; the phone conditions differ slightly |
| `wb-s6`  | **`released` duplicates `disposed`.** `WorkbenchSession.svelte.ts:350, :648`. Both mean the session is gone and are always checked together (`:1341`, `:1356`). Have `mount`'s cleanup set `disposed`. `projectSearch.dispose()` and `pseudocode.dispose()` are also called in both teardowns (`:1024-1025`, `:1560-1561`).                                                                                                                                                                                                                                                                                                                   | about 8                                                                     | Low                                                 |
| `wb-s7`  | **Forwarders in the session.** `filesChanged()` (`:1650`) only calls `changed()` and has one caller. `wakeAudio()` (`:4687`) only calls the import, now that the x86 exception is gone. `runCode()` (`:4647`) has one caller.                                                                                                                                                                                                                                                                                                                                                                                                                 | about 20                                                                    | None                                                |
| `wb-s8`  | **Settings pushed into the Emulator in three places:** `attach` (`:1370-1373`), `applySettings` (`:1718-1720`), `applySelection` (`:1828-1830`), the same three setters each time. One private helper.                                                                                                                                                                                                                                                                                                                                                                                                                                        | about 8                                                                     | None                                                |
| `wb-s9`  | **`EmulatorLoader` leftovers.** `failureActions` is passed by nobody since `95a18696`. `code` is `$bindable` but never written, so `bind:code` on it does nothing. The audio Preferences `$effect` is identical in `EmulatorLoader.svelte` and `Workbench.svelte`.                                                                                                                                                                                                                                                                                                                                                                            | about 15                                                                    | Low                                                 |
| `wb-s10` | **Strip and collapse button styles repeated** in `DebugColumn.svelte:290-345` and `MemoryStrip.svelte:60-108`. One class in `workbench.css`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | about 25                                                                    | Low (visual)                                        |

On one Emulator loader for both the Workbench and the other pages: `EmulatorLoader.svelte` and the Workbench already share `startEmulator`. Merging further would make the embed, exam, lecture and chat pages handle a missing Emulator. Not worth it.

The 433 exports used only in their own file could lose `export` but save no lines; they are not listed.

### Looked at closely and found sound

- **Every `session.core` call site.** `DebugColumn`, `DebugToolContent`, `ScreenArea`, `RegistersArea`, `DebugToolsFloating` and `pointerMenu` mount or run only after a first Build. Run, Step, Undo and Pokes are reachable only in a Debug session, and the shortcuts check `emulator` first. A share link's `buildAndRun` and a test run wait for the Core. Nothing keeps an Emulator across `{#key project.language}`.
- **`attach()`.** Breakpoints set while loading (toggled, renamed and deleted ones included), Settings, a changed Selected program and Display all reach the Core. An Emulator that arrives after the Workbench went is disposed, and that touches only its own peripherals, not the shared `project.fileSystem`.
- **The loading paths.** A failed load, Cancel and Stop during the waits, an unmount during a wait, the Log effect's first run, and the `{#key terminal}` swap.
- **The save path.** The raw IndexedDB transaction, `localWrites`/`settled`, the journals' `take`/`putBack`, the linked-file queue, the page's `changes` counter, and `saveNow` on `pagehide`, `visibilitychange`, unmount and `beforeNavigate`.
- **`projectArchive.ts`.** The Worker limits in `zipped` and `unzipped`, the bounds in `entryPlaces`, and the size and duplicate checks.
- **`projectFiles.ts`.** The checked-record caches, `utf8Length`, `textFile`.
- **`editJournal.ts`.** The fit checks and the budgets.
- **Listeners and observers.** The Worker clients (`projectSearch/searchClient.ts`, `listing/listingClient.ts`, `pseudocode/pseudocodeService.ts`) listen on Workers they terminate. `fileDrops.ts` listens for the page's lifetime on purpose. Every other observer in the area disconnects, apart from `wb-9`.
- **`ScreenRenderer.svelte`.** The canvas and context swap, the input release and the listener clean-up.
- **`quickFixes.ts`.** The version guards.

### Not reached

- `PixelEditor.svelte`, `HexEditor.svelte`, `FilePreview` and `MarkdownPreview`.
- `SearchPanel`'s markup, and `projectSearch`, `pseudocode` and `listing` in depth (little changed since the last review).
- `sourceCompilation/**`, `sourceRuntime/**`, `sourceLanguageHelp/**`, `annotations/**`.
- `MemoryControls`, `MemoryRenderer`, `RegisterFileRows`, `ValueDiffer`, `MutationStep`, `DisplayConfigurationForm`.
- The geometry in `screenWindow.ts` and `screenZoom.ts`.
- `FileTabs`, `EmptyEditor`, `EditHistoryPanel`, `ProjectCard`.
- `themeStore`, `preferencesStore`, `testcases.ts`, `buildOutput.ts`, `buildSources.ts` (`linkUnits`), `favouredNames.ts`.
- Two tabs on one Project is known and deferred (ADR 0076), so it is not reported.

## The site, search, documentation, shared components and build scripts

The exam flow and the Markdown pipeline hold the bugs that matter. Search and the static site (the twins, the sitemap, `llms.txt`) came out sound.

### site-1. A malformed Playground fence in user-written Markdown throws out of the render, and an Exam section then shows the previous section's question

Medium. CONFIRMED (scratch tests).

- **Where:** `src/lib/content/markdownPlaygrounds.ts:185`, `:198-199`, `:226`; the throws are in `src/lib/content/playgrounds.ts:133-142`, `:188`, `:198-202`. Reached from `src/routes/exam/session/+page.svelte:963`, `:995`, `:1376`, `src/components/shared/markdown/MarkdownEditor.svelte:62` and the Workbench's Markdown Preview.
- **What happens:** a prompt that holds a fence opened with ` ```c|playground ` makes `renderMarkdown` throw. So does any of: no `target=` or `file=` on a C fence, a C fence for M68K or Z80, `entry=` without `file=`, an invalid `file=` path, two files of one name. In the session, Next from one open question to such a section changes the header to "Section 2" but leaves section 1's question on screen, with the error only in the console. The student answers the wrong question.
- **What happens elsewhere:** when the prompt card is made new (the section before was a coding one), nothing of it is drawn. The builder's Preview stays on the last text that rendered, so the teacher sees no error either.
- **Evidence:** `renderMarkdown` threw for all six variants under both `links: 'disabled'` and `untrusted`. In the mounted session: `after Next: part shows: "Section 2 · Open question First question. Your answer" | count: 2 / 2`, plus an unhandled "A C/C++ playground needs a target= architecture".
- **Fix:** catch in `transformPlaygrounds`, log, and leave the fence as an ordinary code block. `attachedTestcases` and `twins/rewrite.ts` already do this. The content test has its own strict walker and stays strict.

### site-2. Exam links and submission links render their Markdown with the trusted profile

Medium. CONFIRMED (scratch test of the sanitiser's output).

- **Where:** `src/lib/content/markdown.ts:124-131`; `src/routes/exam/session/+page.svelte:963`, `:995`, `:1376`. A submission link without an access password opens straight into review at `:837-846`.
- **What happens:** anyone can write an exam link. Its prompts keep `style` attributes, cross-origin `<iframe src>`, `<form action="https://…">` with inputs and a button, and `<video autoplay>`. A `position:fixed; inset:0` div covers the whole page. A crafted submission link shows this on the site's origin without a click.
- **Evidence:** the sanitiser's output for both profiles. Scripts, `on*` handlers, `srcdoc`, and `javascript:` and `data:` frames are stripped, so there is no script execution. The same input under `untrusted` loses the style, the frame and the form.
- **Fix:** render exam prompts and instructions with `untrusted`, in the builder's preview too, or add an exam profile that keeps Playgrounds but drops styles, frames and forms.

### site-3. The exam builder keeps the exam only in memory

Medium. CONFIRMED (by reading).

- **Where:** `src/routes/exam/+page.svelte:60-79`. The file has no storage, no `beforeNavigate`, no `beforeunload`, and never reads `page.url`.
- **What happens:** a reload, Back or a navbar link discards every section without a word. A link once made cannot be opened again to fix a typo.
- **Fix:** keep a draft in localStorage and confirm before leaving while it differs, as the Examples page does. Optionally load `?exam=` into the builder.

### site-4. The Finish prompt left open as the time runs out submits twice

Low. CONFIRMED (scratch test).

- **Where:** `src/routes/exam/session/+page.svelte:659-675`; the auto-submit effect is at `:886-893`.
- **What happens:** the timer submits and copies the link. Answering Yes afterwards submits again, stamps `Date.now()` over the deadline, and overwrites the clipboard.
- **Evidence:** `copies of the submission link: 2`, the second stamped 1,172 ms after the deadline.
- **Fix:** check `isSubmitted` again after the `await`.

### site-5. `/exam/session?project=…` stays on "Loading exam…"

Low. CONFIRMED (scratch test, with `goto` modelled as SvelteKit's same-route navigation).

- **Where:** `src/routes/exam/session/+page.svelte:806-815`.
- **What happens:** the branch calls `goto` to the same route and returns. `loadExam` runs only in `onMount`, so the spinner never ends.
- **Evidence:** `page shows: "Exam Loading exam…" | name field: false | aria-busy: true`.
- **Fix:** delete the branch, since `/projects/exam?project=` already migrates in `src/routes/projects/[project]/+page.svelte:236-242` (`site-s5`). Or run `loadExam` again after the `goto`.
- **Related:** `src/lib/exam.ts:241` gives the migrated section a random id on every parse, so a legacy link opened twice never finds its snapshot.

### site-6. In an Exam's Documentation panel, links in entry fields still open a new tab

Low. CONFIRMED (traced).

- **Where:** `src/components/documentation/browser/DocumentationBrowser.svelte:407-410`; `src/components/documentation/entries/InlineMarkdown.svelte:18`.
- **What happens:** `InlineMarkdown` ignores `disableLinks`, and the click handler calls `window.open` without checking it. The Z80 `ind`, `out` and similar entries carry "Read More" links to z80.info (10 in the built pages). Clicking one opens the site and locks the exam on blur.
- **Fix:** check `disableLinks` at `:407`, and render those links as text in an Exam.

### site-7. Embed builder: Copy within a second of an edit copies the link from before it

Low. CONFIRMED (traced).

- **Where:** `src/routes/embed/+page.svelte:316-322`, `:563-567`.
- **What happens:** the link is rebuilt 1,000 ms after the last change, and Copy reads the old one meanwhile.
- **Fix:** build the link in `copy()`, or disable Copy while the timer is pending.

### site-8. One changelog date is read in local time

Low. CONFIRMED.

- **Where:** `src/routes/changelog/versions.ts:206` (`new Date('2024-06-1')`), printed with `toISOString()` at `src/routes/changelog/+page.svelte:35` and `src/lib/twins/content.ts:262`.
- **What happens:** the string is not ISO, so it parses as local midnight. East of UTC it prints the day before, and it flips on hydration for those readers.
- **Evidence:** `TZ=Europe/Rome` gives `2024-05-31`. A local `build/changelog.md` of 2026-11-10 says 2024-05-31.
- **Fix:** `'2024-06-01'`.

### site-9. The service worker holds each uncached response until its whole body is stored

Low. PLAUSIBLE (from the Cache API's definition, not measured).

- **Where:** `src/service-worker/index.ts:80`, `:87`.
- **What happens:** `await store(...)` awaits `cache.put`, which resolves only once the body is read. The page gets no first byte of an HTML document or a `.wasm` until the download ends, so streaming parse and streaming compile are lost.
- **Fix:** `waitUntil(store(...))` and return the response at once.

### site-10. The exam snapshot's 250 ms debounce is never flushed

Low. CONFIRMED (traced).

- **Where:** `src/routes/exam/session/+page.svelte:193`, `:501-504`, `:576-580`.
- **What happens:** the last quarter second of typing before a reload or a closed tab is not restored. The previous review's `s4-workbench-model-bugs-2` was the same pattern.
- **Fix:** save at once in `listenVisibilityChange` and on `pagehide`.

### site-11. The fullscreen-exit count is recorded and shown to nobody

Low. CONFIRMED (by reading).

- **Where:** `src/routes/exam/session/+page.svelte:582-590`. Its only reader is `src/components/specific/exam/ExamReviewAgent.svelte:236`, and `AI_FEATURES_ENABLED` is false (`src/lib/Config.ts:7`).
- **What happens:** a teacher who reviews a submission sees only "Submitted on". The `saveExamSnapshot()` at `:586` saves nothing about the count, since snapshots hold answers only.
- **Fix:** show the start time, the duration and the exits in the review bar, or stop recording them.

### site-12. `encryptData` spreads the ciphertext into `String.fromCharCode`

Low. CONFIRMED for the expression; the size is unlikely.

- **Where:** `src/lib/utils.ts:203`.
- **What happens:** an exam with an access password and more than about 120 KB of sections throws `RangeError` on Create exam link.
- **Evidence:** in Node, 70,000 bytes pass and 130,000 throw.
- **Fix:** build the string in chunks.

### site-13. Enter that confirms an input-method composition opens the selected result

Low. PLAUSIBLE (not run in a browser).

- **Where:** `src/components/search/SearchPalette.svelte:185-203`.
- **Fix:** return early when `event.isComposing`.

### Simplifications

| Id         | Change                                                                                                                                                                                                                                                                                                                                                                                                        | Lines saved                                                                  | Risk                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `site-s1`  | **One `documentation/[language]/[chapter]` route in place of 42 Chapter page wrappers** (`src/routes/documentation/<language>/*/+page.svelte`). Each is 13 lines that differ in three strings, which move to the Chapter data. `chapterParams()` already lists them for the twins.                                                                                                                            | about 390 and 41 files; the five `all` pages the same way save about 95 more | Medium-low: it needs a `+page.ts` using `documentationFor` to keep the per-language chunks |
| `site-s2`  | **Delete `scripts/x86-docs/preprocessor.mjs`:** nothing imports it. `sources.mjs:258` says "source guards never decide membership".                                                                                                                                                                                                                                                                           | 199                                                                          | None                                                                                       |
| `site-s3`  | **One `CheerpJApp.svelte`** with name, target, jar and description: `src/routes/apps/mars` and `src/routes/apps/rars` differ in 8 of 106 lines.                                                                                                                                                                                                                                                               | about 90                                                                     | Low                                                                                        |
| `site-s4`  | **Share the build scripts' repeated parts** (`scripts/*.mjs`): the Node TypeScript resolve hook (four copies, one in `sim-header/generate.mjs`), the audits' `report` and stale-entry printing (two copies), and `RENAMED` (two copies).                                                                                                                                                                      | about 75                                                                     | Low; development tooling                                                                   |
| `site-s5`  | **Exam session leftovers** (`src/routes/exam/session/+page.svelte`): drop the `?project=` branch (`site-5`), the old snapshot shape in `readExamSnapshot` (`:433-455`; snapshots live for one exam), and the save at `:586` that saves nothing.                                                                                                                                                               | about 25                                                                     | Low                                                                                        |
| `site-s6`  | **One "word without its sentence punctuation" helper and one `typedAsCode`.** Three copies have already drifted: `synonyms.ts` always strips a final dot, the other two keep `move.l`. In `src/lib/search/engine.ts:160-169`, `queryCouples.ts:101-128`, `synonyms.ts:19-24`.                                                                                                                                 | about 15                                                                     | Low; the golden queries cover it                                                           |
| `site-s7`  | **Small dead or repeated pieces.** `twinUrl` is defined three times (`src/lib/twins/llms.ts:22`, `content.ts:24`, `documentation.ts:44`). `FULL_TEXT_COURSES` (`src/lib/twins/urls.ts:93`) is used nowhere. `instructionDescription` (`src/lib/documentation/instructions/content.ts:27`) and `parseTerminalEscapes` (`src/components/shared/terminal/terminalEscapes.ts:174`) are named only by their tests. | about 40 with the tests                                                      | None                                                                                       |
| `site-s8`  | **One `[language]/instruction/[instructionName]` page and twin** with a loader table per language, in place of five 8-line pages and five 14-line endpoints (`src/routes/documentation/*/instruction/`).                                                                                                                                                                                                      | about 80                                                                     | Medium: the x86 and Z80 loads build their examples                                         |
| `site-s9`  | **One component for the "editor under the agent" block** that the lecture and chat pages each carry (`src/routes/chat/+page.svelte:113-150`, the lecture page `:160-190`). Both are behind the AI flag.                                                                                                                                                                                                       | about 25                                                                     | Low                                                                                        |
| `site-s10` | **The footer's page list** (`src/routes/+layout.svelte:95-107`) is marked "fix this" and holds a pattern that matches a lone backslash. `KIND_WORDS` (`src/lib/search/queryModifiers.ts:83`) and `KIND_NOUNS` (`queryCouples.ts:31`) repeat six kinds' words.                                                                                                                                                 | about 15                                                                     | Low                                                                                        |

### Leads checked and dismissed

- **A search worker that dies on every query does not loop.** Such a query gets one automatic retry (two workers), then `failed: true`. After it, `inFlight` is 0, `modelWanted` is false, and the model is `failed` and not retried, as the header comment in `searchClient.svelte.ts` says. A death during the model load recovers with words only. A worker that never starts makes one attempt per query.
- **`Promise.any` in `anyShard`:** every scope has at least one shard. With all of them failing it rethrows the first error.
- **Stale search answers** are dropped by the generation check in `LiveSearch`.
- **`whenOnScreen` (`src/lib/shareStart.ts:72`)** leaves an observer behind only when it is called with a signal that is already aborted. Its one caller never does, and `startSharedProject` checks `signal.aborted` again. Harmless; an early return would make its comment true.

### Looked at closely and found sound

- **The static site,** checked against a build of 2026-11-10: 1,294 sitemap URLs, 31,877 links in the 2,919 `.md` twins and the `llms*.txt` files, 280,822 internal `<a href>` in 1,353 pages, and every page's `rel="alternate"` against its twin file. No broken link, no page with a twin and no alternate link, and no alternate link without a twin.
- **Search:** the worker failure paths above. The real engine, loaded with the 11 built shards, took about 80 queries in 5 scopes without a throw, a duplicate key, or an overlapping or out-of-range mark or couple. `SearchField` shifts couples by the leading white space. `LiveSearch` drops stale answers.
- **Sanitising:** no path to script execution in either profile.
- **The home demo, the Examples page and the embed:** the frame parking and `whenOnScreen`, the origin and source checks on messages, the example ids the site links to (all in the index), and the embed URL's write and read agreeing.
- **Exam answers:** the restore from the snapshot, switching between two C sections (the editor's model follows the bound answer), and the timer arithmetic.
- **Clean-up:** `HeroBackdrop` and `MarkdownRenderer` release their observers and timers. The service worker's cache generations and offline fallback read correctly.
- **`TabStrip` and `Select`:** the keyboard handling was read through with nothing found, but not exercised in a browser.

### Not covered

- **Components:** `src/components/shared/agent/**` (AI is off in production), `InteractiveInstructionEditor.svelte` and `shared/terminal` beyond what the reviewed pages call, `DefaultNavbar`, `Footer`, `SegmentedControl`, `NumberStepper`, `TextField`, `ContextMenu`, `ShareMenu`, the tooltip and popover helpers, `src/components/documentation/instruction/**`, `EntryRow`, and the `DocumentationBrowser` template (only its script was read).
- **Libraries:** the build side of search (`shards.ts`, `documents.ts`, `payload.ts`, `embedding.ts`, `stemming.ts`), the assembly and C highlighters, `monacoCodeBlocks.ts`, `lectureSections.ts`, `lectureInstructions.ts`, and the JSON-LD in `seo.ts`.
- **Scripts:** the bodies of `x86-docs-generate`, `riscv-docs-generate`, `entry-questions`, `search-model.mjs`, `twins-check.mjs`, and the root `scripts/changed.mjs`.
- **Routes:** donate, blog, the courses layout and the documentation hub pages.
- **The twins** were checked for existence and links, not for their text against the page's.

## Tooling

### tool-1. `mise.toml` pins another pnpm than `packageManager`

Low. CONFIRMED.

- **Where:** `mise.toml:8` at the repository root (`pnpm = "12.7.0"`, under the comment "Keep in step with `packageManager` in package.json"); the root `package.json:6` (`"packageManager": "pnpm@12.17.0"`, changed in `b82c1203` on 2026-11-07).
- **What happens:** mise installs 12.7.0, locally and in CI through `.github/actions/setup-workspace`. `pnpm --version` in the repository prints 12.17.0 all the same, so pnpm appears to switch to the `packageManager` version by itself, which would be a download in every CI job. That part was not measured in CI.
- **Fix:** `pnpm = "12.17.0"` in `mise.toml`.

### tool-2. `id()` only ever produces 26 of its 52 letters

Low. CONFIRMED (200,000 ids hold exactly `ABCDEFGHIJKLMnopqrstuvwxyz`).

- **Where:** `src/lib/id.ts:6-13`.
- **What happens:** the letter and its case come from the same random number: below 0.5 gives an upper-case letter from A to M, and 0.5 or above a lower-case one from n to z. A 7-letter id has 26⁷ values where 52⁷ were meant. Its only caller is the theme store (`src/stores/themeStore.svelte.ts:326`), so collisions are unlikely either way.
- **Fix:** draw the case separately, or index one string of 52 letters with `Math.floor(Math.random() * 52)`.

### tool-3. The test suite spends 131 s creating jsdom

Speed. Untested.

- **Where:** the `dom` test project in `vite.config.ts` (`*.dom.test.ts`, `environment: 'jsdom'`).
- **What happens:** Vitest reports that jsdom was created 92 times, 130.62 s in total and 39% of the tracked time of a 213 s run, and suggests `pool: 'vmThreads'` (which keeps the isolation per file) or `isolate: false`.
- **To check:** whether the DOM tests pass under `vmThreads`, and how much wall time it saves.

### What the sweeps found

- **Duplication is low.** 13 repeated blocks of 10 or more code lines, 180 lines in all; the largest is the MARS and RARS app pages (`site-s3`). The previous review found 181 exact clones (2,985 lines). What is left to merge is code that does the same thing under other names, which the simplification tables above list.
- **Exports.** 8 exports are named nowhere else: the six in `emu-s10`, `wb-s3` and `site-s7`, and the two functions of the unimported `scripts/x86-docs/preprocessor.mjs` (`site-s2`). 270 are named only by tests; the reviewers judged the ones in their areas, and the dead ones are in the same three findings. 433 are used only in their own file.
- **Listeners, object URLs and intervals.** Every file that adds listeners without removing them was checked by its reviewer: they listen on Workers that are terminated, or for the page's lifetime on purpose. Object URLs and intervals are all released.
- **Leftover notes.** Three `TODO` comments in the source: two in `emu-s10`, and `hoverValueElementStyle?: string //TODO rename` in `src/components/specific/project/user-tools/ValueDiffer.svelte:14`.

## Suggested order of work

1. **`emu-1`,** with `emu-s1`, since one bounded journal is both the fix and the simplification. Its regression test is a journal pushed past its capacity, timed or counted.
2. **The data-loss and exam bugs:** `wb-1`, `site-1`, `site-2`, `site-3`, then `emu-3` (with `emu-s5`), which changes the bytes a program assembles to.
3. **The gaps of the Core-loading change (`95a18696`):** `wb-2`, `wb-3`, `wb-4`, `wb-6`, `wb-8`, `wb-10`.
4. **The other medium bugs:** `emu-4`, `emu-2`, and `emu-5` together with the Core call of `emu-s8` if the owner wants it in the Cores.
5. **The low bugs,** by area: the exam session (`site-4`, `site-5` with `site-s5`, `site-6`, `site-10`, `site-11`, `site-12`), the site (`site-7`, `site-8`, `site-9`, `site-13`), the Workbench (`wb-5`, `wb-7`, `wb-9`, `wb-11`), the Emulators (`emu-6`, `emu-7`, `emu-8`), and `tool-1` and `tool-2`.
6. **Deletions that carry no risk:** `site-s2`, `emu-s10`, `wb-s3`, `site-s7`, `wb-s7`, `wb-s8`, `wb-s9`.
7. **The merges:** `site-s1` and `site-s8` (the documentation routes), `site-s3`, `site-s4`, `emu-s2`, `emu-s3`, `emu-s4`, `wb-s1`, `wb-s2`, `wb-s4`, `wb-s5`, `wb-s10`, then `emu-s6`, `emu-s7` and `emu-s9`.

Decisions that are the owner's before the work starts: whether `wb-5` drops the `{#key project.id}`, whether `wb-12` gets a longest wait, whether `site-11` shows the count or stops recording it, whether `wb-s1` may narrow ADR 0024's host API, and whether `emu-s8` goes into the Cores.
