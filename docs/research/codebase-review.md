# Editor codebase review (2026-10-26)

A correctness and simplification review of `packages/asm-editor`. The Cores are out of scope for this round. The review found problems; it changed nothing. Every fix waits for triage.

## How it was done

1. **Tool sweep (Phase 0).** Repository checks, plus one-off tools for what the checks do not cover: a typed lint pass, a clone finder and an unused-code scan.
2. **Agent review (Phase 1).** The source is split into nine areas. In each area one reviewer looks only for bugs and another only for simplifications; the routes and docs area has one reviewer for both. A verifier per area then tries to refute every finding, with a scratch test where that is cheap. Findings below carry the verifier's verdict.

## Size

About 166k lines of non-test source in `packages/asm-editor` (`.ts`, `.svelte`, `.js`, without `.d.ts`), and 84k lines of tests in 302 files.

| Area                                                                                              | Files |  Lines |
| ------------------------------------------------------------------------------------------------- | ----: | -----: |
| Emulator core and peripherals (`lib/languages` root, `service/`, `peripherals/`, `measurements/`) |    75 | 18,796 |
| MIPS, RISC-V, M68K adapters                                                                       |    29 | 12,945 |
| x86, Z80 adapters, demangler glue                                                                 |    30 | 17,148 |
| Workbench model, Project model, stores, Monaco glue                                               |    85 | 18,724 |
| Compilation, listings, pseudocode, search, pixel library                                          |    83 | 17,022 |
| Workbench UI components                                                                           |    56 | 15,858 |
| Project UI components                                                                             |    55 | 14,360 |
| Shared and documentation components                                                               |    97 | 16,448 |
| Routes, content, documentation data, build scripts                                                |   206 | 38,764 |

The largest files: `lib/workbench/WorkbenchSession.svelte.ts` (4,565 lines), `lib/languages/GenericEmulator.svelte.ts` (2,914), `components/specific/workbench/pixels/PixelEditor.svelte` (2,286), `components/shared/agent/defaultCodingAgent/tools.ts` (2,189), `lib/languages/X86/X86Emulator.svelte.ts` (2,166).

## Phase 0: tools

### Baseline

- `pnpm check`: 0 errors, 0 warnings over 1,847 files.
- `pnpm lint`: clean.
- `pnpm test`: 6,291 passed, 1 skipped. Four tests failed on the 5 s timeout while another heavy process shared the CPU, and passed when rerun alone. They are slow rather than wrong, but they fail under load:
    - `ScreenUndo.test.ts`, "preflights both M68K journals when the FileSystem budget is exhausted"
    - `pseudocodeSearchCache.test.ts`, "reads as a fresh decompilation after renaming every C++ function out of its namespaces"
    - `RISC-VEmulator.test.ts`, "animates the bouncing ball and lets program time pass"
    - `X86Executable.test.ts`, "enters libc with Step into library code on"

### Lint coverage

- Oxlint runs with `categories: { correctness: 'off' }` and a hand-picked rule list. Turning the `correctness` and `suspicious` categories on adds 405 `no-underscore-dangle`, 145 `no-shadow`, 64 `no-useless-escape` and a handful of others. The 4 `no-unmodified-loop-condition` hits are false positives (three in tests). Nothing there is worth enabling.
- ESLint (Svelte files and `.svelte.ts` modules) already loads type information (`projectService: true`) but uses only rules that do not need it. A one-off run of typed typescript-eslint rules over all of `src` (config in `packages/asm-editor/.cache/eslint-typed.config.js`, gitignored, about 3 minutes) found:

| Rule                             | Hits | Notes                                                                                                                                                                                 |
| -------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-unnecessary-condition`       |  558 | Mostly unchecked index access; some dead branches                                                                                                                                     |
| `no-unnecessary-type-assertion`  |   86 | Casts that can go                                                                                                                                                                     |
| `prefer-optional-chain`          |   44 |                                                                                                                                                                                       |
| `no-floating-promises`           |   35 | Mostly `goto(...)`, `ProjectStore.save(...)`, `tick().then(...)` with no error handling                                                                                               |
| `no-unsafe-enum-comparison`      |   11 | All correct code: `RegisterSize` values are byte widths, and Z80's `1` is `SymbolType.CONSTANT`                                                                                       |
| `only-throw-error`               |   10 | M68K throws plain `{ type: 'ExecutionLimit' }` objects (harmless, formatted like the Core's own errors); SvelteKit `throw error(404)` is fine                                         |
| `no-redundant-type-constituents` |    8 | `DockCompilation`, `DockViews`, `DockSound`, `SupportedLanguage` resolve to the error type under typescript-eslint (they come from `.svelte` modules), so typed rules see `any` there |
| `no-deprecated`                  |    8 | Six `createEventDispatcher` uses, `keyCode`                                                                                                                                           |
| `switch-exhaustiveness-check`    |    2 | Both harmless (RISC-V's missing `HEAP_RESTORE` case returns null, which is right; M68K handles the other states earlier), but the first led to bug s2-mars-m68k-bugs-6                |
| `await-thenable`                 |    5 | `await` on eager `import.meta.glob`; `Promise.all` over values that are not promises in `searchClient.svelte.ts:105`                                                                  |
| others                           |   21 |                                                                                                                                                                                       |

Of these, `no-floating-promises` is the one worth enabling for good: several of the bugs below are unhandled promises it points at. `switch-exhaustiveness-check` is cheap insurance. `no-unsafe-enum-comparison` would only flag correct code. Extending typed rules to the plain `.ts` files would need those files back on ESLint, or Oxlint's type-aware mode.

### Duplication

`jscpd` could not be fetched in this session, so a scratch clone finder compared normalized lines, both exactly and with identifiers, strings and numbers replaced. It found 181 exact clones (2,985 lines) and 75 renamed-identifier clones (1,651 lines). The biggest pairs:

|                Shared lines | Files                                                                                                              |
| --------------------------: | ------------------------------------------------------------------------------------------------------------------ |
| 339 (renamed) / 197 (exact) | `MIPS/MIPSEmulator.svelte.ts` and `RISC-V/RISC-VEmulator.svelte.ts`                                                |
|                         260 | `stores/themeStore.svelte.ts` with itself                                                                          |
|                         220 | `MIPS/MIPS-language.ts` and `RISC-V/RISC-V-language.ts`                                                            |
|                         196 | `peripherals/audio/chips/soundChipCore.ts` with itself                                                             |
|              60–80 per pair | the five `routes/documentation/<language>/instruction/+page.svelte`, and the `+layout.svelte` files                |
|                          66 | `MIPS-documentation.ts` / `RISC-V-documentation.ts`; `documentation/mips/mips.ts` / `documentation/riscv/riscv.ts` |
|                          63 | `workbench/AnnotationPrompt.svelte` and `workbench/PatchPrompt.svelte`                                             |
|                          52 | `agent/defaultCodingAgent/tools.ts` with itself                                                                    |
|                       34–40 | `routes/apps/mars` and `routes/apps/rars` pages                                                                    |

### Unused code

`knip` could not be fetched either; a scratch scan of imports and exported names found:

- No unused source files (the five `*.measure.ts` files are entry points of `vitest.measure.config.ts`).
- 8 exports used nowhere: `lazyDocument` (`documentation/instructions/document.ts`), `CompilationError` (`BaseEmulator.svelte.ts`), `Z80ColorName`, `RegisterHex`, `SLOT_COUNT` (`audio/Audio.ts`), `M68kWorkerRequest`/`M68kWorkerResponse` (`service/protocol.ts`), `R_X86_64_64` (`listing/elfModel.ts`).
- 182 exports used only by tests. Most are test seams, but some may be code that only the tests keep alive.
- 373 exports used only inside their own file; the `export` keyword can go.

### Test coverage

No coverage provider is installed. A static check of which large files (400+ lines) no test imports directly lists 25, almost all UI components and data tables: `Editor.svelte`, `InteractiveInstructionEditor.svelte`, `SearchPanel.svelte`, `routes/exam/session/+page.svelte`, `routes/embed/+page.svelte`, `EditorPane.svelte`, `SymbolsPanel.svelte`, `ScreenRenderer.svelte`, `lib/projectSearch/projectSearch.svelte.ts` and others. The emulator, project, listing and pseudocode modules all have direct tests.

## Phase 1: agent review

25 Opus agents ran two at a time for about three hours: 17 reviewers and 8 verifiers. They produced 230 findings:

- **60 bugs.** 59 confirmed, 1 plausible, none refuted. Most were proved with a scratch test the verifier wrote, ran and deleted. The rest were proved by tracing the code. Several verifiers corrected the reviewer's scenario, line or fix. I re-read three of them against the code (x86 `waitForClock`, the revision-0 failure notice, the project page's `save()`), and they hold.
- **170 simplifications.** 80 worth doing, 88 marginal, 2 rejected. The 80 worth doing would remove about 5,700 lines (3.4% of the source) once overlapping findings are counted once. The marginal ones would remove about 1,400 more.

Every finding, with its failure scenario, suggested change and verifier's reasoning, is in `codebase-review-findings.md` beside this file. That appendix is kept local, not committed. The ids below point there.

### High-severity bugs

1. **x86: `sleep()`, `usleep()` and `nanosleep()` in a C program wait about 24.8 days** (`s3-x86-z80-bugs-1`). glibc sleeps on `CLOCK_REALTIME`. `X86Emulator.waitForClock` subtracts the program's monotonic time from a deadline on the epoch clock, then caps the wait at 2³¹ ms. The Core already passes the remaining time, so the fix is small.
2. **MIPS/RISC-V: Undo after a failed Step or Run rewinds into the middle of a library call** (`s2-mars-m68k-bugs-1`, same root as `s1-emulator-core-bugs-2`). The MARS adapters do not implement `_getInstructionsExecuted`. As a result, a Step or slice that throws records nothing in the Undo ledger, and the next Undo takes back a whole earlier grouped library stretch. The verifier reproduced it on both Cores. The fix is a counter around each Core run call. A Core-side instruction counter would be cleaner, since MARS and RARS already keep instruction serials.
3. **One non-UTF-8 File breaks almost every coding-agent tool** (`s8-shared-ui-bugs-1`). The agent reads every File as text, and a single binary File makes `view_file` and `list_files` fail. The x86 Build output that `saveBuildOutput` writes is such a File.
4. **Retired course redirects never reach the deployed site** (`s9-routes-docs-combined-1`). They run only in a server load, but the site is static and nothing prerenders those paths.
5. **A failed browser save is reported as success** (`s9-routes-docs-combined-2`). `ProjectStore.save` reports an IndexedDB failure as a result rather than rejecting. The project page shows the error toast but still returns `true`, so the Save button disappears and leaving the page no longer warns. `importProject` has the same gap: it reports "Overriden project!" after a failed write (`s4-workbench-model-bugs-3`).

### Medium-severity bugs

| Id                             | What goes wrong                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s1-emulator-core-bugs-1`      | Stop or Build during a Testcase run does not end it: the remaining Testcases run, and stale results reappear after Stop. Cancellation is per execution, not per run.                                |
| `s1-emulator-core-bugs-2`      | MIPS/RISC-V: a run slice that ends in a runtime error is not counted in the Undo ledger (same root as high bug 2).                                                                                  |
| `s1-emulator-core-bugs-3`      | When an analysis Worker dies, its failure notice (revision 0) is dropped by every session, so diagnostics stay pending until a reload. A regression: 549dc3d8 changed the check from `<=` to `===`. |
| `s2-mars-m68k-bugs-2`          | Undo's restoring stores to the MARS MMIO transmitter reach the Terminal: restoring a form feed wipes the output, and undoing a Poke prints a character.                                             |
| `s3-x86-z80-bugs-2`            | x86 memory view: one unmapped byte turns the whole read into zeros, so the `??` cells for unreadable bytes never appear.                                                                            |
| `s4-workbench-model-bugs-1`    | Renaming any File clears every Source map, which turns off C/C++ Breakpoints and the mapped split view.                                                                                             |
| `s4-workbench-model-bugs-2`    | Edits made in the last 250 ms before the tab closes are lost: the autosave debounce is never flushed on `pagehide`.                                                                                 |
| `s4-workbench-model-bugs-3`    | `importProject` reports success after a failed IndexedDB save.                                                                                                                                      |
| `s5-compile-listing-re-bugs-1` | The C include scan treats a `/*` inside a `//` comment or a string as a comment start, hides the `#include` lines after it, and those headers are never uploaded to Compiler Explorer.              |
| `s5-compile-listing-re-bugs-2` | `#include"x.h"` with no space is not followed.                                                                                                                                                      |
| `s5-compile-listing-re-bugs-3` | The documentation search client never listens for Worker errors, so a Worker that fails to load leaves every search pending forever.                                                                |
| `s6-workbench-ui-bugs-1`       | Preview makes a new Blob URL and reloads the PDF or media whenever any File in the Project is written.                                                                                              |
| `s6-workbench-ui-bugs-2`       | Markdown Preview re-renders and re-creates every image Blob on each keystroke, so its image cache never hits.                                                                                       |
| `s7-project-ui-bugs-1`         | Explorer rename and create pass the path as typed (`sub/../b.s`), not as stored. For an Entry file, `renameProgram` then throws after the File has already moved.                                   |
| `s7-project-ui-bugs-2`         | `ProjectCard` rewrites the whole Project on every blur, even with no edit, and moves it to the top of the list.                                                                                     |
| `s8-shared-ui-bugs-2`          | The agent's `write_to_file` with a language switch writes to the old language's entry path on `/chat`.                                                                                              |
| `s8-shared-ui-bugs-3`          | The agent builds with an Undo history of 100 instead of the Program's setting. The user's own Debug session inherits it.                                                                            |
| `s9-routes-docs-combined-3`    | Documentation sidebars and hubs have drifted from the Chapter lists: Synth, Complete documentation and other Chapters are not linked.                                                               |
| `s9-routes-docs-combined-4`    | Unlocking a finished exam re-enables editing but not the fullscreen and visibility guards.                                                                                                          |
| `s9-routes-docs-combined-5`    | Reloading an exam keeps the answers but restarts the time limit and the fullscreen-exit count. **Intended:** the owner decided a reload should not keep the original limit, so this is not a bug.   |
| `s9-routes-docs-combined-6`    | x86 and Z80 instruction pages prerender "Loading..." instead of their example program (checked in the built HTML).                                                                                  |
| `s9-routes-docs-combined-7`    | Project page: a corrupt share link or a database error leaves it on "Loading..." forever, and Back after saving a shared project shows the wrong project.                                           |
| `s9-routes-docs-combined-8`    | Plausible, not proved: unguarded clipboard writes, so the exam builder could lose its only output.                                                                                                  |

### Low-severity bugs

- **Emulator core:** AltGr characters never reach the Screen keyboard on Windows (`s1-…-4`). Format Document changes NASM backquoted strings that contain `;` (`-5`). Memory views lose the changed-byte highlight when the Stack tab scrolls (`-6`). A failed Emulator chunk import is cached for the session (`-7`). Symbol ranges point into the directive when the name occurs inside the keyword, as in `.eqv e 5` (`-8`).
- **MARS and M68K:** History shows negative addresses for stores at or above `0x80000000` (`s2-…-3`). The M68K `incbin` rewrite mixes Unicode-scalar and UTF-16 columns (`-4`). M68K signature help names `(An)+` and `-(An)` as `(An)` (`-5`). MIPS History shows the Core-internal heap and stack restores as rows, while RISC-V hides them (`-6`).
- **Z80:** macro-expansion notes use the unnormalized include path, so they never show in included Files (`s3-…-3`).
- **Workbench model:** Save does not flush pending Hex editor typing (`s4-…-4`). `Db.getProject` returns a default M68K project for a missing id (`-5`). A database failure on the first load looks like an empty project list (`-6`). A failed Monaco import is cached forever (`-7`). The number hover reads `0B800h` as binary (`-8`).
- **Listings and runtime:** `generateListing` throws when `main` is a data symbol (`s5-…-4`). The RV32 Runtime-library hover puts a `long long` in one register instead of a pair (`-5`).
- **Workbench UI:** the Pixel editor swallows Shift+B, the Build shortcut (`s6-…-3`). Edit history disables Undo and Redo for every File because of the focused pane's own read-only reason (`-4`).
- **Project UI:** in History, "Undo to here" does nothing on the newest row, and its enable rule disagrees with what it undoes (`s7-…-3`). Deleting a custom theme first switches to it (`-4`). The register hover prints negative values as `000000-1` under the decimal preference (`-5`). The console's "Show compiler errors" button only changes its own colour (`-6`).
- **Shared UI:** the agent's `delete_file` reports success when the FileSystem refused (`s8-…-4`). AiAgent leaks the SDK's connection poll when it unmounts early (`-5`). The agent's state reports read Executable lines from the project File instead of the Listing (`-6`). Tapping an operand symbol does not reveal its line in a collapsed legend (`-7`). Select's type-ahead on a closed list never selects (`-8`). Expanded rows carry over to the next instruction page (`-9`).
- **Routes:** course pages add a second, empty `og:image` (`s9-…-9`). An unknown `language` in an embed URL throws a TypeError instead of "Unknown language" (`-10`). `documentationFor` caches a failed import forever (`-11`).

### What the bugs have in common

1. **Stopping and failure paths are the weak spot.** Cancellation covers one execution but not a whole Testcase run. Rejected lazy imports are cached for good: Emulator chunks, Monaco, `documentationFor`. Two Worker clients hang when their Worker dies: the language analysis session and the documentation search. Four places report a failure as success: project save, `importProject`, the agent's `delete_file`, clipboard writes. A shared lazy import that retries, and one Worker-client module, would remove most of these. The newer Listing, Pseudocode and project-search clients already have the right handshake to copy.
2. **Undo exactness rests on optional adapter hooks.** When an adapter leaves out `_getInstructionsExecuted`, its error paths silently under-count, which causes high bug 2. Peripheral observers also see Undo's restoring stores as program writes, and only the Synth guards against that. A Core-side instruction counter for MARS and RARS, and an Undo flag that every observer honours, would fix both kinds.
3. **`FileSystem.commit` rebuilds every File record on every keystroke.** Caches keyed by record identity therefore never hit, which causes both Preview bugs. It also decodes every File on each keystroke in a large Project. Keeping the records of untouched Files in `commit`, as `changeBytes` and `annotate` already do, fixes it at the source.
4. **The coding agent's tools follow their own rules instead of the Workbench's.** Six bugs come from this: reading Files as text, a fixed Undo size, swallowed refusals, reading Files where the Listing is meant, and a stale entry path. Routing the agent's file and build actions through the session helpers the UI uses would remove the whole class.
5. **Copies drift.** MIPS and RISC-V already decode back steps differently (`s2-…-6`). The documentation sidebars have drifted from the Chapter data that ADR 0025 made the single source (`s9-…-3`). Both are arguments for the merges below.

### Simplifications

The biggest wins, with line estimates from the verifiers' recounts:

|    Lines | Change                                                                                                                                                                                                                                                  | Findings                                                                   |
| -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
|   ~1,440 | One shared documentation layout and hub page (550), instruction index (450), Chapter page (350) and instruction page (90) instead of five per-language copies. This also fixes the sidebar drift and the x86/Z80 "Loading..." pages.                    | `s9-…-combined-12` to `-15`                                                |
|   ~1,100 | MARS family layer: the MIPS and RISC-V adapters become one `mars/MarsEmulator` (600), one completion, hover and signature provider (350), plus shared back-step mapping, documentation helpers and diagnostic lines.                                    | `s2-…-simplify-1`, `-2`, `-5`, `-6`, `-10`, `-17`                          |
|     ~325 | `mips.ts` and `riscv.ts` build the same Chapters (one `marsChapters(dialect)`, 250); the MARS check pipeline exists three times (75).                                                                                                                   | `s9-…-combined-16`, `s1-…-simplify-2`                                      |
|      690 | Delete `AssemblyCodingHarness`: dead production code that only its own test keeps alive.                                                                                                                                                                | `s8-…-simplify-1`                                                          |
|      280 | `themeStore`: five 69-line theme literals that differ in 7 colours become one table and a factory.                                                                                                                                                      | `s4-…-simplify-1`                                                          |
|     ~200 | Dead adapter API in `BaseEmulator` and all five adapters (`_getStatus`, `EmulatorStatus`, `_getRegisterValuesRecord`, unused getters), plus dead `Register` helpers.                                                                                    | `s1-…-simplify-1`, `-4`; overlaps `s2-…-4`, `s3-…-6`                       |
|     ~150 | One prompt tray: `AnnotationPrompt` and `PatchPrompt` share a `PromptTray` component (90); the tray CSS copied into six components becomes mixins (60).                                                                                                 | `s6-…-simplify-1`, `s8-…-simplify-9`                                       |
|      110 | M68K operand completions: 14 copy-pasted if-blocks become one table.                                                                                                                                                                                    | `s2-…-simplify-3`                                                          |
| ~70 each | One `partitionPoint` helper for about 16 hand-written binary searches. The embed URL encoder shared with the playgrounds.                                                                                                                               | `s5-…-simplify-1`, `s9-…-combined-17`                                      |
| ~60 each | Dead storage modes in `DefaultCodingAgent` (65). One operand signature-help factory for four languages (60). The duplicated small and fullscreen columns in `InteractiveInstructionEditor` (60). `DebugToolsFloating` looping over `debugTools()` (50). | `s8-…-simplify-4`, `s3-…-simplify-2`, `s8-…-simplify-3`, `s6-…-simplify-2` |

The other worth-doing items are 3 to 50 lines each, such as the six remaining `createEventDispatcher` uses, unused props, and duplicated status-line markup. Reviewers also kept noting the same small helpers written again and again:

- project-path helpers (basename, dirname, join), at about 20 sites;
- `error instanceof Error ? error.message : String(error)`, at 17 sites;
- `Object.prototype.hasOwnProperty.call` where `Object.hasOwn` is used elsewhere, at 14 sites;
- LRU eviction, 7 copies;
- the Worker ready handshake, 4 copies.

### Large files

None of these refactors saves many lines. Each would make code easier to find and test, so each deserves a short design note before it starts.

- **`WorkbenchSession.svelte.ts` (4,565 lines).** Its own section headers are the seams: renames and comments, pane navigation, edit-journal glue, execution (build, run, test, compile), tabs and drag-and-drop, keyboard, and Programs and Settings. The verifier counted a net saving of about 10 lines and about 250 test call sites to rewrite, so it is worth doing for navigation, not for size.
- **`GenericEmulator.svelte.ts` (2,914 lines).** No seam reduces code: the Testcase runner and the Poke machinery reach into a dozen private fields. An `UndoLedger` class (about 20 lines more) would make the ledger testable on its own, which matters given the Undo bugs above.
- **`X86Emulator.svelte.ts`.** The running-Executable state (about 400 lines) would become an `X86ExecutableSession`.
- **`InteractiveInstructionEditor.svelte` (1,264 lines).** It re-implements the session's build, run, step and undo flow. That orchestration belongs in its `PlaygroundSession`.
- **Agent `tools.ts` (2,189 lines).** It would split into file, breakpoint, execution and memory tools, as `sourceTools.ts` already is.

## Suggested order of work

1. **The five high-severity bugs,** each with its regression test. The verifiers' scratch tests were deleted, but the appendix describes each one well enough to rewrite.
2. **Medium bugs, grouped by the patterns above:** failure paths (a lazy import that retries, Worker error handling, save results), `FileSystem.commit` record identity, the agent's tools through the session helpers, then the rest one by one.
3. **Deletions:** the harness, the dead adapter API, `themeStore`, dead props and members. This is low risk and about 1,300 lines.
4. **The MARS family layer,** together with the Core-side changes it suggests. MARS/RARS need an instruction counter (high bug 2) and aligned `JsBackStep` payloads; RISC-V needs bitness set per instance. These are Core releases, and breaking changes are fine.
5. **The documentation routes.**
6. **A sweep of the low bugs and the small simplifications,** then `no-floating-promises` in the ESLint config.
7. **The large-file splits,** where you want them, each after a short design note.
