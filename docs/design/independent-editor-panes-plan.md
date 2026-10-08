# Independent editor panes implementation plan

Plan requested and implementation authorized on 2026-10-03. This replaces the mapping-dependent layout described in [the source compilation plan](./source-compilation-plan.md).

## Intended behavior

Use two ordinary Project file editors, each with its own tabs. Compilation normally leaves the original C/C++ file on the left and opens its generated assembly on the right. Both files use the same editing, diagnostics, navigation, and tab interactions as other Project files. Source maps supply decorations and connectors independently of whether the second pane exists.

The owner confirmed: start with one editor, open the second on successful compilation, and keep both until the user closes one. The remaining interaction details below were accepted with the implementation plan.

- Each pane can open any Project file. Source and assembly roles belong to the currently displayed files, not permanently to the left and right panes.
- Clicking inside an editor or selecting one of its tabs makes that pane the target for Explorer opens and editor commands. Tab rows indicate the focused pane without taking focus away while typing.
- Offer an “Open in other editor” action on files/tabs. It creates the second pane if necessary and can open a file that is already displayed in the first. Limit this iteration to two panes; tab dragging and additional splits can follow later.
- Closing a tab affects only its pane. Allow closing the last tab: an empty pane collapses when another exists; the final editor remains with an empty-state prompt. A pane-level close action closes that group's tabs without deleting Project files. Closing files never invalidates a map.
- Keep the draggable divider and width ratio independently of mapping. Use a narrow separator for unrelated files and the existing wider ribbon gutter for a mapped pair. Preserve the ratio when the gutter changes size. Each pane's tabs and notices sit above its own code viewport; connectors start below those headers.
- On narrow screens, stack the panes with separate visible tab rows and independent scrolling. Hide connectors, retaining mapped line colors and selection/execution highlights. Compact layouts currently suppress tabs and must be updated.

## Compilation and mapping

On successful Compile, retain all tabs, show the requested original source in its pane and the output in the other pane, and focus the assembly. Recompiling a displayed output reuses that output's pane and opens/focuses its original source opposite it. A failed or cancelled compilation leaves the layout and previous output intact.

Capture the originating pane, source path, optimization, and destination before awaiting compilation. Changing focus during a request must not change what gets compiled. If the user closes an existing destination pane during the request, do not reopen it automatically on completion; open the result as a tab in the surviving pane. File publication continues to use the existing transactional compiler path and overwrite confirmation.

Derive the active mapping pair from the two displayed files. Find the map belonging to the displayed generated output, then verify that the opposite file is an original input represented by its mapped locations. Validate the displayed output and input bytes against the compilation fingerprints, including when either editor is displaying a Build snapshot. Support reversed pane order and local headers. A source file can belong to several compilations; the assembly currently displayed selects the map unambiguously.

| Displayed files                                          | Mapping behavior                                          |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `main.c` and `main.c.s`, valid map                       | Matching section colors, connectors, and linked selection |
| `helper.h` and assembly with mapped header lines         | Show only mappings for that header                        |
| Assembly on the left, its source on the right            | Same behavior with connector endpoints reversed           |
| Source and unrelated assembly, or two sources/assemblies | Ordinary editors; no pair decorations or connectors       |
| Matching files with a removed or unavailable map         | Keep both panes; show the relevant assembly notice        |
| Switch tabs to another valid source/output pair          | Replace pair decorations and connectors immediately       |

Line colors and linked selection come from the active pair. Keep unmapped lines undecorated and preserve one-to-many mappings. Selecting a mapped line highlights its counterpart and may reveal it within the already displayed opposite file; selection does not replace that pane's active tab. Clear selection when the pair changes or becomes invalid.

Editing either mapped file removes the affected map immediately. Editing an included header invalidates every dependent compilation, even when that header is not displayed. Remove mapping colors, connectors, and linked highlights while retaining both panes, tabs, scroll positions, and cursors. Preserve stale-source and manually-edited-output notices, and change “restore the split view” to “restore source mapping.” Undo does not restore a discarded map; recompilation does.

Reuse Project-owned transient maps and saved compilation records. Renames, deletion, guest writes, and external edits continue through FileSystem invalidation. Update renamed/deleted tabs in both panes; unrelated file edits retain unaffected maps. The current rename behavior clears all maps; selective rename invalidation can remain a later refinement. Save/reload retains provenance but requires recompilation to recreate maps.

## State and model ownership

`WorkbenchSession` currently has one `tabs`, `sourceSelection`, and `editor` handle. Introduce session-owned editor groups with stable IDs, per-group tabs/source selection/editor handles, and a focused-group ID. Move displayed file, language, diagnostics, breakpoints, build artifacts, read-only state, and compilation actions into per-group derived state. Keep the Emulator, language session, FileSystem, compilation requests, and Project ownership shared.

Add a session-owned Monaco model registry. Each canonical Project source identity has one model: `(languageSessionId, live/build, buildGeneration, path)`. Two editor widgets can attach to that model, retaining independent view states and selections. This avoids duplicate model URI creation and preserves synchronized text and undo history when the same file is open twice.

The registry owns model creation, one change listener per model, Project synchronization, and disposal. A pane disposes only its widget and pane-specific listeners/decorations. Retain live models for existing Project files through tab closures to preserve undo; remove deleted files, obsolete build generations, and all models on session disposal. Preserve the generic Editor's standalone ownership mode for hosts outside the Workbench.

Write live model changes to the Project once, regardless of which pane is focused. External Project updates must not produce duplicate writes or reset undo on an unchanged model. Model-wide diagnostics and build artifacts have one owner; selection, mapping, and execution decorations remain local to each editor widget. Closing one pane must leave the other pane's model and language features operational.

Represent the active pair separately: output path/map, source path, source and assembly group IDs, coloring, and selection. Map selection is scoped to this pair. The connector component receives the actual pane editors and their physical orientation; it no longer owns or chooses the source file. Retain the existing curve/straight and offscreen-retention constants, folding handling, and pseudo-instruction view-zone geometry.

## Navigation, controls, and execution

Make ordinary file opens and editor commands target the focused pane. Definition/reference navigation stays in the initiating pane; Problems navigation prefers an existing pane displaying the diagnostic file, otherwise the focused pane. Pass the initiating group explicitly through asynchronous navigation so a focus change does not redirect the result. Apply rename/code-action edits through shared models, including files not currently displayed.

Provide Compile/Recompile and optimization in the relevant pane's bottom controls. Keep one set of project execution controls, anchored in the assembly pane when one is displayed, or the surviving pane in a single-editor layout. Use the right pane when both display source files; when both display assembly, prefer the execution-follow pane. Build, Run, Step, Undo, Stop, and Test still act on the shared Emulator and configured Entry.

Build snapshots remain part of debugging correctness. Both panes are normal live Project editors before Build; existing debug/read-only and FileSystem lock rules apply during execution. Stopping restores live versions in both groups. Removing the special mapped-source pane does not remove snapshot identities or permit editing code underneath the running program.

Execution navigation first uses a pane already showing the executing assembly; otherwise it opens that assembly in the designated execution pane. The existing execution-follow behavior may activate an assembly tab, but should not replace the opposite pane's chosen source/header tab. Highlight the corresponding source line only when that displayed file matches the instruction's map location. Unmapped instructions clear the source execution highlight. Build, Step, and Undo must preserve the valid pair and its section colors.

Keep editor groups, focus, and width ratio in session UI state for this iteration. Do not add them to Project data or archives. Entry selection and multiple-entry design remain deferred; preserve current compilation and Build behavior.

## Implementation sequence

1. **Shared models.** Extract Workbench model ownership from `Editor.svelte` into a session registry, preserving standalone Editor behavior and existing cross-file edit handling.
2. **Editor groups.** Add group state/actions, empty-tab support, explicit navigation targets, and reconciliation for rename, delete, Build, and Stop. Keep single-editor behavior working throughout the migration.
3. **Reusable panes.** Extract an ordinary editor-pane component from `EditorArea.svelte`; give each pane its own `FileTabs`, notices, and contextual compilation controls. Add the second-pane lifecycle, divider, focus indication, and compact tab rows.
4. **Derived mapping pair.** Replace `MappedSourcePane.svelte` with the ordinary source editor. Resolve the active pair, apply per-widget colors/highlights, and adapt connector geometry for both orientations and differing header heights.
5. **Compilation/execution routing.** Open successful compilation results in the opposite group, preserve async request targets, route diagnostics and runtime locations, and retain invalidation/overwrite behavior.
6. **Verify and document.** Update affected design descriptions once implemented. No new Compiler Explorer integration, source languages, map persistence, or Entry behavior is required.

## Acceptance checks for implementation

- Compile opens the two actual files with independent tabs; compilation failure leaves the prior layout intact. Recompile from either pane routes to the same source/output pair.
- Close individual and last tabs, close/reopen a pane, and open unrelated or matching files in either order. Mapping invalidation never collapses panes.
- Display the same file twice: edits synchronize, undo/redo works, diagnostics agree, independent scrolling survives, and closing either widget leaves the other operational. Cross-file code actions still persist changes.
- Switch among two compiled programs and mapped headers; only the active valid pair draws connectors. Test reversed panes, one-to-many ranges, folding, view zones, resize, and partial/offscreen sections.
- Edit source, output, included headers, and unrelated files; verify dependent invalidation, notices, overwrite confirmation, and map restoration only after recompilation. Include FileSystem/guest edits and rename/delete in either pane.
- Build, execute, Step, Undo, navigate to another assembly file, and Stop with either pane focused. Preserve execution/source colors and snapshot identity while enforcing existing edit locks.
- Verify keyboard navigation, Explorer/Problems/definition routing, compact tabs, read-only hosts, reload without maps, cancellation, and pane closure during a compilation request.
- Add targeted model/group/pair tests and run the affected existing regression checks during implementation.

## Implementation evidence

Implemented editor groups in `WorkbenchSession` and `EditorGroup`, session-owned models in `EditorModels`, and visible-file pairing in `resolveMappingPair`. `EditorArea` now renders ordinary `EditorPane` components with separate tab rows. Removed the special mapped-source pane. Pane controls share one Emulator, and compact layouts retain tabs and enough height for two stacked editors.

Targeted checks cover shared models and external synchronization, matching headers and reversed pairs, snapshot fingerprint mismatches, independent tab closure, invalidation without pane collapse, and compilation targets/pane closure during asynchronous requests. Isolated Chromium checks also cover real Monaco editing and undo across shared views; compilation and multi-file tab switching; Build, Step, Undo, and Stop highlighting; header/reversed connectors; resizing; and stacked compact editors. Compiler responses are captured fixtures; the compiler transport was not changed.

Validation: affected regression suite passed 118 tests in 15 files; an additional group regression checks opening a pane during debugging. Svelte checking reports zero errors and 32 existing warnings, and targeted ESLint passes. Desktop, tablet, and phone browser checks passed without uncaught page errors.
