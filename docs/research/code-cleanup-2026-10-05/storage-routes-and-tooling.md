# Code cleanup audit: storage, routes, and tooling

Date: 2026-10-05  
Scope: `src/stores`, `src/routes`, project persistence and archive code, documentation/search/content utilities, non-emulator scripts, package/configuration files, `.github`, and `.gitignore`. Language implementations, source compilation, Workbench, Monaco, and emulator scripts were outside this pass.

This is a read-only audit. The repository had pre-existing edits and untracked files when the audit began, including edits to `CONTEXT.md`, design documents, x86/source-compilation files, Workbench files, and the `emulators/x86` submodule. None were changed. The only file created by this audit is this report. No tests, builds, installs, or dependency changes were run.

**Snapshot caveat:** after the initial audit and dependency inspection, the shared workspace changed externally: `package.json`, `package-lock.json`, `docs/design/x86-gcc-intel-v1.md`, and `emulators/x86` now have edits, and the x86 package is reported as version 4.0.0. I did not make or review those changes. The dependency findings above reflect the package graph seen during the initial scan; recheck them against the final package snapshot before acting on S06. The other route and storage findings are unaffected.

No `AGENTS.md` applies inside this repository. `CONTEXT.md`, ADRs 0014, 0019, 0025–0031, and the current untracked ADR 0033 were read. ADR 0027 is explicitly superseded by ADR 0029. Active route loaders, dynamic imports, `import.meta.glob` users, Svelte component imports, and relevant project history were checked before classifying candidates.

## Safe cleanup candidates

### S01 — Remove the empty obsolete `promptStore.ts`

**Confidence: high.** [`src/stores/promptStore.ts`](/home/dev/code/asm-editor/src/stores/promptStore.ts) is a tracked, zero-byte file. In-repository consumers import `$stores/promptStore.svelte` (for example, [`src/components/shared/providers/PromptProvider.svelte:2`](/home/dev/code/asm-editor/src/components/shared/providers/PromptProvider.svelte:2)); a repository-wide search found no imports of the extensionless `.ts` file. The active implementation lives in [`src/stores/promptStore.svelte.ts:1`](/home/dev/code/asm-editor/src/stores/promptStore.svelte.ts:1).

Git history shows the old store implementation was deleted in July 2025. The empty path was reintroduced in January 2026 when a content file was copied to that path, with no implementation. Delete the zero-byte file. Risk is limited to an external consumer importing an internal store path. Focused validation: SvelteKit sync/type check and search for unresolved imports of `promptStore`.

### S02 — Remove the retired module-page snapshots and their orphaned content loader

**Confidence: high.** These three tracked files are named with `.txt`, so SvelteKit does not treat them as route modules:

- `src/routes/learn/courses/[courseId]/[moduleId]/+page.server.ts.txt`
- `src/routes/learn/courses/[courseId]/[moduleId]/+page.ts.txt`
- `src/routes/learn/courses/[courseId]/[moduleId]/+page.svelte.txt`

The old client loader fetches module markdown through `getModuleContent` ([`+page.ts.txt:2`](/home/dev/code/asm-editor/src/routes/learn/courses/[courseId]/[moduleId]/+page.ts.txt:2)); the live course overview lists modules and lecture links ([`src/routes/learn/courses/[courseId]/+page.svelte:58`](/home/dev/code/asm-editor/src/routes/learn/courses/[courseId]/+page.svelte:58)), while active lecture content is loaded by the nested lecture server route. `getModuleContent` at [`src/lib/content/getters.ts:162`](/home/dev/code/asm-editor/src/lib/content/getters.ts:162) has no product callers; its only other reference is the archived `.txt` loader. The files date to the 2025 initial course scaffold; current SvelteKit route discovery and the active code graph provide no execution path to them.

Proposed cleanup: delete the three snapshots and `getModuleContent`. Keep the `[moduleId]` directory if needed to contain the nested lecture route. Risk: someone may be treating the `.txt` files as an informal archive. Focused validation: run SvelteKit sync/type checking after deletion and verify course overview links still navigate to nested lecture pages.

### S03 — Remove the unused raw single-source export helper

**Confidence: high.** [`projectToSingleSource`](/home/dev/code/asm-editor/src/lib/projectArchive.ts:100) and its `SingleSourceExport` type have no production callers; only `projectArchive.test.ts` refers to them. ADR 0019 records that the raw Entry-only download was removed from Project cards in favor of one shape-aware download: compatible one-file projects export source plus metadata, and other projects export an archive. The current implementation is `projectDownload` at `src/lib/projectArchive.ts:123`; the UI uses `isSingleSourceProject` to choose that format and retain eligibility behavior.

Remove `projectToSingleSource`, its result type, and tests that only exercise that unused API while retaining `isSingleSourceProject`, `projectDownload`, archive handling, and legacy linked-source write-back. Risk: callers outside the repository may have imported this private module helper. Focused validation: keep coverage for the active source-with-metadata path and multi-file archive round trips.

### S04 — Remove confirmed unreferenced helper exports

**Confidence: high for in-repository use.** A repository-wide symbol sweep, including tests and scripts, found no references beyond each declaration for the following exports. `getModuleContent` is excluded from this list because its archived-route reference is covered by S02.

- `createDefaultExamPayload` in [`src/lib/exam.ts:158`](/home/dev/code/asm-editor/src/lib/exam.ts:158). The active exam builder creates sections through `createDefaultExamSection`; no production flow uses the whole-payload factory.
- `scopeKey` in [`src/lib/search/scope.ts:57`](/home/dev/code/asm-editor/src/lib/search/scope.ts:57). Current search caches loaded shards individually by `ShardId` in `searchClient.svelte.ts`, so scope-level cache keys are not used.
- `bigIntOfSize` and `getEnumKeys` in [`src/lib/utils.ts:33`](/home/dev/code/asm-editor/src/lib/utils.ts:33) and [`src/lib/utils.ts:120`](/home/dev/code/asm-editor/src/lib/utils.ts:120). Neither has callers; other live utilities in the same module are used.

Proposed cleanup: remove these exports and the now-unused `RegisterSize` type import if `bigIntOfSize` is removed. These helpers were introduced alongside the early emulator/search/exam implementations, but no remaining product path depends on them. Risk: internal modules are not a published public API, but an out-of-repository consumer could still import them. Focused validation: type check and targeted search for each identifier after removal. `entriesOf` and `documentationProblems` also lack product callers, but their tests assert concrete behavior: flattening entries for lowercase-name checks and verifying unique ids/anchors, titles, summaries, and hrefs. A later API cleanup could inline those helpers into tests; this audit does not classify them as useless because they centralize nontrivial invariant checks.

### S05 — Remove three unused SvelteKit aliases

**Confidence: high.** [`svelte.config.js:21`](/home/dev/code/asm-editor/svelte.config.js:21), [`svelte.config.js:23`](/home/dev/code/asm-editor/svelte.config.js:23), and [`svelte.config.js:24`](/home/dev/code/asm-editor/svelte.config.js:24) define `$utils`, `$overrides`, and `$embed`. A search of application source found no imports using these aliases. The `$utils` destination `src/utils` does not exist; `$overrides` and `$embed` also have no matching destination under the current `src/components/content` tree. Other aliases such as `$cmp`, `$stores`, `$content`, and `$src` have active consumers and should remain.

Proposed cleanup: remove only the unused alias entries. Risk is low for the tracked app; a local-only file or downstream patch could rely on them. Focused validation: SvelteKit sync/type check and inspect the generated alias configuration for active aliases. The commented legacy `layout` mapping immediately above the config is related stale configuration, but was not included as a separate finding because it has no runtime effect.

### S06 — Remove four unused direct dependencies

**Confidence: high for the current app graph.** The application source and configuration have no imports of `@cartamd/plugin-component`, `@fontsource/fira-mono`, `mdast-util-to-string`, or `@xterm/xterm`; all four are direct entries in [`package.json:41`](/home/dev/code/asm-editor/package.json:41), [`package.json:44`](/home/dev/code/asm-editor/package.json:44), [`package.json:53`](/home/dev/code/asm-editor/package.json:53), and [`package.json:60`](/home/dev/code/asm-editor/package.json:60).

- `@cartamd/plugin-component` has no app import and no other package in the lockfile depends on it. Markdown uses `carta-md` and `@cartamd/plugin-code` in `MarkdownRenderer.svelte` and `MarkdownEditor.svelte`; neither uses the component plugin. Git history shows it was added with the 2025 course scaffold, but no tracked source references it.
- `@fontsource/fira-mono` has no app import. The app serves its current Fira Code font files from `static/fonts/` and declares that face in [`src/global.css:8`](/home/dev/code/asm-editor/src/global.css:8); the installed font package is not how those files are loaded. Some CSS asks for the family `Fira Mono`, but the package is not imported and does not provide the current bundled Fira Code assets, so that typography issue does not make this dependency active.
- `mdast-util-to-string` was explicitly listed in the October 2026 search design plan for extracting text. Current search instead calls the app's `plainText` helper in [`src/lib/documentation/entries.ts:118`](/home/dev/code/asm-editor/src/lib/documentation/entries.ts:118); no app code imports the package. It remains a transitive dependency of the Markdown parser packages in the lockfile, so removing the root direct declaration would not remove it from their dependency graph.
- `@xterm/xterm` is not imported directly by app source. [`@battlefieldduck/xterm-svelte` package metadata](/home/dev/code/asm-editor/node_modules/@battlefieldduck/xterm-svelte/package.json) shows the Svelte wrapper is directly imported by [`src/components/shared/Console.svelte:2`](/home/dev/code/asm-editor/src/components/shared/Console.svelte:2) and declares `@xterm/xterm` as a dependency; its public type declarations re-export xterm types. Keep the Svelte wrapper and its dependency; the root direct declaration appears redundant.

Proposed cleanup: remove only these four root dependency declarations and update the lockfile through the normal dependency workflow later. Risk is low for the tracked import graph, with `@xterm/xterm` the most sensitive because wrapper types re-export it; the wrapper's own manifest currently guarantees it is installed transitively. Focused validation: inspect the lockfile's resulting dependency tree and run type-check/build after the future package change. No install or package mutation was performed for this audit.

## Needs verification before cleanup

### S07 — Remove the old `__tla` workaround from instruction routes, retaining client-only loading

**Confidence: medium-high that the shim and suppressions are obsolete; retain the dynamic import.** Five instruction pages—M68K, MIPS, RISC-V, x86, and Z80—repeat an `onMount` dynamic import of `ClientOnly.svelte`, followed by `await imp?.__tla` and two `@ts-ignore` comments (for example, [`M68K +page.svelte:28`](/home/dev/code/asm-editor/src/routes/documentation/m68k/instruction/[instructionName]/+page.svelte:28), MIPS line 22, RISC-V line 22, x86 line 29, and Z80 line 29). The pattern originated in the 2023 commit `1c61973` (“hacky and bad solution”) and was copied to later architecture pages. The current imported component is still required on the client: it creates an Emulator through [`EmulatorLoader.svelte:43`](/home/dev/code/asm-editor/src/components/shared/providers/EmulatorLoader.svelte:43), so importing it at page module scope would pull emulator initialization into SSR/prerender.

Current config includes `vite-plugin-wasm` but no `vite-plugin-top-level-await`; the installed wasm plugin emits native top-level `await`, and its documentation says the extra plugin is needed only for targets that do not support it. Existing `.svelte-kit` client output contains the `await e?.__tla` expression in each route, but a search of generated JavaScript found no module that exports `__tla`. A missing optional property makes that await a no-op; native dynamic `import()` already waits for module graph evaluation. This is strong evidence that the property shim and related suppressions are vestigial, but no fresh build or browser run was made.

Proposed cleanup: keep `onMount` and `await import(...)`; remove only the `__tla` await and suppressions after checking the current type diagnostics. Risk: route-specific lazy chunks or a different prerender pipeline could still expose a transformed module property not represented in the existing generated output. Focused validation: build/prerender and open at least one instruction page per distinct route implementation, confirming the embedded editor loads and direct navigation does not SSR the emulator.

### S08 — Simplify three pass-through course client loaders

**Confidence: medium.** [`src/routes/learn/courses/+page.ts:4`](/home/dev/code/asm-editor/src/routes/learn/courses/+page.ts:4), [`src/routes/learn/courses/[courseId]/+page.ts:4`](/home/dev/code/asm-editor/src/routes/learn/courses/[courseId]/+page.ts:4), and [`src/routes/learn/courses/[courseId]/[moduleId]/[lectureId]/+page.ts:7`](/home/dev/code/asm-editor/src/routes/learn/courses/[courseId]/[moduleId]/[lectureId]/+page.ts:7) only return the `data` already supplied by their sibling server loaders. They do not transform or validate it. SvelteKit can expose server-load data directly to a page, so these client loaders appear redundant wrappers.

Proposed cleanup: remove the three pass-through `load` exports and rely on generated page data types, subject to confirming the current SvelteKit version does not depend on these wrappers for client navigation or typing. Risk: generated `PageData` typing and layout/page data merging may change. Focused validation: SvelteKit sync/type check plus direct load and client-side navigation across course index, course overview, and lecture pages.

### S09 — Remove the legacy exam-link writer branch from `createShareLink`

**Confidence: high for in-repository use.** [`createShareLink` in `src/lib/utils.ts:111`](/home/dev/code/asm-editor/src/lib/utils.ts:111) accepts `mode: 'exam' | 'project'`, but every production call passes only the project argument, so the mode defaults to `'project'`. Its `exam` branch writes the old `/projects/exam?project=...` URL. Git history traces that branch to the 2023 “Add exam mode” implementation; current exam creation and sharing use `createExamSessionLink` in `src/lib/exam.ts` and `/exam/session?exam=...`.

Proposed cleanup: remove the unused `mode` parameter and the old exam URL-writing branch, leaving project sharing pointed at `/projects/share`. Retain the legacy readers: the project route still converts `/projects/exam?project=...` into the current exam session link, and the exam-session route still migrates legacy `project` query payloads. Those readers protect old links already shared; removing the writer does not make them obsolete. Risk: external callers outside this repository might still invoke the internal helper with `mode: 'exam'`. Focused validation: type-check all existing `createShareLink` calls, confirm project-share URLs remain unchanged, and retain coverage or a reproduction for both old-link migration paths.

## Compatibility and active code to retain

- Keep IndexedDB v1→v2 normalization and the shared project normalizer: ADR 0013/0014 and `src/lib/storage/db.ts` make old single-`code` projects load as the current file-map form. Do not discard unreadable rows during migration.
- Keep source-plus-metadata and ZIP import support, legacy linked-source write-back rules, and share-link handling. ADR 0019 explicitly preserves the older source format and `.zip` compatibility, while complete Projects need archives.
- Keep legacy exam-link conversion in `src/lib/exam.ts` and the consuming routes; the project route replaces old `/projects/exam?project=...` links, and the exam session accepts legacy `project` parameters.
- Keep old preference and shortcut readers: preferences still accept the `{ meta, values }` shape, and shortcuts migrate the legacy stored list to current overrides. These are user data migrations, not dead compatibility branches.
- Keep retired-course redirects and `/documentation/<language>/all` pages. The former protect links that circulated for a year; the latter are linked from each documentation landing page and are active.
- The search shard route, model download script, Vite search-model plugin, documentation route loaders, service-worker cache, and x86 docs scripts have active imports/build hooks. The four direct dependency declarations in S06 are the confirmed package cleanup candidates in this pass; other direct dependencies have active source/config imports or are required by packages the app imports. Transitive dependencies and external consumers were not exhaustively audited.

## Coverage and limits

The pass covered imports/references, route convention filenames, SvelteKit route/load patterns, dynamic imports, `import.meta.glob` content loaders, storage migration paths, current ADR rationale, and selective Git history for candidates. It did not inspect emulator internals or perform builds, tests, exhaustive dependency-tree analysis, browser checks, or remote-link analytics. Existing generated `.svelte-kit` output was treated as supporting evidence only; it may be stale. Findings concern cleanup candidates and do not establish that external consumers or unknown local patches cannot use internal exports.
