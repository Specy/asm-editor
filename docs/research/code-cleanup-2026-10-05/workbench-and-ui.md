# Workbench and UI cleanup audit

Research only. No implementation, tests, configuration, dependencies, submodules, or existing documentation files were changed. The worktree already contains user edits, including `EditorGroup.svelte.ts` and `WorkbenchSession.svelte.ts`; findings use the current checkout and do not attribute those edits to this audit.

## Coverage

Reviewed all files in `src/lib/workbench`, `src/lib/monaco`, `src/components`, and `src/global.css`; ran exact-name/reference scans across repository source, routes, content, tests, and configuration (excluding vendored dependency trees). Manually read the selected declarations, their direct call sites, and the relevant Vite/Svelte configuration; this was not a manual line-by-line review of every component. Read `CONTEXT.md`, ADR 0024, ADR 0027, ADR 0028, `docs/design/workbench.md`, `docs/design/source-compilation.md`, and `docs/design/independent-editor-panes-plan.md`. Used focused Git history for the old signed-memory helper and Monaco theme API. No repository tests or builds were run. Read-only probes compiled Svelte snippets with installed Svelte 5.57.1 and type-checked a virtual TypeScript snippet against installed Vite/Monaco declarations. Inspected only the installed Svelte legacy helper implementation and relevant Monaco/Vite declarations; no general vendor internals were audited. No browser behavior was tested.

## Confirmed candidates

### U01 — Unused generic UI components

**Confidence: high.** The following components have no caller in application source, tests, content, or route markup:

- [`HeadMeta.svelte:1`](/home/dev/code/asm-editor/src/components/shared/HeadMeta.svelte:1): repository pages write their `<title>` and meta tags inline; there are no `HeadMeta` references.
- [`Layout.svelte:1`](/home/dev/code/asm-editor/src/components/content/Layout.svelte:1): the only mentions are two commented-out layout entries in `svelte.config.js`; the active mdsvex layout map is empty.
- [`NumberInput.svelte:1`](/home/dev/code/asm-editor/src/components/shared/input/NumberInput.svelte:1) and [`RawInput.svelte:1`](/home/dev/code/asm-editor/src/components/shared/input/RawInput.svelte:1): no imports or Svelte tags reference either module.
- [`ExpandableContainer.svelte:1`](/home/dev/code/asm-editor/src/components/shared/layout/ExpandableContainer.svelte:1): no caller. Current Workbench collapsible sections use `CollapsibleSection.svelte`.

Exact-name searches across the repository find only these declarations, except `Layout`, whose only external matches are the commented mdsvex settings. No Svelte component auto-registry or dynamic component map references them. These are app-internal files rather than a published component package.

**Suggested cleanup:** remove the unreferenced components and the commented mdsvex layout entries. If `HeadMeta` or the empty `Layout` is intended as a future extension point, retain it only with an active consumer or a concrete near-term use.

**Risk/validation:** an out-of-repository consumer could import a source path directly, but there is no package export contract here. A later deletion should include a final repository-wide reference scan and normal Svelte check/build.

### U02 — Orphaned runtime error carousel

**Confidence: high.** [`ErrorRenderer.svelte:1`](/home/dev/code/asm-editor/src/components/specific/project/user-tools/ErrorRenderer.svelte:1) has no import, dynamic component reference, or Svelte tag anywhere in the repository. Runtime errors in the current inline editor are rendered through [`StdOutRenderer.svelte:1`](/home/dev/code/asm-editor/src/components/specific/project/user-tools/StdOutRenderer.svelte:1), which is mounted by `InteractiveInstructionEditor.svelte`; the Workbench has its own active Terminal view. The carousel's exact retirement point was not isolated in history, so its original removal rationale remains unknown.

**Suggested cleanup:** remove `ErrorRenderer.svelte` after one final exact-name search. Keep `StdOutRenderer` and the Workbench terminal/problem views; they are active and serve distinct host layouts.

**Risk/validation:** confirm no external source-path import is supported, then use the Svelte check/build to catch any overlooked internal reference.

### U03 — Retired model-key helper in Monaco selection utilities

**Confidence: high.** [`sourceModelKey` in `projectSourceSelection.ts:44`](/home/dev/code/asm-editor/src/lib/monaco/projectSourceSelection.ts:44) has no production caller. Its only references are its own two unit assertions. Workbench models now use the canonical `projectSourceModelKey(identity)` in [`uri.ts:49`](/home/dev/code/asm-editor/src/lib/languages/service/uri.ts:49), which encodes session, live/build generation, and path together. That canonical identity is used by `EditorGroup.modelKey` and the session-owned model registry. The old helper accepts a separately computed `liveIdentity` and only has semantics for the earlier model-key scheme.

**Suggested cleanup:** remove `sourceModelKey` and its tests, or replace the tests with coverage of `projectSourceModelKey` if that identity rule needs explicit regression coverage.

**Risk/validation:** preserve the distinction between live and build-generation model identities and verify opening one source in both panes still shares the same model. Do not replace the canonical URI-key helper.

### U04 — Unused Monaco theme setter

**Confidence: high.** [`MonacoLoader.setTheme` at `Monaco.ts:93`](/home/dev/code/asm-editor/src/lib/monaco/Monaco.ts:93) has no call sites in the repository. Current editor creation applies `custom-theme`, and `Editor.svelte` refreshes it with `Monaco.setCustomTheme(generateTheme())` when the containing theme scope changes. The `MonacoLoader` class itself is private to this module; only its singleton is consumed inside the app. Git history shows `setTheme` was part of the early singleton API, but no current caller uses it.

**Suggested cleanup:** remove `setTheme`; retain `setCustomTheme`, which is the current theme path.

**Risk/validation:** check the theme switch in an embedded editor and in a Workbench after removal; the unused setter should not be confused with Monaco's active custom-theme update.

### U05 — Unused memory signed-group helper

**Confidence: high.** [`getGroupSignedValue` at `memoryTabUtils.ts:20`](/home/dev/code/asm-editor/src/components/specific/project/memory/memoryTabUtils.ts:20) has no production or test caller. It was added by `cd2d7a9` for the signed memory-selection hover. The current [`MemoryRenderer.svelte:24`](/home/dev/code/asm-editor/src/components/specific/project/memory/MemoryRenderer.svelte:24) imports `unsignedBigIntToSigned` from `src/lib/utils` instead and calls it for the active byte and selection. `RegisterSize` is only imported by the dead helper.

**Suggested cleanup:** remove the helper and its `RegisterSize` import; retain the active `unsignedBigIntToSigned` conversions.

**Risk/validation:** no current behavior should change. If the helper is removed, inspect signed display for a high-bit byte and a multi-byte selection in the memory popup during the next UI verification.

### U06 — Remove the test-only device-class helper

**Confidence: high.** [`deviceClassFor` in `deviceClass.ts:16`](/home/dev/code/asm-editor/src/lib/workbench/deviceClass.ts:16) has no production caller; its references are only its unit tests. `watchViewport()` in [`viewport.svelte.ts:9`](/home/dev/code/asm-editor/src/lib/workbench/viewport.svelte.ts:9) performs the live phone/tablet/desktop classification from `matchMedia` queries. The constants, `DeviceClass` type, `canFloat`, and `watchViewport` all have live Workbench consumers, so the whole module is not dead.

**Suggested cleanup:** remove only `deviceClassFor` and its tests. Do not replace the live media-query reads with `window.innerWidth` without establishing that both report equivalent CSS-pixel boundaries, and do not remove the query constants or `canFloat`.

**Risk/validation:** deleting the unused helper does not change runtime behavior. Keep testing the live phone/tablet/desktop boundary and first-frame behavior if `watchViewport` changes; it reads `matchMedia` synchronously so it does not mount the wrong layout for a frame.

## Retain

- [`hoverReachability.ts:21`](/home/dev/code/asm-editor/src/lib/monaco/hoverReachability.ts:21) is called when each `Editor` mounts. Its private Monaco contribution access is guarded and its document listeners are disposed. The comments record a concrete failure caused by routing overflow widgets outside the editor node: Monaco hides the hover as the pointer enters it. Treat this as an issue-specific compatibility workaround that remains necessary unless Monaco's current behavior/API or the widget placement changes; do not remove it based only on the internal API access.
- [`global.css:22`](/home/dev/code/asm-editor/src/global.css:22) says the `.unplugin-icon` rule is temporary, but [`vite.config.ts:36`](/home/dev/code/asm-editor/vite.config.ts:36) still assigns that class as the icon transform's `defaultClass`, explicitly to match the prior `svelte-icons` sizing contract. Icon components throughout routes and UI rely on the full-width box this rule supplies. The TODO is stale as a proposed future cleanup; the CSS itself is active. Change/remove it only alongside an intentional icon-sizing migration.
- `src/components/specific/project/ExecutionDock.svelte` is still imported by the Workbench's `ExecutionControls.svelte`, and also serves the Interactive editor. Its duplicate-looking layouts support those two accepted shells; ADR 0024 and `docs/design/workbench.md` explicitly keep the Workbench and inline editor separate.
- The Workbench's editor groups, shared models, two tab rows, connector placement, compact layout, and documented CSS geometry remain current design behavior. `EditorGroup.svelte.ts` and `WorkbenchSession.svelte.ts` are locally modified in this worktree, so no possible simplification in those files is promoted here without review after that work settles.

## Audit limits

This pass found dead-code candidates in unused UI modules and superseded helpers, two focused simplifications with compiler/type evidence, and timing/layout paths that should remain without a concrete superseding mechanism. Exact-name scans do not substitute for an exhaustive architectural review, and app-internal source modules could still have undocumented external consumers. This report does not claim a browser-verified visual result. Monaco hover, icon sizing, the two input forms, and compact Workbench behavior need browser verification if their implementations change.

## Adjacent typography lead, outside cleanup scope

`global.css` registers the bundled font under the family name `FiraCode`, while several newer markdown, documentation, search, and editor rules request `'Fira Code'`. No other `@font-face` for the spaced name or production `@fontsource/fira-mono` import was found. Those rules may therefore fall back to a system font on machines without Fira Code installed. This is a typography consistency issue, not evidence that either family declaration is dead; verify computed fonts in a browser and handle it as a separate visual change.

## Focused second pass: issue-specific workarounds

### U07 — Replace the `Input` action with the native type binding

**Confidence: high for compiler compatibility; caller behavior still merits normal UI verification.** [`Input.svelte:44`](/home/dev/code/asm-editor/src/components/shared/input/Input.svelte:44) uses `use:setType` and suppresses its action typing error, although Svelte compiler 5.57.1 accepts a read-only snippet using `<input type={type} bind:value />` with no diagnostics. The generated code updates the `type` attribute and installs Svelte's normal value binding. Compiling the current component also succeeds.

`Input` is used in the project-creation form, exam builder, exam-session password prompts, and shared prompt provider. These callers bind `value`; none passes a `change` or `blur` handler. Repository-wide search found no current subscriber to the events forwarded by `createBubbler()` either. The installed Svelte legacy implementation documents `createBubbler` as a temporary migration aid for automatically delegated Svelte 4 events.

**Suggested cleanup:** render `type={type}` directly and remove `setType` plus its `@ts-expect-error`. Given the absence of internal `change`/`blur` subscribers, remove the two bubbled event listeners and `createBubbler` import as well, unless the component intentionally supports undocumented external consumers using legacy `on:change` or `on:blur` syntax.

**Risk/validation:** the compiler probe proves syntax and generated binding, not browser behavior for switching between text/password/number inputs. Exercise the password prompts, exam numeric field, and ordinary text field after cleanup. Keep `bind:value`, focus binding, and `onkeydown` support.

### U08 — Remove the Monaco worker-assignment suppression

**Confidence: high for the installed declaration set.** [`Monaco.ts:40`](/home/dev/code/asm-editor/src/lib/monaco/Monaco.ts:40) suppresses type checking for `self.MonacoEnvironment`. The installed `monaco-editor` declaration defines that global as `Environment | undefined`, its `getWorker` accepts a `Worker`, and Vite's `?worker` declaration constructs a `Worker`. A read-only strict TypeScript probe, with those installed declarations and the current assignment shape, type-checks without diagnostics.

**Suggested cleanup:** remove the `@ts-ignore` and let TypeScript check the worker factory assignment.

**Risk/validation:** the probe used strict mode and the current installed Vite/Monaco types but did not run the repository's full TypeScript check. After a future cleanup, ensure the project config still includes both declaration sets and the editor worker loads in the browser.

### U09 — Keep the 50 ms test-start yields until a paint-safe replacement is demonstrated

**Confidence: high that the delays have a concrete purpose; no safe replacement established here.** [`InteractiveInstructionEditor.svelte:180`](/home/dev/code/asm-editor/src/components/shared/InteractiveInstructionEditor.svelte:180) and [`WorkbenchSession.svelte.ts:1372`](/home/dev/code/asm-editor/src/lib/workbench/WorkbenchSession.svelte.ts:1372) set the visible `running` state, then yield for 50 ms before starting CPU-heavy testcase work. The Workbench comment states the purpose: let the controls repaint before the cores take the thread. `tick()` only waits for Svelte's DOM update; it does not establish that the browser painted before synchronous work blocks the main thread. An animation-frame callback runs before paint and is not a proven replacement either.

**Suggested cleanup:** retain both delays until a browser measurement establishes a replacement that lets the pressed/running state paint before test execution. Do not collapse them to `tick()` or remove them based on the repeated literal alone.

**Risk/validation:** a future alternative must be exercised with a long synchronous testcase in both the inline editor and Workbench; confirm the controls visibly enter running state before the UI freezes.

### U10 — Retain tick and resize scheduling where they follow actual DOM/layout changes

**Confidence: high that the inspected paths are not generic stale waits.** Workbench group/tab changes await Svelte `tick()` before restoring editor view state (for example, [`WorkbenchSession.svelte.ts:927`](/home/dev/code/asm-editor/src/lib/workbench/WorkbenchSession.svelte.ts:927)). Source-map connectors coalesce editor scroll/layout events with `requestAnimationFrame` at [`SourceMapConnections.svelte:236`](/home/dev/code/asm-editor/src/components/specific/workbench/SourceMapConnections.svelte:236) and observe pane size with `ResizeObserver` at [line 250](/home/dev/code/asm-editor/src/components/specific/workbench/SourceMapConnections.svelte:250). These calls are tied to concrete post-render or geometry updates; no superseding mechanism was found in the current tree.

**Suggested cleanup:** none based on this pass. Review an individual wait only alongside the DOM/editor lifecycle it synchronizes and a reproduction showing it no longer serves that lifecycle.

**Risk/validation:** keep connector alignment checks for pane resize, scrolling, tab/model switch, and compact stacking if those mechanisms change.

## Read-only probe details

The Svelte probe used the installed `svelte/compiler` 5.57.1 `compile(source, { filename, generate: 'client' })` API on the current `Input.svelte` and the minimal `<input type={type} bind:value />` snippet. Both compiled without warnings; the generated snippet used `set_attribute(input, 'type', type)` followed by Svelte's `bind_value` helper.

The minimal Svelte source was:

```svelte
<script>
    let type = 'text'
    let value = $state('')
</script>

<input {type} bind:value />
```

The TypeScript probe created a virtual source file (no disk write) and called `typescript.createProgram` with `strict: true`, `noEmit: true`, `skipLibCheck: true`, `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`, DOM/ES2022 libraries, and a `vite/client` type reference. It imported the installed Monaco type and current `?worker` module and assigned `self.MonacoEnvironment = { getWorker(_moduleId: unknown, _label: string) { return new editorWorker() } }`. `ts.getPreEmitDiagnostics(program)` returned zero diagnostics.

The assignment checked was:

```ts
import editorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = {
    getWorker(_moduleId: unknown, _label: string) {
        return new editorWorker()
    }
}
```
