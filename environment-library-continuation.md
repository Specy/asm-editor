# Environment library continuation, 2026-10-06

**Implementation, releases and package adoption complete (2026-10-07):** M5, M6, Blink B3/B4/B5, the x86 editor adoption and M8 are complete. Their reviewed decisions and evidence are in the plan's Implementation notes. The owner authorized all four Core releases and confirmed their npm publication. The editor now consumes MIPS/RISC-V 4.0.0, s68k 3.0.0 and x86 5.0.0 from npm, with matching dependency pins and lockfile. Post-release check, lint, formatting and production build pass. The full 3,319-test run had three five-second timeouts; both affected files pass all 49 tests when rerun serially without changing assertions or timeout limits. The plan's final note records the evidence. Only the [owner manual checks](#owner-manual-checks-left) and eventual editor commit remain. Earlier milestone checklists below preserve the stopping point as historical context.

This document originally recorded the stopping point when the owner asked to conserve session usage: M5 was complete, M6 had a partial implementation, and B3 onward had not started. Its detailed checklists remain as historical context; the update above and the plan's appended notes state the current progress.

The editor's changes remain uncommitted. The four Core release commits and tags were pushed after the owner authorized publishing; registry consumption was enabled after the owner confirmed publication. At the original stopping point, the M6 agent had stopped and reported its partial state.

## Instructions that persist

- Use **Sol subagents**, one milestone or Core part per agent. This is the owner's latest instruction and supersedes the older handoff's Opus requirement. This continuation used `gpt-6.1-sol` and `gpt-6-sol`. Keep each agent's file ownership explicit; agents sharing files must run sequentially.
- After every agent, review its report and actual changes, then append its decisions and verification limits to the plan's **Implementation notes**. Agents report decisions rather than editing the plan themselves.
- The owner authorized the four Core releases on 2026-10-07; the release commands below have been executed. No additional release, editor commit or editor push is requested.
- Never revert changes you did not make. The editor and four Core checkouts contain substantial inherited work, including unrelated instruction-example and Markdown/component changes.
- The local Core links protected the unpublished APIs during implementation. After publication was confirmed, `emulators:registry` restored the matching npm packages. Do not relink or change package sources unless the current task needs it.
- Use a private Vite configuration, cache directory and free port for browser verification. The owner's port 4173 may be in use. Stop only processes you started.

## Read before resuming

Read this file, the original [handoff](environment-library-handoff.md), then all of:

1. [The implementation plan](docs/design/environment-library-plan.md), especially all twelve **Decisions taken while planning** and every **Implementation note** at the end. The appended closure notes describe the final implementation and verification limits.
2. [The design](docs/design/environment-library.md).
3. ADRs 0034–0037, plus the cited ADRs 0001, 0005, 0009, 0010 and 0015.
4. [CONTEXT.md](CONTEXT.md) and the [environment-services audit](docs/research/environment-services-audit.md).
5. For M6, the 3.0.0 migration table in `emulators/m68k/ts-lib/README.md`; for Blink, the existing Core implementation and tests before adding new hooks.

The original handoff and the plan's early milestone text preserve older snapshots. Later Implementation notes take precedence where they correct those snapshots: MARS print-string has no artificial limit; static data can reach the relocated heap boundary; the x86 inline-assembly translator can ship in 5.0.0 without a separate 4.1.0 release.

## Current checkout and links

`npm run emulators:status` currently reports:

| Target | Editor resolves | Local package directory      | Published version             |
| ------ | --------------- | ---------------------------- | ----------------------------- |
| MIPS   | npm 4.0.0       | `emulators/mips/marsjs/ts`   | `@specy/mips` 4.0.0           |
| RISC-V | npm 4.0.0       | `emulators/risc-v/rarsjs/ts` | `@specy/risc-v` 4.0.0         |
| M68K   | npm 3.0.0       | `emulators/m68k/ts-lib`      | `@specy/s68k` 3.0.0           |
| x86    | npm 5.0.0       | `emulators/x86/blink-js`     | `@specy/x86` 5.0.0            |
| Z80    | npm 1.1.0       | `emulators/z80`              | no Core release for this work |

The four adopted Cores are installed from npm, and the local source checkouts remain at the release commits. Inspect package sources with:

```bash
npm run emulators:status
```

Baseline status, diffs, untracked-file lists and file hashes from the beginning of this continuation are saved under `/tmp/environment-library-continuation-baseline/`, with `editor`, `mips`, `risc-v`, `m68k` and `x86` prefixes. They help distinguish this continuation's changes from inherited work. `/tmp` evidence may not survive a machine restart; the plan and this handoff contain the durable conclusions.

## Completed in this continuation: M5

The interrupted MARS/RARS editor adoption was finished, reviewed and verified against the linked Cores. It includes:

- StopReason, signed exit codes, typed RuntimeError locations including included Files, and exit/random History entries; the old adapter termination flags are removed.
- Raw text answers, null for dialog Cancel, flat unsigned byte arrays, write counts and lazy Random source seeds; formatting and parsing belong to the Cores.
- Service 40 on both Targets, RISC-V GetCWD 17, corrected service documentation and Differences from MARS/RARS.
- Generated headers and 44 refreshed captures, including dialog 53 and a 512×256 Screen. GNU static data now has a 4,128,768-byte cap from `0x10010000` to `0x10400000`; tests cover heap relocation.
- Runtime corpus runner migration to the new handler shapes and actual termination state.

Review found an additional correctness bug: a file open and a later Core-only exit dispatched through the same syscall PC could share a FileSystem identity. Undoing exit then removed the older file operation. A separate mirrored MARS/RARS Core part fixed this, followed by editor adoption.

### New identity contract to preserve

Both Cores expose:

```ts
getCurrentInstructionSerial(): string | null
JsInstructionUndoGroup.serial: string
JsPokeUndoGroup.serial: string
JsBackStep.serial: string
```

These are opaque positive decimal strings, allocated monotonically within the loaded module across Core instances, Undo, initialize and reassembly. The active instruction keeps its identity across an awaited handler. Do not substitute PC or convert the serial to a JavaScript number.

History groups use dynamic serials. Initialize clears retained history without resetting the allocator. Capacity still counts restore slots, but eviction and oversized-instruction handling operate on whole groups. Unrecorded execution clears older history so Undo cannot cross a gap. RARS trap setup belongs to the faulting instruction. Negative capacity and active-instruction lifecycle mutations are rejected.

Editor integration:

- `MarsHandlerHost.instructionSerial()` reads the active serial lazily and rejects a missing value.
- MIPS/RISC-V FileSystem Undo preflight and rollback use `group.serial`; PC remains for display/source mapping.
- `FileSystemInstructionId = number | string | bigint` preserves identity type and precision, ready for Blink's native serials.
- Sequential callbacks with the same identity coalesce into one Undo frame, including empty callbacks. Each callback publishes synchronously. If earlier inverses were evicted, Undo of the entire instruction remains unavailable.
- `src/lib/languages/mars/marsFileIdentity.test.ts` permanently covers shared-PC open/exit/replay and Core-only services preserving older file state.

### M5 verification already completed

- Both Core `build:all` commands and full Core test suites passed using Java 21, Maven 3.9.16 and TeaVM 0.15.
- Final editor identity run: **760/760 Node tests across 20 files**, plus **27/27 DOM tests**.
- `npm run check`: **0 errors**, 31 existing warnings. Touched lint, format and whitespace checks passed.
- Full runtime corpus: **GCC 426/426 and Clang 426/426**. Transient Compiler Explorer TLS failures were recovered with a temporary external retry harness; product networking was unchanged.
- Chrome Workbench flows passed on MIPS, RV32 and RV64: Build, typed input `12`, dialog Cancel, seed-42 random draw `-1170105035`, exit code 3 and shared-PC file/exit Undo/replay.
- Live `-O2` C compilation, Build and Step into `@runtime/include/sim.h` and back to `main.c` passed with the larger Screen.

Evidence: `/tmp/m5-{mips,riscv}-{build,test}.log`, `/tmp/m5-identity-{node,dom,check}.log`, `/tmp/m5-corpus-{gcc,clang}.log`, and `/tmp/m5-browser/`. Warm browser runs recorded no runtime errors. A fresh Vite startup emitted a transient hydration exception during dependency warmup; initial C-entry analysis can also produce a tokenization warning before compilation. Subsequent Build and execution succeeded. Private browser/server processes were cleaned up.

## Next: finish M6, s68k editor adoption

The inherited adoption already reads Core-formatted output and raw input, maps `getTermination()` and typed errors, uses FileSystem tasks 50–59 with eight handles starting at zero, passes input settings, handles task 58 through Prompt, rejects sound with an Audio Peripheral reason, and updates trap documentation and lecture prose.

The latest M6 agent added only these changes:

| File                                               | Change                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/languages/M68K/M68KEmulator.svelte.ts`    | Direct `_undo()` checks both Screen and FileSystem before changing Core state; Terminal typing echoes onto Screen too; task 58 passes its suggested path to Prompt. |
| `src/lib/languages/peripherals/Terminal.svelte.ts` | Optional callback on `useTerminalInput(echo?)`; optional third `inputDialog` argument for a placeholder. Other Targets retain their default behavior.               |
| `src/lib/languages/M68K/M68K-traps.ts`             | Serial rejection accurately describes missing editor Peripheral support.                                                                                            |

Task 58's suggested path is currently a **placeholder**, not a prefilled value. Test and describe the actual behavior. The task's title/filter appear in the question; empty answer and Cancel produce null. Dialog answers must not echo into Terminal or Screen.

There is currently a `GenericEmulator.fileDescriptorOptions()` override, not a separate post-session `beginSession` hook. GenericEmulator calls `_initialize()` and then creates the FileSystem session. M68K reads the session lazily, so verify its existing behavior rather than introducing a hook solely to match the old handoff wording. The later x86 mount may need an explicit post-session hook.

### M6 remaining implementation and tests

1. Review all inherited M6 diffs and the three latest changes. Finish rejected-task grouping in the documentation and verify settings/files are marked implemented, with cycle timing, sound, serial and network reasons accurate.
2. Add permanent regressions for a file task and exit at the same trap address. Undo/replay of exit must preserve the earlier open File. s68k already supplies Core step IDs; verify their use rather than copying the MARS string-serial API.
3. Test FileSystem budget exhaustion and Screen budget exhaustion with both journals present. Public Undo and direct adapter Undo must refuse before registers, PC, Files or Screen change. Pokes must leave unrelated peripheral history intact.
4. Test Terminal typing echoed onto Screen and Undo at the input instruction; also verify the graphical input path, echo disabled, prompt disabled and line-feed settings. Shared Terminal changes need DOM coverage where behavior is visible.
5. Test task 58's path placeholder, accepted answer, Cancel, empty answer and absence of dialog echo.
6. Cover all sound tasks 70–77 and rejected-task reason grouping, extending the existing task-70 coverage.
7. Finish the content sweep for Windows-1252, uppercase base output, Core number parsing, Enter `$0D`, settings and file results. Preserve inherited lecture edits. There are no separate M68K Examples/Exercises test files here: course examples and solutions run through `src/lib/content/content.test.ts`; four standalone examples are covered in M68KEmulator tests.
8. Run the relevant M68K language/project/service/documentation suites, shared Screen/FileSystem/Terminal/Generic suites, TerminalConsole and Prompt DOM suites, and `content.test.ts`. Run `npm run check` and lint/format/whitespace checks for the entire adoption, not only the last three files.
9. Verify actual Workbench and Interactive editor flows in Chrome: typing, hidden-console reveal/focus, text versus graphical input, input settings, Windows-1252, uppercase formatting, Enter 13, error termination and Undo, file operations and task-58 Prompt.
10. Review the agent report and append the closure decisions to the plan. Mark M6 complete only after these checks pass.

Verification at the stopping point: **327/327** tests across six focused Node suites before the latest changes; **189/189** in M68KEmulator, ScreenUndo and Terminal after them; touched lint/format/whitespace checks passed. Independently, s68k passed **599 Rust unit tests + 8 integration tests**, and its TypeScript smoke suite. Logs are `/tmp/environment-s68k-cargo-tests.log` and `/tmp/environment-s68k-core-tests.log`. No M6 browser work ran in this continuation. The new regression patch attempted by the agent failed atomically, so it added no tests or content changes.

Existing Screen font limitation: `peripherals/screen/bitmapFont.ts` has glyphs only for ASCII `0x20`–`0x7F`; other characters draw blank. This is source inspection, not a completed rendering check. Verify and document the relevant reference difference during M6/M8; do not claim that Windows-1252 encoding support automatically provides those Screen glyphs.

## Then Blink B3: clock, random, waits and pipes

Assign one Core agent to `emulators/x86` for M7 items 2 and 5. Preserve the completed earlier Blink work: deterministic configuration, pure-state calls, Core-exported syscall list, structured termination, byte standard streams, no launch banner and per-run isolation.

Required work:

- Route clock and random consumers through one `HostNow` and one `GetRandom`, including loader `AT_RANDOM` and `/dev/urandom`. Expose a monotone `instructions_executed` count.
- Add a halt-and-resume wait trap with ExitTrap-equivalent cleanup for `nanosleep`, `clock_nanosleep`, `select`, `poll`, `ppoll`, `pause` and `sigsuspend`. It must release the JS thread and resume the pending operation correctly.
- Report truthful `poll`/`select` readiness; nonblocking reads return EAGAIN when appropriate. The current always-readable/waiting behavior is an explicitly unfinished baseline.
- Implement `getrandom` and in-process `pipe`, with byte buffering and readiness consistent with the wait model.
- Test normal completion, wakeup, cancellation, EOF, partial input, nonblocking behavior and run isolation. Compare syscall semantics against small native Linux probes.

**Integration concern to resolve:** GenericEmulator currently swaps virtual clock/seeded Random source in `useScriptedRun()` only after compilation, initialization and preset writes. Loader `AT_RANDOM` happens earlier. Lazy runtime hooks alone will not make that loader draw deterministic. Define a tested Testcase source boundary before program loading; keep toolchain randomness separate from the program's seeded stream. Do not capture the old interactive source in adapter construction.

Build and validation, from the editor root:

```bash
source /home/dev/emsdk/emsdk_env.sh
npm --prefix emulators/x86/blink-js run build:wasm
npm --prefix emulators/x86/blink-js test
npm --prefix emulators/x86/blink-js run type-check
npm --prefix emulators/x86/blink-js run build
npm --prefix emulators/x86/blink-js run test:dist
```

Verify reproducibility when the wasm changes. The earlier `init_blink.sh` recipe is obsolete after the committed configuration; inspect the current build script. CI does not rebuild Blink wasm, so the checked-in module must contain the actual new implementation.

## Then Blink B4: signals and timers

Assign the next Core agent M7 item 6:

- `kill`, `tkill` and `tgkill` directed at the emulated process itself, with correct target validation.
- `wait4` returning ECHILD for the single-process environment.
- `alarm` and `setitimer` driven by the injected host clock, delivered at wait wake and slice start.
- Signal default actions and structured stop reasons, including existing SIGTRAP behavior; reuse earlier signal metadata.
- Native Linux comparison probes and tests for delivery during execution and waits, timer reset/cancel, per-run isolation and termination reporting. Rebuild and validate the Core as for B3.

Review B3's hooks before designing timers so both parts share one clock and wakeup model. Append the decisions after reviewing the agent.

## Then Blink B5: Project Files and irreversible history

Assign the next Core agent M7 items 10 and 11:

- Expose an Emscripten file-system backend backed by the editor FileSystem session and mount it at `/project`, the program's working directory. File callbacks carry the native history serial without precision loss.
- Support the operations needed by the implemented file syscalls and translate guest errors correctly. Reconcile flat Project paths and FileSystem deviations with the filesystem interface; document unsupported behavior rather than hiding it.
- Preserve per-run reset and descriptor isolation while leaving the intended mount intact. Build-tool filesystem activity must remain separate from guest Project Files.
- Mark instructions that consume standard input or mutate Files irreversible, including `TakeTerminalInput()`, `TCFLSH` and file-mutating calls. Audit state-changing calls such as `brk`, ids and limits whose state is not restored by native history.
- Undo stops before irreversible effects; journaling file/stdin effects for x86 is deferred under ADR 0015. Do not accidentally advertise full FileSystem Undo merely because callbacks have an identity.
- Test mount lifecycle, descriptor/cursor behavior, errors, syscall memory capture, mutations, irreversible boundaries and isolation between Builds/Testcases. Run native probes where meaningful, then Core build/tests/type-check/dist checks.

**Session ordering concern:** compilation runs before GenericEmulator creates the new FileSystem session. Do not mount an ended previous session during compilation. The adoption may need a hook immediately after session creation and before program startup. Preserve the M5 FileSystem API's `number | string | bigint` IDs and same-instruction callback coalescing.

## Then x86 editor adoption, 5.0.0

Only after B3/B4/B5, assign a separate editor agent and link the built local x86 package. Preserve the other three local links.

Adapter and execution work:

- Adopt byte `stdout`/`stderr` callbacks and `provideInput(bytes | END_OF_INPUT)`. Remove the old `stdin` callback, `isProgramOutput`, launch-output filter and line-ending patch.
- Wire lazy clock/wait/random hooks and the FileSystem mount. Test the loader/Testcase source boundary identified in B3 and the session ordering identified in B5.
- Feed random bytes through `peripherals.random.bytes`; journal stream `position` with instruction identity and `seek` it on Undo. Undo then Step must reproduce the same random result.
- Map `stopReason.signal` directly. Remove the adapter's duplicated signal table and exit mask in `x86Termination.ts` and update its tests.
- Check read, readv, dup'd descriptors, EOF, split UTF-8, wait cancellation, errors, masked exit codes, signals, Files, Undo boundaries and repeated Build/Testcase isolation.

Generated data and docs:

- Change `scripts/x86-docs-generate.mjs` to use `getImplementedSyscalls()` from the Core as the authority; retain strace parsing only for argument labels. Retire the configuration evaluator from that authority path.
- Implement the override table in `src/lib/documentation/x86/syscallBinding.ts` for the **28 pointer arguments labelled only `value`**, as required by the plan's “Correction to the x86 bindings” note. Do this before release and test the real prototypes.
- Regenerate `generated/x86Syscalls.ts` and `generated/sim/x86_64.h`. The completed earlier Core snapshot had 131 calls; B3/B4 can change that count, so derive the new list rather than pinning the old number blindly.
- Update names such as `pread64`, `getdents64`, `newfstatat` and `prlimit64`, the C wrappers, documentation and count expectations. Fix the currently known failing `src/lib/languages/X86/x86Syscalls.test.ts`.
- Remove 4.0.0-only translator capability/rejection branches and update the `nop` case to successful translation. Retain meaningful invalid-inline-assembly tests.
- Remove stale `init_blink.sh` references in generator sources/tests and design docs. Add Differences from Linux.
- Verify x86 C/C++ header captures and actual compile/Build/Run/Step/Undo. Run X86Emulator, X86Examples, syscall/binding/header/translator-related editor suites, shared suites, type-check and browser flows.

Review and append the adoption decisions before M8.

## M8 acceptance checklist (completed)

The separate Sol editor/content agents completed these requirements after all adoptions were verified; the plan's closure note records the reviewed evidence:

- Add **Using C** chapters for MIPS, RISC-V and x86: routes under `src/routes/documentation/<lang>/`, sidebar links and landing buttons. Cover compilation, Runtime library versus `<sim.h>`, `SIM_SCREEN` and devices where available, calling conventions visible in Generated assembly, stepping and Breakpoints. `src/lib/documentation/documentation.test.ts` must verify every Chapter has a page.
- Complete reference-difference sections for EASy68K, MARS, RARS and Linux, plus shared Screen differences. State the Z80's Enter codes explicitly: the character port returns `0x0A` in Terminal and Screen input, while the last-key ports report `0x0D`.
- Refresh relevant search goldens in `src/lib/search/golden.test.ts` after final prose and service names settle.
- Run `src/lib/content/content.test.ts`, each existing language Examples suite and affected documentation suites. Fix Exercises/Examples whose expectations changed for Java float formatting, uppercase bases, Enter codes, raw-line parsing and exit reporting. Do not create empty mirror tests just to match an old filename list.
- Verify Workbench and Interactive editor flows for MIPS, RV32/RV64, M68K, x86 and Z80, including console reveal and input-source switching. Earlier M5 evidence can be reused unless shared changes invalidate it.
- Update `docs/manual-verification.md` with checks actually performed; leave owner-only device checks pending.
- Finish with appropriate full editor tests, check, lint and format verification. Investigate failures against the inherited baseline; do not revert unrelated changes to make checks green. `lectureSections.test.ts` can time out under load and should be retried alone when that is the failure.

The content/browser pass is complete and the remaining manual checks are reported below, with releases still left to the owner.

## Owner manual checks left

The original handoff explicitly reserves these rows in `docs/manual-verification.md` for the owner:

| Row | Check                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C7  | Real phone: tap raises the keyboard, viewport resizing keeps the caret visible, predictive text and IME commits reach the program, and Backspace on an empty line handles the echo correctly.                              |
| Z5  | Z80 character port `0x10`: repeat Terminal line input and focused Screen input with echo in both views. Headless checks pass; the owner repeat remains pending. Character Enter is `0x0A`; last-key Enter is `0x0D`.       |
| M7  | M68K text-only string input at the Terminal versus graphical input from the focused Screen, with echo in both views and correct focus. Earlier graphical evidence exists; repeat after the current echo/settings adoption. |

Headless Chrome does not establish that C7 passes on a real phone. The implementation's per-language browser checks pass; Z5 and M7 still retain the owner repeats explicitly requested in the handoff.

## Verification commands for resumption

Use focused suites while implementing; broaden when closing a milestone. These commands do not install packages or change links:

```bash
npx vitest run --project node src/lib/languages/M68K/M68KEmulator.test.ts src/lib/languages/ScreenUndo.test.ts src/lib/languages/peripherals/Terminal.test.ts src/lib/languages/peripherals/FileSystem.test.ts src/lib/languages/GenericEmulator.test.ts src/lib/documentation/m68k/m68k.test.ts
npx vitest run --project dom src/components/shared/terminal/TerminalConsole.svelte.dom.test.ts src/components/shared/providers/PromptProvider.dom.test.ts
npx vitest run --project node src/lib/content/content.test.ts
npm run check
git diff --check
```

Include additional M68K language/project/diagnostic suites for closure; the command above is a starting set, not the entire acceptance checklist. Run ESLint and Prettier on the milestone's actual touched files. Use Node 24. Do not run root `fix`/`format` against the whole dirty checkout.

For Core rebuilds, use the existing installations:

```bash
npm --prefix emulators/mips/marsjs/ts run build:all
npm --prefix emulators/mips/marsjs/ts test
npm --prefix emulators/risc-v/rarsjs/ts run build:all
npm --prefix emulators/risc-v/rarsjs/ts test
cargo test --manifest-path emulators/m68k/Cargo.toml
npm --prefix emulators/m68k/ts-lib run build-all
npm --prefix emulators/m68k/ts-lib test
```

MIPS/RISC-V builds require Java 21 and Maven 3.9. The s68k wasm build requires the existing wasm-pack toolchain. Blink's commands are above. Rerun completed expensive corpus tests only when new changes or unresolved concerns justify it.

## Release commands (executed)

The owner authorized publishing all four Cores, then asked that release verification be left to them, and confirmed that all four were published. Release commits are MIPS `34a79cf`, RISC-V `52ef87e`, s68k `27d2371` and x86 `072cfce`. The default branches were verified: MIPS `main`, RISC-V `master`, s68k `main`, x86 `main`. Their matching tags were pushed after the branch pushes. The script in [release-environment-cores.sh](release-environment-cores.sh) handles interrupted reruns; the command blocks below preserve the original recipe.

Implementation changes, including new files and verified artifacts, were staged before the release commits. The command blocks add only release metadata and are historical; do not rerun them as a new release.

### MARS / `@specy/mips` 4.0.0

```bash
npm --prefix emulators/mips/marsjs/ts version 4.0.0 --no-git-tag-version
git -C emulators/mips add -- marsjs/ts/package.json marsjs/ts/package-lock.json
git -C emulators/mips diff --cached
git -C emulators/mips commit -m "Release @specy/mips 4.0.0"
git -C emulators/mips tag v4.0.0
git -C emulators/mips push origin main
git -C emulators/mips push origin refs/tags/v4.0.0
```

### RARS / `@specy/risc-v` 4.0.0

```bash
npm --prefix emulators/risc-v/rarsjs/ts version 4.0.0 --no-git-tag-version
git -C emulators/risc-v add -- rarsjs/ts/package.json rarsjs/ts/package-lock.json
git -C emulators/risc-v diff --cached
git -C emulators/risc-v commit -m "Release @specy/risc-v 4.0.0"
git -C emulators/risc-v tag v4.0.0
git -C emulators/risc-v push origin master
git -C emulators/risc-v push origin refs/tags/v4.0.0
```

### s68k / `@specy/s68k` 3.0.0

```bash
npm --prefix emulators/m68k/ts-lib version 3.0.0 --no-git-tag-version
git -C emulators/m68k add -- ts-lib/package.json ts-lib/package-lock.json
git -C emulators/m68k diff --cached
git -C emulators/m68k commit -m "Release @specy/s68k 3.0.0"
git -C emulators/m68k tag v3.0.0
git -C emulators/m68k push origin main
git -C emulators/m68k push origin refs/tags/v3.0.0
```

### Blink / `@specy/x86` 5.0.0

```bash
npm --prefix emulators/x86/blink-js version 5.0.0 --no-git-tag-version
git -C emulators/x86 add -- blink-js/package.json blink-js/package-lock.json
git -C emulators/x86 diff --cached
git -C emulators/x86 commit -m "Release @specy/x86 5.0.0"
git -C emulators/x86 tag v5.0.0
git -C emulators/x86 push origin main
git -C emulators/x86 push origin refs/tags/v5.0.0
```

The translator's inline-assembly acceptance ships in 5.0.0; no separate 4.1.0 is needed. The wasm is not rebuilt by x86 CD, so ensure the verified wasm and wrapper artifacts are present in the reviewed release.

After the owner confirmed publication, the editor's dependency pins and lockfile were updated and `npm run emulators:registry` installed the four released packages. That command already runs `npm install`, so no duplicate install is required. The Core checkouts now expose their new release commits as the editor's changed submodule pointers; recording those pointers belongs to the editor's eventual commit. Post-release validation is recorded in the plan's final note.

## Explicitly deferred work

- Audio Peripheral design and implementation: EASy68K 70–77 and MARS/RARS MIDI 31/33.
- A proper 68000 cycle-timing model for EASy68K 30/31.
- Reversible x86 File and standard-input effects under ADR 0015, replacing irreversible markers later.
- Undo of the Terminal transcript.

## Further work

No implementation or Core release milestone remains. The editor consumes the published packages. The remaining C7/Z5/M7 owner checks and eventual editor commit are recorded above. Any Audio, cycle-timing or expanded Undo work requires a separate task.
