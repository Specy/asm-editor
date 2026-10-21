# Reverse-engineering UX: plan

Plan for [the design](./reverse-engineering-ux.md), written 2026-10-21. `E/` means `packages/asm-editor/src/` and `X/` means `packages/x86/blink-js/src/`. Line numbers are from `feat/pseudocode` at `4b40f6e2` and will drift.

Status on 2026-10-22: W1 to W6 are done, each one commit on `feat/pseudocode`: W1 `b9f55b97`, W2 `b9af4ea8`, W3 `e3e09398` (with the x86 Core's `4631b16`, unreleased), W4 `f83962ed`, W5 `d5f7e0ea`, W6 `da8d6091`. W7 is in progress. W8's documentation for W1 to W6 is done; W7's documentation, the code review and the browser check remain. What each group did differently from this plan is in [the design's Implementation section](./reverse-engineering-ux.md#implementation).

## Order

Seven work groups and a closing pass. Each lands as one commit on `feat/pseudocode`, with no Co-Authored-By trailer and nothing pushed. Groups that share files run one after another. At most two run at once, and only when their files don't overlap:

| Step | Groups running |
|---|---|
| 1 | W1, W2 |
| 2 | W3, W4 |
| 3 | W5 |
| 4 | W6, W7 |
| 5 | W8 |

Rules for every group:
- Commit by path (`git add <your files>`), never `git add -A`: another group may be working in the same tree.
- Run the tests you touched, plus any near them, with `cd packages/asm-editor && node_modules/.bin/vp test run <paths>`. Run `vp check` and `vp lint` before committing. A failure in a file another group is editing is theirs; report it rather than fixing it.
- Leave the in-app Documentation, `CONTEXT.md` and the design records to W8. List what they should say in your hand-back.

## W1: when a run goes wrong (decisions 1, 3, 4)

**AVX.**
- `E/lib/languages/X86/X86Emulator.svelte.ts` `_terminationNotes()` (around :350) already decodes the instruction at a SIGILL address with Zydis and writes a Log note.
- Recognise VEX/EVEX from the instruction's bytes (`core.getInstructionAt`):
  - skip the segment prefixes (`26 2E 36 3E 64 65`) and `67`;
  - then `C4`/`C5` is VEX and `62` is EVEX (64-bit mode).
- Make the status say "AVX instructions are not currently supported". The status is built in `E/lib/languages/termination.ts` (`describeTermination`, `terminationSummary`) from `X86Emulator._getTermination` (around :1170); the same text reaches the Log (`E/lib/workbench/workbenchLog.ts:143`).
- Tests that pin today's text: `termination.test.ts`, `X86Notes.test.ts:123,135`, `logNotes.dom.test.ts:120-136`.

**Keep the place after exit.**
- On termination, `GenericEmulator.selectLastExecuted` (around :872) uses `X86Emulator._libraryCallSite` (around :891), which is `_start` once `main` has returned.
- `run()`'s `finally` then calls `WorkbenchSession.revealCurrentInstruction` (around :1951) → `revealSourceLocation` (around :1826). That moves the Listing and calls `followFunction` on Pseudocode panes. The Pseudocode's PC line is `EditorGroup.pseudocodeProgramLine` (around :659).
- For an Executable that exits normally (no signal): reveal nothing, and clear the program-counter highlight. Keep the signal case and every other language as they are.
- Tests: `pseudocode.dom.test.ts`, `currentLineReveal.test.ts`, the x86 Executable tests.

**Memory address box.**
- `resolveMemoryAddress` (`E/lib/languages/memoryRegions.ts:258-274`) gives "Unknown label". Labels resolve through `GenericEmulator.resolveMemoryLabel` (around :229): the Core's ELF symbols, then `core.resolveMemoryLabel`.
- Add the Listing's labels: `Listing.labels` in `E/lib/listing/listing.ts:74-117`, with `kind` `'function'|'data'|'string'` and origin `'invented'`/`'string'`, at file addresses. Convert them to run-time addresses as the rest of the Executable code does (PIE base). Leave out per-function `.LAB_n` blocks.
- `MemoryControls.svelte:264-266` draws a static `0x` before the input: show it only while the text is numeric.
- Tests: `memoryRegions.test.ts:72`, `MemoryControls.dom.test.ts:100`.

## W2: small fixes (decisions 14–17)

- **Hex Find:**
  - `E/components/specific/workbench/hex/HexFindBar.svelte` (kind `'hex'|'text'`);
  - `HexEditor.svelte` (`findKind` around :663, `openBar` around :707);
  - `hex/hexSearch.ts` `parseHexPattern` (around :35).

  Auto-switch to Text on non-hex input; the `SegmentedControl` shows the switch.
- **Hover card:** `HexEditor.svelte` `hovered` (around :572-594, drawn at :1052) is cleared only on `pointerleave` and scroll. Also clear it on drag (`onPointerMove` around :549), on the context menu (`onContextMenu` around :623), when Find opens, and on keydown.
- **Read-only notice:**
  - `E/components/specific/workbench/ReadOnlyNotice.svelte` (absolute, top right, z-index 4) is shared by `ListingNotice`, `PseudocodeNotice` and `LibraryMemberNotice`.
  - Move or hide it while the pane's Monaco find widget is revealed. Use the find controller's state, or a class on the editor DOM.
  - Tests: `listingDocuments.dom.test.ts:383-407`, `patchPrompt.dom.test.ts:456`.
- **Leave-site prompt:**
  - `E/routes/projects/[project]/+page.svelte:258-265` fires on every non-localhost unload.
  - Check `unsaved` (around :43-46: a share Project, or `dirty && (!autoSave || lastSaveFailed)`).
  - Read the Save design in `docs/design/workbench.md` first.
- **Tests:** `HexEditor.svelte.dom.test.ts`, `hexSearch.test.ts`, plus new tests for each fix.

## W3: a Build never waits silently (decision 2)

**Path today.**
1. `ExecutionControls.svelte:186` calls `session.build` (`WorkbenchSession` around :2680), which sets `building`.
2. `building` drives `ExecutionDock.svelte:171-187` (clock icon, disabled).
3. `emulator.compile` → `GenericEmulator.compileInternal` (around :1346) → `X86Emulator._compile`/`compileSources` (around :531-575) → `core.loadExecutable`.
4. That calls `resolveLinuxLibraries` (`X/linux-runtime.ts:34-66`) → `readResourceBytes` → the Core's only `fetch()` (`X/resources.ts:51`).
5. NASM loads for assembled programs (`X/wasm-assembler.ts:58-68`).
6. On a rejection, `compileInternal` adds the error and rethrows; `build()` shows a toast "Error compiling code. …". There is no timeout.

**To do.**
- **Stall timeout in the Core:** read the body as a stream and abort after 20 s with no bytes. Name the resource in the error ("Could not download libstdc++.so.6"). This is a Core change in the `packages/x86` submodule (on its `main`): commit there first, then commit the pointer with the editor change. Add a Core test.
- **Phases:** a way for the emulator to report what a Build is doing, surfaced in the dock while `building`. x86 reports its downloads, loading and starting; other languages say "Building…".
- **Cancel** while building: the result of a cancelled Build is discarded and the Workbench returns to editing. Look at "This load was superseded" (`X/blink-runtime.ts:762`) for how a newer load already wins.
- **Error:** a clear message in the Terminal, the Log and a toast, and Build pressable again.
- **Tests:** dom tests with a stalled or failing fetch, a Core test for the stall timeout.

## W4: the debug column and pointer menus (decisions 19, 20)

- **Column:**
  - `E/components/specific/workbench/WorkbenchDesktop.svelte:135-148` (`Splitter` + `DebugColumn.svelte`).
  - Width is `layout.debugWidth` (null means automatic per language). The `registerColumnWidth` lock is in `DebugColumn`.
  - Store: `E/stores/workbenchLayoutStore.svelte.ts` (`LAYOUT_LIMITS`, persisted).
  - Add a collapsed strip state with an expand control, reachable by dragging below a threshold and by a collapse button. Keep it in the layout store.
  - Tests: `workbenchLayoutStore.test.ts`, `Splitter.dom.test.ts`.
- **Registers:**
  - `RegistersArea.svelte:59-63`: clicking a name moves the memory view.
  - `RegisterFileRows.svelte:354-398`: clicking a value pokes.
  - Add a context menu on values. Keep one click to edit.
- **Memory cells:** `MemoryRenderer.svelte` (hover around :581-600, inline poke). Add a context menu.
- **Navigation:**
  - memory view: `emulator.setGlobalMemoryAddress` (`GenericEmulator` around :1883; callers page-align);
  - Listing: `session.revealAddress(runtimeAddress)` (`WorkbenchSession` around :1898, Debug session only).
  - "Show in Listing" only when the address is in an Executable's code.
- **Context menus:** reuse whatever menu component the Workbench already uses (Explorer, Hex editor).

## W5: reading and moving around (decisions 5–9)

- **Number hover:**
  - Pseudocode hover is `E/lib/monaco/pseudocodeProviders.ts:56-73` (tokens with a `target` only).
  - Tokens come from `modelPseudocode(uri).lines`, `DecompiledToken {start,end,kind,address?,target?}` (`packages/decompiler/js/src/index.ts:91-115`).
  - Reuse `numericLiteralMarkdown` (`E/lib/monaco/assemblyInsights.ts:196-219`) for `kind: 'constant'`.
  - The Text line goes in both. The Listing card is shared by every assembly language, so keep the line inert where it can't apply.
- **Ghidra words:** the same hover, by token kind and name pattern.
- **Double-click:**
  - Pseudocode definitions: `pseudocodeProviders.ts:39-54`. Listing definitions: `E/lib/monaco/listingProviders.ts`.
  - Opening goes through `WorkbenchSession.mount`'s editor opener (around :1088-1103) → `followPseudocodeTarget` (around :2427).
  - Add a double-click handler in `Editor.svelte` for the Listing and Pseudocode models that runs the same navigation, and decorate linkable tokens on hover.
- **History:**
  - New, per editor pane (`EditorGroup.svelte.ts`).
  - A position is (File, view, function or Listing line).
  - Push from every jump: `followPseudocodeTarget`, the opener, Show in Listing (`WorkbenchSession` around :2191), Go to Symbol, and the Symbols panel (W6 calls into this).
  - Alt+←/→, mouse buttons 3/4, and context-menu Go Back / Go Forward.
- **"?":**
  - `ReadOnlyNotice`'s `action` snippet in `PseudocodeNotice.svelte` and `ListingNotice.svelte`.
  - Opening a section needs `ui.searchDocumentation` (`WorkbenchUi.svelte.ts:89-96`) extended with an href. `DocumentationBrowser.svelte` consumes `documentationRequest` (around :188-199) and can `follow(target)` (around :298) via `resolveDocumentationLink` (`E/lib/documentation/links.ts`).
  - Hrefs: `/documentation/x86/executables#listing` and `#pseudocode`.
- **Tests:** `pseudocode.dom.test.ts:367-376,415-439`, `listingProviders.test.ts`, `pseudocodeMap.test.ts`, `DocumentationBrowser` tests.

## W6: the Symbols panel (decision 18)

- **Rail entries:** `E/components/specific/workbench/WorkbenchShell.svelte:181-213`. Panel bodies and minimum widths: `SidePanel.svelte:152-230`, :68.
- **Data:**
  - `Listing.functions {name, address, end, line, endLine}`;
  - `labels` with `kind 'string'`;
  - `holders.strings`, `entry`, `main` (`E/lib/listing/listing.ts:57-117`).
  - The Listing is generated in a worker; get it the way the Listing pane does (`_listings.openExecutable`).
- **Behaviour:** reveal through W5's navigation, so a click adds to the history. Filter box and `SegmentedControl`, as the Explorer and Hex editor already look.
- **Tests:** a dom test for the panel, plus `SidePanel` tests.

## W7: the dock and debugging (decisions 10–13)

- **Debug label:**
  - `ExecutionDock.svelte:171-187` is hard-coded and shared with `components/shared/InteractiveInstructionEditor.svelte`. Add a prop.
  - `ExecutionControls.svelte` knows the Selected program's Entry (see `pane.displayedKind === 'executable'` at :142 for the existing per-kind tooltip, and `executableKind` in `E/lib/executables.ts:46`).
  - Tests: `viewSwitch.dom.test.ts`, `programs.dom.test.ts`.
- **Context menu:**
  - Listing actions: `listingActions` in `EditorPane.svelte:94-111` (Patch instruction…, Show in Hex), through `lineActionDescriptor` (`E/lib/monaco/editorLineActions.ts`) in `Editor.svelte:478-497`. The Pseudocode has none yet.
  - Toggle Breakpoint goes through `session.toggleBreakpoint` (`WorkbenchSession` around :2497; Pseudocode at :2523).
  - Run to Cursor needs a public `runTo` on the emulator, mirroring `runInternal` (`GenericEmulator` around :1544, :1834) with `breakpoints: [...resolved, target]`, as `runToProgramStart` (around :1205) does. Respect ADRs 0007 and 0023.
- **Program input:**
  - `E/components/shared/terminal/TerminalConsole.svelte` (hint row around :343; focus around :101-134 skips when another text field has focus).
  - Pending read: `terminal.pendingRead` / `emulator.interrupt`.
  - Panel height: `WorkbenchDesktop.svelte:124-133`, `layout.bottomHeight` (72–1600, default 96).
  - Tests: `TerminalConsole.svelte.dom.test.ts`, `commandLine.dom.test.ts`.
- **Default view:**
  - `E/lib/fileViews.ts:23-33` (Executable `['hex','listing','pseudocode']`). Keep the button order and change the default.
  - On first open, scroll the Listing to `main`, else `entry` (`Listing.main`/`entry`). See `revealPseudocodeFunction` (`WorkbenchSession` around :2377) and `pseudocodeMap.ts:222` for the existing main → entry → first rule.
  - Tests: `fileViews` and `viewSwitch` dom tests.

## W8: closing pass

**Documentation:**
- the in-app Executables chapter `E/lib/documentation/x86/executables.md` (sections `#listing`, `#names`, `#decompile`, `#pseudocode`, `#stepping`, `#breakpoints`, `#log-notes`, `#finding`), keeping `E/lib/search/golden/x86.json` anchors valid;
- `CONTEXT.md` (Symbols panel, Run to Cursor, navigation history);
- the revision note on [file views](./file-views.md) decision 1;
- an implementation report here.

**Then:**
1. A code review of the whole change set, with its findings fixed.
2. A browser check on the dev server with the study's harness (`.cache/ghidra-usability-study/harness/`) on the study's binaries.
