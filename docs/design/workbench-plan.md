# Workbench: implementation plan

Companion to [workbench.md](./workbench.md), whose decisions and [ADR 0024](../adr/0024-workbench-is-a-host-agnostic-shell.md) this plan implements. Written on 2026-09-30, after the design interview closed. Terms are the glossary's: **Workbench**, **Interactive editor**, **Debug tools**, **Log**.

## Ground rules

- **Work on a branch** (`feat/workbench`). Transitional states between phases are not released.
- **Every phase ends clean:** `npm run check`, `npm run lint` and `npm test` pass, and the phase's browser rows are added to [manual-verification.md](../manual-verification.md) and walked.
- **Extract, then move.** A component is split out of its floating wrapper and proven in the old UI before the Workbench uses it. The logic of `Project.svelte` moves into a session object and is proven behind the old layout before the new layout is built on it.
- **The Interactive editor does not change behaviour.** Where it shares a component that gets split (`TestcasesEditor`, `StdOutRenderer`), it keeps the wrapper it uses today. Playgrounds and the documentation pages are rechecked in phases 1 and 7.
- **Keep the design system.** Theme tokens, `Button`, `Card`, `SegmentedControl`, `DraggableContainer` and the unplugin-icons sets. No new dependency is needed: the splitter is our own.
- **Test at two levels.**
    - Pure logic is plain TypeScript tested under node (`*.test.ts`).
    - Components with behaviour worth pinning get jsdom tests (`*.dom.test.ts`, with the `$lib/storage/db` mock the existing DOM tests use).
    - The whole Workbench is checked in the browser, driven headless as in the earlier plans.

## Target structure

```
src/components/specific/workbench/
  Workbench.svelte            public component: host API, EmulatorLoader, session, layout choice
  WorkbenchDesktop.svelte     rail, side panel, editor area, bottom panel, debug column, splitters
  WorkbenchCompact.svelte     tablet and phone: drawer, controls bar, stacked sections
  TopBar.svelte               back, title, Save, ExecutionControls
  ExecutionControls.svelte    Test, Build | Undo, Step, Run/Pause, Stop
  IconRail.svelte             top and bottom groups, active state, Testcases result dot
  SidePanel.svelte            panel chrome: title, maximize, close; keeps opened panels mounted
  FileTabs.svelte             tab row with the version label
  EditorArea.svelte           FileTabs, Editor, binary and missing-file overlays
  BottomPanel.svelte          Terminal | Log | Problems
  TerminalView.svelte, LogView.svelte
  CollapsibleSection.svelte   the section chrome of Sections mode and of the compact layouts
  DebugColumn.svelte          registers | memory, Screen, Debug tools
  DebugToolsFloating.svelte   the Debug tools' DraggableContainer windows
  panels/                     ExplorerPanel, TestcasesPanel, DocumentationPanel, AgentPanel,
                              SettingsPanel and its sections
src/lib/workbench/
  WorkbenchSession.svelte.ts  state and actions moved out of Project.svelte
  fileTabs.ts                 the tab list rules
  workbenchLog.ts             Log entries
  deviceClass.ts              phone | tablet | desktop, and whether Floating is possible
  hostApi.ts                  the host API types
src/stores/workbenchLayoutStore.svelte.ts   sizes, collapsed sections, floating windows
src/components/shared/layout/Splitter.svelte
```

The host API (`hostApi.ts`), refined during phase 4:

```ts
type PanelAccess = 'on' | 'readonly' | 'off'

interface WorkbenchProps {
    project: Project // the record, FileSystem included; the Workbench creates the Emulator
    readonly?: boolean
    onBack?: () => void
    onSave?: (options: { silent: boolean }) => void // autosave calls it with silent: true
    onShare?: () => void
    onChange?: () => void // every change to the Project, for the host's unsaved flag
    unsaved?: boolean // shows Save, when onSave is given
    access?: Partial<
        Record<'explorer' | 'testcases' | 'documentation' | 'agent' | 'settings', PanelAccess>
    >
    documentationLinks?: boolean // false in the exam
    hostPanels?: WorkbenchHostPanel[] // { id, title, icon, group, content: Snippet<[{ project, emulator }]>, defaultOpen?, maximizable? }
    hostLinks?: WorkbenchHostLink[] // { id, title, icon, onClick }
    activePanel?: string | null // bindable, so a host's own chrome can open a panel
    loading?: Snippet
}
```

The Workbench owns the Emulator: it wraps `EmulatorLoader` with the settings the projects page builds today (the display, the two history budgets, `peripherals.fileSystem`), so both hosts get the same Emulator. A host re-keys the Workbench to switch Projects, as the projects page does with `project.id` and the exam with its section. `Monaco.load()` and `Monaco.dispose()` stay in the projects page: the exam page's C editors share Monaco, and the Workbench unmounts on every section change.

## Phase 0: foundations

- **`deviceClass.ts`** exports `deviceClassFor(width)`: phone up to 640px, tablet up to 1000px (today's breakpoint), desktop above. It also exports `canFloat(deviceClass, canHover)`: Floating needs a desktop width and `(hover: hover)`, so an iPad in landscape, which is wide but has no hover, uses Sections. A small reactive wrapper over `matchMedia` goes beside it. Tests for both functions.
- **`fileTabs.ts`** holds the tab list as paths plus the active path. It exports `open` (append if missing, focus), `close` (never the last; focus the neighbour), `rename`, `remove` (a deleted File's tab closes; the last one falls back to the Entry path) and `reset(entry)`. Being on the snapshot stays the session's `ProjectSourceSelection`, applied to the active path through the existing `selectProjectFile` rule. Tests.
- **`workbenchLog.ts`** defines entry kinds: Build (result, error and warning counts, duration), test run (each Testcase's outcome, summary), and program exit ("Ran in …", or stopped by a runtime error). The list is capped at 500 entries. Tests for the formatting and the cap.
- **`workbenchLayoutStore.svelte.ts`** persists layout under the localStorage key `asm-editor_workbench_layout`:
    - side panel width per panel id;
    - bottom panel height;
    - debug column width;
    - registers | memory split;
    - debug top | bottom split;
    - collapsed sections;
    - each floating window's `{ open, left, top }`.

    Its `readStoredLayout(json)` is as tolerant as `readStoredPreferences`: unknown ids are dropped, sizes are clamped, and wrong types keep the default. The open panel is not stored; the side panel starts closed. Tests.

- **`preferencesStore`** gains a `choice` type with `options`, and a `section: 'preferences' | 'layout'` field.
    - Two new Preferences: `panelStyle` (`cards` by default, or `lines`) and `debugTools` (`floating` by default, or `sections`).
    - The reader rejects a stored choice that is not one of the options.
    - `showMemory` and `showScreen` stay until phase 7, because `Project.svelte` still reads them.
    - Extend `preferencesStore.test.ts`.
- **`Splitter.svelte`** is a `role="separator"` handle for either orientation.
    - It has a bindable size in pixels with a minimum and maximum, and drags under pointer capture.
    - Arrow keys move it 16px and Home/End jump to the bounds. `aria-valuenow`, `aria-valuemin` and `aria-valuemax` are set.
    - A commit callback fires on release, which is where the layout store writes.
    - DOM test.

## Phase 1: panel contents out of their floating wrappers

Behaviour of the old project editor, the exam and the Interactive editor stays identical; each old wrapper renders the new content component.

- **`Explorer.svelte`** comes out of `FileSidebar.svelte`: the heading actions, the entry warning and the tree, without the toggle button, the overlay and its fly transition. `FileSidebar` keeps them around `Explorer` until phase 7.
- **`testcases/TestcasesList.svelte`** comes out of `TestcasesEditor.svelte`. The Interactive editor keeps `TestcasesEditor`, which is `FloatingContainer` plus the list.
- **`LanguageDocumentation.svelte`** comes out of `FloatingLanguageDocumentation.svelte`: the search input, the language's documentation and `disableLinks`.
- **`user-tools/ProblemsList.svelte`** comes out of `StdOutRenderer.svelte`: the clickable Diagnostics with their related locations. `StdOutRenderer` renders it, so the Interactive editor is unchanged.
- **`memory/StackPointerView.svelte`** comes out of `MemoryTab.svelte`: the address controls and the memory grid.
- **`settings/ShortcutsSection.svelte`** comes out of `ShortcutEditor.svelte`. While it records a key it tells the session to ignore shortcuts, so the key being bound does not also run.
- **`settings/ThemeEditor.svelte`** comes out of `src/routes/themes/+page.svelte`: presets, "Create new theme" and colour rows. The route renders it until phase 7.
- **`exam/ExamReviewAgent.svelte`** comes out of `ExamReviewAgentSidebar.svelte`: the agent with the exam tools, without the floating chrome. The sidebar wraps it.
- **`shared/agent/projectAgent.ts`** holds the project agent's instructions and its "Explain a concept" workflow, moved out of `Project.svelte`'s template so that the old editor and the AI panel share them.
- **Verify:**
    - the projects page's Explorer, Testcases, Documentation, Shortcuts and History;
    - the exam's Documentation and review agent;
    - a Playground with tests and a Screen;
    - `/themes`.

## Phase 2: the exam session hosts a temporary Project

Still on the old editor, so that every host of `ProjectEditor` passes Files before the session drops the single-`code` mode.

- **Build the Project.** Each assembly section builds `makeProject({ name, language, code: answer, testcases })`. The normalizer turns the `code` into the `main.<ext>` Entry file.
- **Wire the Emulator.** `EmulatorLoader` gets `source={{ files, entry }}` and `peripherals.fileSystem`.
- **Pass the Files and hide the Explorer.** `ProjectEditor` gets `files`, `entry` and `fileSystem`, plus a transitional `explorer={false}` so no sidebar appears.
- **Copy the answer back.** An effect copies `project.code` into `assemblyAnswers[section.id]`.
- **Verify:**
    - answers survive a reload through the session snapshot (`asm-editor_exam_session_snapshot:`), and the submission link carries the same answers as before;
    - Test runs the section's Testcases;
    - `readonly` after Finish;
    - review mode opens a submission.

## Phase 3: WorkbenchSession

Move the script of `Project.svelte` into `src/lib/workbench/WorkbenchSession.svelte.ts`. It is created in a component's initialisation with `(project, emulator, host)`, so its effects have an owner. `Project.svelte` then renders from the session and keeps its current layout.

- **What moves:**
    - the source selection and the tab list;
    - `buildGeneration`;
    - the `ProjectLanguageSession` and `registerProjectNavigation` wiring;
    - the derived Diagnostics, analysis status and spinner;
    - Display sync and apply against the Entry file;
    - Settings apply;
    - change tracking: `onChange` always, `onSave({ silent: true })` under autosave, with the 3s code and 250ms FileSystem debounces;
    - `handleProjectFileChange` and breakpoints following renames and deletions;
    - Pokes;
    - `running` and `building`;
    - the actions build, run, pause, step, undo, undo N (History) and test;
    - stop, which clears, re-sets sources and returns to live Files;
    - Log entries;
    - requests to switch the bottom tab;
    - `handleKeyDown`, with panel toggles as callbacks.
- **Drop the single-`code` mode:** `code` as a source, `handleDisplayedFileChange`, `codeOverride`, the `legacy-entry` model key, the `breakpointFile` fallback and the `(no file)` badge case.
- **Verify parity** on the projects page and the exam:
    - Build, Step, Run, Pause, Undo, Undo to here, Stop;
    - breakpoints across Files, and snapshot navigation from the Call stack, History, a Diagnostic and go-to-definition;
    - the analysis spinner and error count;
    - autosave on and off;
    - a `@screen` directive round trip on MIPS;
    - Pokes;
    - Test.

## Phase 4: the Workbench on desktop, and the projects page

- **Shell** (`WorkbenchDesktop`), with a Splitter on every major split and sizes from the layout store:
    - the top bar;
    - the icon rail;
    - the side panel, with a width per panel;
    - the editor area;
    - the bottom panel;
    - the debug column, only while `emulator.canExecute`, i.e. during a Debug session.
- **Panel style.** Set with `data-panel-style` on the Workbench root, through custom properties (`--wb-gap`, `--wb-radius`, `--wb-divider`) that the containers read. Cards is today's look; Lines sets the gap and radius to zero and draws 1px `--tertiary` dividers.
- **Top bar.**
    - Back only with `onBack`; the title; Save only with `onSave` and `unsaved`.
    - The Debug tools pills in the centre, in Floating mode during a Debug session.
    - `ExecutionControls` with the disabled rules `Project.svelte` has today.
    - Run turns into Pause while running, and Test is hidden without Testcases.
- **Rail and side panel.**
    - Top group: Explorer, Testcases, Documentation, then host panels. Bottom group: AI, Share, host links, Settings.
    - A panel stays mounted once opened, which keeps the AI conversation and the documentation search.
    - Shift+D and Shift+P toggle Documentation and Settings.
    - A Build closes the side panel when the editor would fall under its minimum width beside the debug column.
- **Panels.**
    - Explorer, Testcases (read-only through `access`) and Documentation (with `documentationLinks`) use the phase 1 components.
    - AI is `DefaultCodingAgent` with the `projectAgent.ts` configuration.
    - Settings has the sections Project, Display, Preferences, Layout, Shortcuts and Theme:
        - Display is `ScreenDisplayConfiguration`'s content. It is editable only outside a Debug session; the Screen header's Display button opens it read-only.
        - Layout renders the choices with `SegmentedControl`.
- **Maximize.** Documentation and Testcases draw over everything right of the rail and below the top bar. The layer sits above the floating windows and below prompts. The button or Escape restores it.
- **Editor area.** `FileTabs` shows the version label at the right end, and dimmed tabs for Files not analyzed from the Entry file. The `.source-identity` badge goes, and the error count and spinner move to the Problems badge.
- **Bottom panel.**
    - Terminal shows the program's output and runtime errors.
    - Log is the Log.
    - Problems is `ProblemsList`, with a count badge in the worst severity's colour.
    - Switching rules: a failed Build shows Problems, a successful Build shows Terminal, and Test shows Log.
- **Debug column.**
    - The registers area (Status flags, PC, `RegisterFilesPanel`) and the memory area (`MemoryControls` and `MemoryRenderer`) sit behind a Splitter, then the Screen.
    - The Debug tools follow the Preference:
        - Sections: three `CollapsibleSection`s in a wrapping row with a minimum width each.
        - Floating: `DebugToolsFloating`, whose windows use `DraggableContainer`'s `onClose` variant and whose positions persist.
    - Sections is forced when `canFloat` is false.
- **The projects page switches to the Workbench:**
    - it wraps the Workbench in `ThemeScope`, dropping the language theme's select-and-restore;
    - it passes `onBack` and `onSave` (the existing `save`), `onShare` and a Donate host link through `changePage`;
    - it computes `unsaved`:
        - always true for a share link;
        - with autosave on, true only after a failed save;
        - with autosave off, true after `onChange` until the next successful save.
- **Verify** at 1280 × 800, 1440 × 900 and 1920 × 1080, both Panel styles and both Debug tools modes:
    - the phase 3 rows again;
    - persistence of every size and collapsed state across reloads;
    - the Theme section repainting live, with the choice surviving leaving the page;
    - the Display section, editable in Write and read-only in Debug;
    - Save visibility in all three cases;
    - maximize and Escape;
    - rows H5 and H13 to H17 of the hosting-surfaces section, whose controls are now in the top bar.

## Phase 5: tablet and phone

- **`WorkbenchCompact`**, following the brief.
    - Tablet: the rail stays visible and panels open as an overlay drawer beside it.
    - Phone: the top bar holds the drawer button and title; the drawer holds the rail, with back at its top, and the panel.
    - Opening a File or tapping outside closes the drawer.
    - The main column is the editor, then the controls bar, then the bottom panel, then (in a Debug session) the sections: Registers & memory open and scrolling sideways, Screen collapsed, Debug tools.
- **The controls bar** has 44px targets and is sticky below the top bar, so Step stays under the finger while the page scrolls.
- **The editor height** is fixed and identical in Write and Debug; a Build moves nothing above the bottom panel.
- **Scrolling:** the page scrolls up to about twice the viewport, after which the debug sections scroll inside themselves.
- **No tab row, no splitters.** Collapsed states use their own compact defaults.
- **Verify** at 390 × 844 and 834 × 1194, and at 1180 × 820 without hover (Sections forced):
    - no layout shift on Build;
    - repeated Step taps land on the button;
    - Monaco scrolling does not trap the page;
    - the drawer closes on a File pick.

## Phase 6: the exam session on the Workbench

- **Replace `ProjectEditor`** with the Workbench, passing the phase 2 temporary Project and `readonly={examDisabled}`.
    - `access`: Explorer, AI and Settings off, Testcases read-only; `documentationLinks={false}`.
    - Host panels: the prompt (open by default), and in review mode the review agent (`ExamReviewAgent`, with the Emulator from the panel context).
- **The exam header's AI button** sets the Workbench's `activePanel` for assembly sections and keeps the overlay for other section types. The header's Documentation button goes, because the rail has it.
- **Delete `Project.svelte`.**
- **Verify:**
    - the whole exam flow: instructions, sections, the timer, Finish, the submission link, unlock;
    - the prompt panel;
    - read-only after Finish;
    - review mode on an assembly and an open-question section;
    - the Workbench sizing to its container under the exam header;
    - switching between assembly and C sections, so the Monaco models of one do not break the other.

## Phase 7: removals and records

- **Delete:**
    - `src/routes/themes/` and its regex in the root layout's `Footer` list (the sitemap reads the routes itself);
    - `FileSidebar.svelte` (the Explorer stays);
    - `FloatingLanguageDocumentation.svelte`;
    - `settings/Settings.svelte`, `settings/ShortcutEditor.svelte`;
    - the `showMemory` and `showScreen` Preferences, whose stored keys the tolerant reader already drops;
    - `DraggableContainer`'s collapsed (eye) mode, if no caller uses it once the pills are separate from the windows.
- **Rewrite** "The full editor" part of the "Using the editor" Lecture (`src/content/assembly-basics/introduction/using-the-editor/index.md`) for the Workbench.
- **Changelog** entry in `src/routes/changelog/versions.ts`: the new layout, the Settings sections, the two Preferences, and themes moved into Settings.
- **Records:** a "Workbench" section in `manual-verification.md` holding the rows of phases 4 to 6, and the status of this plan.
- **Recheck** that the Interactive editor is unchanged on a Playground, a documentation instruction page, the exam builder and `/chat`.

## Risks

- **The session's effects** need a component owner. Create the session in `Workbench.svelte`'s script, never lazily from an event, or its `$effect`s have no owner.
- **Keyboard shortcuts versus the Settings panel's inputs.** The window handler ignores `INPUT` targets and Monaco, but the shortcut recorder is a button: without the recording flag, rebinding Shift+B would also Build.
- **Sizing inside the exam page.** The Workbench fills its container, and the exam's `Column style="flex:1"` must give it a bounded height (`min-height: 0` along the chain). Otherwise Monaco and the debug column grow without limit.
- **ThemeScope and the Theme section.** On the Default theme, the Workbench wears the language's colours, so choosing "Default" in the section shows MIPS colours in a MIPS Project, and "Create new theme" copies the Default colours rather than the ones on screen. Both match today, since `/themes` also showed Default after leaving the project. Say so in the section's text, or label the preset "Default (follows the language)".
- **Floating windows** are clamped to the viewport by `Draggable`, and must not cover the top bar's controls (H15). They sit below a maximized panel.
- **Monaco inside a scrolling page on phones** can capture touch scrolling; the fixed editor height and the sticky controls bar are the mitigation, and phase 5 checks it.
- **Keeping panels mounted** keeps their reactivity alive: a hidden Documentation panel re-rendering on every step is waste. Panels that read the Emulator must not do work while hidden.

## Left to implementation

- **Default sizes:**
    - panel widths: Explorer 16rem; Testcases, Documentation and AI 28rem; Settings 22rem; host panels 24rem;
    - bottom panel 12rem;
    - debug column: as wide as the registers column plus a 16-column memory grid.
- **Icons**, from fa-solid: folder, vial, book, the existing `SparklesIcon`, share-alt, heart, cog.
- **Whether the exam prompt panel is maximizable.** The design names only Documentation and Testcases; `WorkbenchHostPanel.maximizable` allows it.

## Status, 2026-09-30

All seven phases are implemented on `feat/workbench` in one session and are uncommitted. `npm run check` reports 0 errors, with 283 warnings against 285 before. `npm test` passes 2,240 tests in 85 files, 35 of them new. `npm run lint` reports no errors in the repository's code. The browser rows are W1 to W12 of [manual-verification.md](../manual-verification.md).

Where the implementation departed from the plan, or settled what it left open:

- **Constructor deriveds.** `WorkbenchSession` assigns its `$derived` values in the constructor (`this.x = $derived(…)`, with `declare` fields). TypeScript rejects class-field deriveds that read `project`, `emulator` or `host` before the constructor sets them, even though a derived is only read later.
- **Mount after load.** The projects page mounts the Workbench only once the Project has loaded. Mounting it for the placeholder Project and swapping it on load raced Monaco's teardown.
- **Swapping arrangements.** Crossing a breakpoint used to put two Monaco editors on one session, both claiming the same models. The Workbench now takes the old arrangement down a frame before mounting the new one, and `Editor.svelte` disposes only the editor it created, not the one its `editor` binding points to.
- **The Log and test runs.** The Log ignores program exits while a test run is in flight, since the Emulator runs every Testcase to its end.
- **Extractions the plan did not list.** `DisplayConfigurationForm` came out of the Screen's Display popover, for the Settings section. `AgentSidebarFrame` came out of `FloatingAgentSidebar`, so that the review agent has a frame of its own.
- **Deletions.** `Explorer` lets a host that follows deletions choose what to show next (the Workbench closes the File's tab). `FileSidebar`, `FloatingLanguageDocumentation`, `MemoryTab`, the floating `Settings` and `ShortcutEditor`, `Project.svelte` and `/themes` are gone, and so is `DraggableContainer`'s collapsed mode: both remaining windows close instead.
- **Retired Preferences.** `showMemory` and `showScreen` are gone. The tolerant reader drops the stored keys.
- **Shortcuts.** The Workbench's shortcut handler also ignores keys typed into a `textarea`.
- **Breakpoints and widths.** A Build closes the side panel only when the editor would fall under 360 px. At 1440 × 900 the Explorer stays open beside the debug column.
- **The exam prompt is not maximizable.** The design record names only Documentation and Testcases.
- **Unchanged.** The embed page and every other Interactive editor surface are unchanged apart from the shared pieces split out in phase 1, which render the same.

Still open:

- Review mode in the exam, where the teacher's agent is a Workbench panel opened from the header, is not yet run in a browser.
- `/chat`, and rows H13 and H14 on the Workbench, are not yet run in a browser.
- The visual pass over the design system's details, which the design record defers to after this implementation.
- The version and date of the changelog entry (11.0.0, 2026-09-30) are placeholders for the release.

### Revision, 2026-09-30

After the owner's review (see the design record's revision), the Debug tools' floating windows are the editor's own again. `DraggableContainer` keeps its collapsed mode, and `DebugToolsFloating` draws the three bars at their old places, 300, 500 and 700 pixels in and 13 down, with their open state and positions remembered. The top bar lost its pills and its background.

The spacing follows the mockup: `--wb-gap` 4px and the rail a card. Section headers use `--wb-section-header`, Lines rules use `--wb-section-rule`, and tab strips use `--wb-strip`. `CollapsibleSection` has an `outlined` variant for Settings.

The debug column's top is a grid whose row is as tall as a page of memory. The registers take `height: 0; min-height: 100%`, so they fill that height without raising it. `MemoryControls` takes a `buttonVar`, and the register rows take an `align` for the PC. `npm run check`, `npm run lint` and `npm test` (2,240 tests) are clean again.

### Second revision, 2026-09-30

After the owner's second review:

- **Editor:** `EditorArea` lost its padding and the animated border, and draws its error frame as an `::after` over the editor.
- **Top bar:** its right padding is computed from `--wb-top-height` and the new `--wb-control-height`, which the execution controls' height also reads.
- **Registers:** `RegistersArea` insets its content and not its rules, and the registers card has no padding of its own.
- **Debug column:** it wraps its content in `.debug-content`, 170vh tall in Sections. The lower part grows with its content instead of scrolling inside itself. The column keeps a stable scrollbar gutter.
- **Screen:** `ScreenRenderer` takes `headerless`, `onHeader` and `heightFromWidth`. A headerless Screen hands its size and controls to its section's header through `onHeader`, and takes them back when it goes to its window. `heightFromWidth` gives the stage the height a fitted Screen needs to fill its width.
- **Scrollbar room:** `CollapsibleSection` puts its `info` inside the toggle, beside the title. The side panels, the Terminal, the Log and the Problems keep `scrollbar-gutter: stable`.

### Third revision, 2026-09-30

After the owner's third review:

- **Registers:** the layout store lost `registersWidth` and its setter; a value stored before is ignored. `RegistersArea` binds the grouping picked in its header, and `DebugColumn` pins a tabbed file's column with `registerColumnWidth` at that grouping. A single file's card has `min-width: max-content`. The grid's two columns are separated by `column-gap: var(--wb-gap)`, and in Lines by memory's left rule.
- **Column width:** `.debug-lower` has `contain: inline-size`, so the Screen and the Debug tools never widen the column.
- **Tool sections:** `toolSectionStyle` in `debugTools.ts` gives every section `flex: 1 1 0`. The Stack pointer gets `min-width: min-content`, and History and Call stack `min-width: 10rem`.
- **History and Call stack:** `CallStack` and `MutationsRenderer` take `docked`, which drops their 12rem width and max-height and rounds every corner 0.2rem. `DebugToolContent` passes it, and the floating windows keep their old look.
- **Lines corners:** `MemoryRenderer`, `RegisterFilesPanel` and `ScreenRenderer` read `--panel-radius` with their old 0.5rem as the fallback, and Lines sets it to 0.

The work is committed on `feat/workbench` as one commit. The brief and mockup the design record was made from are not kept in the repository.

### Fourth revision, 2026-09-30

- **Registers:** `RegistersArea` no longer insets the Register files and has no bottom padding. It sets `--panel-radius: 0px` for what it holds. The PC is its direct child with no wrapper, its rows' grid padded `0 0.2rem` like the register rows, and the rule under it is gone.
- **Sections:** `CollapsibleSection`'s `outlined` variant has `var(--background)` for its body. Its header lost `padding-right`, which `.actions` now carries.
- **Testcases:** `SidePanel` marks the Testcases panel and sizes its `h1`, `h2` and `h3` at 1.15rem, 1.05rem and 0.95rem.
- **Rail width:** `--wb-rail-width` is 3rem and `IconRail` is padded `0.3rem 0`. Its buttons are rounded 0.2rem. Lines' divider is an inset shadow, so it no longer takes a pixel off the rail's width. `WorkbenchDesktop` measures the rail when a Build decides whether to close the side panel, instead of assuming its width.

### Fifth revision, 2026-09-30

- **Card edges:** `--wb-card-edge` is the cards' edge, drawn as `outline` with `outline-offset: -1px`, so it takes no room and paints over edge-to-edge headers; Lines sets it to `none`.
- **Bottom panel:** `DEFAULT_BOTTOM_HEIGHT` is 96.
- **Nothing hidden is rebuilt:**
    - `CollapsibleSection`, `DraggableContainer`, `WorkbenchDesktop`'s debug column and `WorkbenchCompact`'s debug sections latch a `$derived.by` the first time they are shown and hide rather than unmount afterwards.
    - `BottomPanel` keeps all three tab bodies. `TerminalView` and `LogView` take `visible`, so they scroll to the end when shown again.
- **No top bar on a desktop:**
    - `WorkbenchDesktop` drops `TopBar`, which serves the compact layouts alone now.
    - `EditorArea` takes `controls` and floats `ExecutionControls` (`variant="floating"`) over the code. `ExecutionControls` has the `floating` and `touch` variants in the new order, and a container query hides its labels under 32rem.
    - `IconRail` takes `withBack` and `withSave` on a desktop.

### Later revisions, 2026-09-30

- **Controls:** `ExecutionControls` mutes a disabled button with `color-mix` of its `--btn-color` and `--secondary`, at full opacity.
- **Editor:**
    - `EditorArea`'s `.floating-controls` spans the frame's bottom edge over `linear-gradient(to top, var(--secondary), transparent)`, padded 0.35rem and clear of Monaco's 14px scrollbar.
    - It hides `.monaco-editor .scroll-decoration` and squares `.monaco-editor` and its `.overflow-guard`.
- **Card edges:**
    - `--wb-card-edge` is a `border` on every card. `--wb-section-rule` is that edge in Cards, so sections and memory border themselves the same way.
    - `--wb-card-inset` is the edge's width, for the maximized panel's offset.
- **Rail card:** `WorkbenchDesktop` wraps the rail and the side panel in `.rail-card`. `IconRail` and `SidePanel` take `framed`, false there, and the side slot's `border-left` is the card edge.
- **Floating Debug tools:**
    - `DebugToolsFloating`'s default `top` is 9 in Cards and 5 in Lines, and a window stored at the old 13 follows it.
    - `WorkbenchDesktop` builds the tools at the first Build and hides them while there is no Debug session.
- **Tabs and rail:** `FileTabs` rules the strip with each part's own bottom border, with a `.tabs-rest` filler after the tabs. `BottomPanel` does the same for every child of its strip, instead of laying the tabs over the strip's border. `IconRail` sizes every `svg` to its box.
