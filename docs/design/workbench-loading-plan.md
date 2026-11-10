# Workbench loading: plan

Status: Stages 0 to 3 implemented on 2026-11-10, uncommitted; Stage 4 not done (see [As built](#as-built)). The owner answered the open questions the same day (see [Owner decisions](#owner-decisions)). Recorded in [workbench.md](workbench.md) ("Loading, 2026-11-10"), [ADR 0080](../adr/0080-the-workbench-appears-before-its-emulator.md) and [design-system-changes.md](design-system-changes.md) (O-140 to O-143).

Written after reading the project page, the Workbench, `EmulatorLoader`, `WorkbenchSession` and `Editor.svelte` at `main` 2c48b6a7. Paths are under `packages/asm-editor/src/` unless they say otherwise. No timings were taken for this plan; Stage 0 takes them.

## What changes

Today opening a Project shows a blurred, empty page with one spinner until **everything** the Workbench needs has arrived, then the whole Workbench appears at once, and the editor pane shows a second spinner until Monaco is ready.

After this plan the Workbench appears as soon as the Project has been read, with its rail, panels, Files, tabs, Terminal and the code itself on screen. Only what needs the **Core** (Build, Run, the Debug session) or **Monaco** (typing in the editor) waits for it, and says what it waits for in its own place.

## Starting point

What the page waits on today, in order:

| #   | Wait                   | Where                                                                                                                                                                                        | What shows meanwhile                                                 |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | The route's JavaScript | SvelteKit; `share`/`exam` are prerendered, an id is served by the 404 fallback                                                                                                               | `app.html` (`share`/`exam`: the prerendered overlay)                 |
| 2   | The Project            | `loadProject` in `routes/projects/[project]/+page.svelte`: IndexedDB read, a link's decompression, or an example archive **fetched over the network** (`loadExample`)                        | `loadingScreen`: a full-page blur with "Loading…"                    |
| 3   | The Core               | `EmulatorLoader` (`components/shared/providers/EmulatorLoader.svelte`) awaits `createEmulator` → `loadEmulator` (the adapter chunk with its Core, and for MIPS/RISC-V the WebAssembly build) | the same `loadingScreen`, passed in as Workbench's `loading` snippet |
| 4   | Monaco                 | `Editor.svelte` `onMount` awaits `Monaco.get()` and `Monaco.registerLanguage(language)`; the page starts `Monaco.load()` early in its `onMount`                                              | inside the editor pane: "Loading editor…" spinner                    |

Waits 3 and 4 run side by side; wait 3 starts only after wait 2.

Why wait 3 blocks everything: `Workbench.svelte` renders `WorkbenchShell` inside `EmulatorLoader`'s `{:then}`, and `WorkbenchShell` constructs `new WorkbenchSession(project, emulator, …)`, which takes the Emulator as a constructor argument (`lib/workbench/WorkbenchSession.svelte.ts:667`). The session reads `this.emulator` about 60 times and 15 Workbench components read `session.emulator` (47 sites).

What actually needs the Core, from that reading:

| Needs the Core                                                                                                                                         | Does not                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build, Run, Step, Undo, Testcases' Run all, the Assistant's execution tools                                                                            | The rail and every side panel: Explorer, Search, Documentation, Testcases list, Edit history, host panels                                                       |
| The Debug column, registers, memory, Symbols, Pokes, the floating Debug tools (all built at the first Build anyway: `debugUiBuilt`, `debugToolsBuilt`) | File tabs, the Program picker, Save, Share, the top bar                                                                                                         |
| `compilerDiagnostics`, `errors`, `runInfo`                                                                                                             | The language worker's diagnostics, completion and hovers (`ProjectLanguageSession`, started in `session.mount()`, runs in its own worker)                       |
| Core-specific Settings such as Display (`configurableDisplay` reads `emulator.setDisplay`)                                                             | The Terminal, Screen, Keyboard, Mouse and Audio objects: `EmulatorLoader` makes them with `createInjectedPeripherals` **before** the Core loads (ADR 0004)      |
| Breakpoints, which live in the Emulator's state (`emulator.toggleBreakpoint`, reached only through `session.toggleBreakpoint`, :3952)                  | The code itself, which `content/codeBlocks.ts` already colours without Monaco (`highlightedAssemblyCode`, `highlightedCppCode`, shared colours with the editor) |

## Approach

Four stages, each shippable alone. Stage 2 is the one that answers the request; Stages 1 and 3 fill the two remaining blank spots.

### Stage 0: measure

Add `performance.mark` calls at: page mount, Project read, Core chunk loaded, Emulator constructed, Workbench mounted, Monaco ready, first editor paint. Record cold and warm visits per language (MIPS, RISC-V, M68K, Z80, x86) on a production build, served with a capped-bandwidth server rather than CDP throttling (CDP misses workers). Keep the marks behind a dev flag or remove them after; the numbers go into this plan as the before and after.

### Stage 1: the Workbench's frame before the Project

Replace the blurred overlay of wait 2 with `WorkbenchFrame.svelte`: the Workbench's cards drawn empty, at the sizes `workbenchLayout` remembers (rail width, side panel width if one was open, bottom panel height, Cards or Lines). No text, no spinner for the first second; after a second, a quiet "Opening the project…" in the editor card, which matters for an example fetched over the network and for a large Project. `aria-busy="true"` on the frame, one polite announcement.

The Project's language is not known yet, so the frame uses the neutral theme; the example's language is known from the examples index if it is cheap to read there, otherwise neutral too. The error states (`ErrorState`) stay as they are.

### Stage 2: the Workbench before its Emulator

The Workbench mounts as soon as it has the Project. The Emulator arrives later and is **attached** to the session.

1. **Who loads the Core.** `Workbench.svelte` stops using `EmulatorLoader`. A small helper, `startEmulator(language, source, settings)`, takes from `EmulatorLoader` what both need (peripherals with `createInjectedPeripherals`, the browser audio output, the audio Preferences, `createEmulator`) and returns `{ peripherals, emulator: Promise<Emulator> }`. `EmulatorLoader` uses the same helper, so playgrounds, embeds, lectures and chat keep their behaviour.
2. **The session without an Emulator.** `WorkbenchSession` takes `peripherals` and an `Emulator | Promise<Emulator>`. `session.emulator` becomes `$state.raw<Emulator | undefined>`, plus `session.coreStatus: 'loading' | 'ready' | 'failed'`. Every derived that reads it gets an explicit "no Core yet" value (`debugSession` false, `errorStrings` empty, `configurableDisplay` false, `canPoke` false …). The Settings panel's Core-specific parts, such as Display, appear when the Core attaches, not before (owner decision 2). TypeScript lists every site; that list, not a stand-in object, is the safety net (see decision 2).
3. **Hooks done once at attach.** What the constructor does to the Emulator today moves to `attach(emulator)`: `setBreakpointResolver`, `setBuildOutputHost`, `previousBuildSources`, the `pc` register, and the effects that push memory size, Sources and Settings into it (`setGlobalMemorySize`, `setSources`, `setScreenHistoryBudgetMb` …), which simply re-run when `emulator` changes. Edits made while the Core loads reach it through the `setSources` effect.
4. **Components.** Components shown before a Build read `session.peripherals` for the Terminal (`WorkbenchDesktop` reads `session.emulator.peripherals.terminal` at construction today) and the optional `session.emulator` elsewhere. Components that exist only in a Debug session (`DebugColumn`, `RegistersArea`, `ScreenArea`, `DebugToolContent`, `SymbolsPanel` …) read `session.core`, a getter that returns the Emulator and throws without one, since they cannot mount before a Build.
5. **Breakpoints set while loading.** `session.toggleBreakpoint` keeps them in a session list until the Core attaches, then hands them over. The editor's glyphs read the same list either way.
6. **Build while loading.** Build stays pressable. Pressed before the Core arrives, it shows the Build busy state with the phase "Loading the MIPS emulator…" (workbench.md, "Build says what it waits for", decision 2), then builds. Cancel works as during any Build. Run, Step and Undo cannot be pressed before a Build exists, so they need nothing new. Testcases' Run all and the Assistant's execution tools await the same promise. A shared link's `startSharedProject` calls `session.build`, so it waits too; `onReady` keeps firing at mount.
7. **A Core that fails to load.** Instead of replacing the whole Workbench with `ErrorState`, the Workbench stays, so the person can still read, copy and save the code. The dock's Build is replaced by a notice, "The MIPS emulator didn't load", with Reload; the Problems tab gets the same line. `failureActions` (Back to projects) is kept in the notice for hosts that pass it.
8. **Language change.** `{#key project.language}` stays: changing the Target remakes the session, as today.

### Stage 3: the code before Monaco

Replace the "Loading editor…" spinner in `Editor.svelte` (:1202) with the open File's text, coloured by `highlightedAssemblyCode` / `highlightedCppCode`, with line numbers, in the editor's font, size, line height, padding and gutter width taken from the same Preferences Monaco reads, so the swap to Monaco moves nothing. It is read only and has no caret, and a small spinner in a corner of the pane (labelled "Loading editor…", not announced) says the editor is still on its way (owner decision 3); a File that is not text keeps the large spinner. Every host of `Editor.svelte` gets this, playgrounds included. Long Files render only their first screenful.

### Stage 4: start the downloads sooner (small)

Call `loadEmulator(language)` as soon as the language is known: right after the Project read today (already close), and for an example before its archive arrives, if the examples index names its language. Optional `modulepreload` for the commonest Core is out of scope until Stage 0 shows it matters.

## Decisions taken by default

1. **Build before the Core is ready waits** rather than being disabled, and names the wait as a Build phase. A disabled Build would look broken for the second it lasts.
2. **`session.emulator` becomes optional** rather than being filled by an inert stand-in Emulator. The `Emulator` type is large, a stand-in would have to fake every member, and a faked member that a later change starts reading would silently give a wrong answer; an optional field makes TypeScript point at every reader.
3. **The Core is not split out of the Emulator.** Making each adapter (`MIPSEmulator` and the rest, subclasses of `GenericEmulator`) construct without its Core would touch all five adapters and their Cores' imports for no visible gain over Stage 2.
4. **A failed Core keeps the Workbench open** with a notice (Stage 2, step 7), instead of the full-page error.
5. **The code preview of Stage 3 is not editable** (settled by owner decision 3). Keys pressed on it before Monaco arrives are not kept.
6. **Scope:** Stages 1 and 2 cover the two Workbench hosts (the project page and `ExamAssemblySection`). Other `EmulatorLoader` hosts keep their spinner and get Stage 3 for free.

## Owner decisions

Answered on 2026-11-10.

1. **Stage 1's frame is wanted.**
2. **Core-specific Settings (Display) appear only when the Core attaches**; no per-language table of what each Core offers.
3. **The code preview is read only while Monaco loads, with a spinner somewhere in the pane**; keys typed on it are not replayed.

## ADR

[ADR 0024](../adr/0024-workbench-is-a-host-agnostic-shell.md) says the Workbench "creates the Project's Emulator", which stays true; what changes is that it no longer waits for it to mount. A short new ADR, "The Workbench mounts before its Emulator", records Stage 2 and decision 2, and ADR 0024 gets a note pointing to it.

## Steps

| Step | Work                                                                                                                                            | Check                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Marks, measurement script, numbers into this plan                                                                                               | Numbers for 5 languages × cold/warm                                                                                                                                                    |
| 2a   | `startEmulator` helper; `EmulatorLoader` on it                                                                                                  | Existing `EmulatorLoader.dom.test.ts` and playground tests pass unchanged                                                                                                              |
| 2b   | `WorkbenchSession`: optional `emulator`, `peripherals`, `coreStatus`, `attach`, buffered breakpoints, Build waits                               | Session tests: constructed with a pending promise; Build pressed before attach builds after it; breakpoints kept; edits before attach reach the Core; a rejected promise sets `failed` |
| 2c   | Components onto `session.peripherals` / `session.core`; `Workbench.svelte` without `EmulatorLoader`; failure notice                             | `pnpm check` clean; dom tests for the dock while loading and after a failure                                                                                                           |
| 3    | Static code preview in `Editor.svelte`                                                                                                          | Dom test; a browser check that text does not move when Monaco takes over (screenshot before/after at the same scroll)                                                                  |
| 1    | `WorkbenchFrame.svelte` on the project page                                                                                                     | Browser check: frame matches the Workbench's cards for Cards and Lines, desktop and phone                                                                                              |
| 4    | Earlier `loadEmulator`                                                                                                                          | Stage 0 numbers again                                                                                                                                                                  |
| —    | `workbench.md` updated, ADR, entry in [design-system-changes.md](design-system-changes.md) for the frame and the preview, Stage 0 numbers after | Full gates: `pnpm check`, tests, lint                                                                                                                                                  |

## Risks

- **Effects that read the Emulator during construction.** Each one has to be found and moved to `attach`; one missed reads `undefined` at mount. The type change finds the reads, not the ordering, so 2b's tests construct the session with a pending promise on purpose.
- **Reactivity across the swap.** Deriveds that read `this.emulator.x` must re-run when `emulator` changes from `undefined`, which a `$state.raw` field gives; anything that copied a value out of the Emulator once (`previousBuildSources`, `pc`) is set again in `attach`.
- **Tests that build a session from a stub Emulator.** The constructor keeps accepting a plain `Emulator`, attached at once, so they keep working.
- **Two Monaco editors or two sessions.** Unchanged: the arrangement swap and `{#key project.id}` stay as they are.

## As built

What the implementation does differently from the stages above:

- **No `session.peripherals`.** The Terminal is made by the Emulator, not with the injected peripherals, so the bottom panel shows an empty Terminal of the session's own (`session.terminal`) until the Core loads, then the Emulator's; the panel's Terminal view is made anew as it switches, before anything was written to it. `startEmulator` returns only the promise.
- **The Workbench makes its Emulator through `WorkbenchShell`**, which calls the function `Workbench.svelte` hands it once, so the session is made with the promise.
- **The Testcases panel waits for the Core** (a small spinner), since the Core names the registers a Testcase checks.
- **The language worker starts once Monaco has loaded, or the Core has settled if that comes first; the Documentation search's preload once the Core has settled.** Both started at the Workbench's mount, which used to be after the Core; started at the new, earlier mount, they downloaded beside Monaco and the Core and made the editor ready about 0.5 s later on a slow connection. The Measurements below were taken with the worker waiting for the Core; it now starts with Monaco, a review having found that an editor ready before it had no links (`#include`) or symbols until the person typed, and none at all while a Core's download stalled. So the live Diagnostics do not show while Monaco loads.
- **A test run waits for the Core as a Build does**, shown in Build's place ("Loading the MIPS emulator…", Cancel); Stop, Cancel or the Workbench going ends the wait. With a failed Core, Build and Test do nothing; a Build pressed while it loaded logs why it did not build.
- **The coding agent does not wait:** its tools answer that the emulator is still loading.
- **Not built:** the Problems tab's line for a Core that did not load (the Log and the dock say it); `failureActions` for a failed Core (the hosts' own bars have Back); the frame's side panel at its remembered width; a neutral theme for the frame, which takes the theme of a new Project's language and changes with the Project's.
- **The Terminal view is made anew as the Core arrives**, so a Command line being typed in at that moment loses the keyboard; what was typed is kept.
- **The frame reads the device class once**, without listening for changes: it lasts as long as a read of the Project.
- **Reload has its own icon** (the redo arrow `ErrorState` uses), through an optional `icon` on the dock's `DockBuildButton`.

## Measurements

A production build served with brotli and a week's cache on `/_app/immutable/`, headless Chrome 153 at 1600×900, a shared link (`/projects/share?project=`) with a three-line program, the median of three visits per row; cold is a new profile, warm the same page again 3 s later (the service worker's cache included). "Slow" caps the server at 20 Mbit/s with 40 ms per request. The harness is in the session's scratchpad, not the repository. Milliseconds from navigation:

| Link, visit | Language | Code on screen, before → after | Monaco ready, before → after |
| ----------- | -------- | ------------------------------ | ---------------------------- |
| Fast, cold  | MIPS     | 1171 → 533                     | 1171 → 1042                  |
|             | RISC-V   | 1212 → 525                     | 1212 → 1131                  |
|             | M68K     | 937 → 526                      | 937 → 944                    |
|             | Z80      | 966 → 523                      | 966 → 918                    |
|             | x86      | 1166 → 604                     | 1166 → 1095                  |
| Fast, warm  | MIPS     | 797 → 642                      | 797 → 873                    |
|             | RISC-V   | 815 → 665                      | 815 → 979                    |
|             | M68K     | 733 → 611                      | 733 → 686                    |
|             | Z80      | 727 → 592                      | 727 → 663                    |
|             | x86      | 792 → 593                      | 792 → 831                    |
| Slow, cold  | MIPS     | 3018 → 1866                    | 3018 → 2937                  |
|             | RISC-V   | 3095 → 1827                    | 3095 → 2913                  |
|             | M68K     | 2826 → 1791                    | 2826 → 2810                  |
|             | Z80      | 2784 → 1784                    | 2784 → 2772                  |
|             | x86      | 2947 → 1813                    | 2947 → 2913                  |

Before, the code, the Workbench and Monaco all appeared at once. Now the Workbench and its code appear with the page's first paint, 0.4 to 0.7 s sooner on a fast connection and 1.0 to 1.3 s sooner on the slow one, and Monaco is ready no later on a first visit. On a warm visit Monaco is ready up to 0.16 s later for RISC-V, MIPS and x86, whose Cores are now made while Monaco makes its editor rather than before it; the code has been on screen for that time. Single runs vary by about ±0.1 s.

With a shared link, the Project is read from the address at once, so the frame of Stage 1 never shows; it shows while a stored Project is read from the browser's storage and while an example's archive downloads.
