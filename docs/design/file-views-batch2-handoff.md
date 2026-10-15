# File views, Batch 2: handoff for implementation

Written 2026-10-16 for an agent implementing Batch 2 (the decompiler in the editor) without the design session's context. Batch 1, everything but the decompiler, is on `feat/file-views`; the decompiler package is built and pushed but not yet used by the editor. The owner asked to stop after Batch 1, so start only when they ask.

## Read first, in this order

1. [CONTEXT.md](../../CONTEXT.md): use its terms exactly, especially **Pseudocode**, **Listing**, **Executable**, **Hex editor**, **Byte edit**, **Build output**, **Breakpoint**, **Invented name**, **Generated assembly** and **Source map**.
2. [file-views.md](./file-views.md): decisions 5, 6, 10, 11, 12, 13 and 15 to 17, the **Research** section, and the **Implementation notes** for D1 to D3 (the package) and E1 to E10 (what Batch 1 built and how).
3. [ADR 0045](../adr/0045-invented-names-are-frozen-words-from-file-addresses.md), [ADR 0048](../adr/0048-decompiled-code-is-a-view-not-a-file.md) and [ADR 0049](../adr/0049-pseudocode-comes-from-our-own-ghidra-decompiler-package.md).
4. [file-views-plan.md](./file-views-plan.md): **Two batches**, the **Decisions taken while planning** (6, 7, 8, 12, 14 and 15 above all), and the milestones you implement: D1.6, E8, E9, the Pseudocode share of E10, and D4.
5. The package's own documentation: `README.md` and `js/README.md` in the decompiler repository.

The design wins over the plan; the plan's defaults stand unless one proves untenable, and then you pick the closest workable choice and record it.

## Scope

- **D1.6.** The decompiler as the submodule `packages/decompiler` and a workspace package.
- **E8.** Pseudocode: the `ProgramImage` built from a Listing, the worker and its client, the document, the pairing with the Listing, and the program counter's line.
- **E9.** Breakpoints on Pseudocode lines.
- **E10, the Pseudocode share.** The x86 Executables Chapter's entries on Decompile and the Pseudocode, browser verification and a code review.
- **D4.** The package's 1.0.0, prepared but not tagged or published: the README, the changelog, a CD workflow copied from the x86 Core's `.github/workflows/cd.yml`, and the version.

Not in scope: Decompile on a library's Listing (`@lib/…`), exporting the Pseudocode as a File, and the other Deferred items in the design.

## Where things are (2026-10-16)

- **The decompiler** is `https://github.com/Specy/decompiler-js`, `main` at `9ecde86` (pushed by the owner), with a local clone at `/home/dev/code/decompiler-js`. It builds Ghidra 12.1.4 (`8b6bbb8`), vendored by `scripts/vendor-ghidra.sh`.
    - The npm package is `@specy/decompiler` 0.0.0 in `js/`, and its API is the plan's decision 6:
        - `loadDecompiler`, `openProgram`, `decompile` and `dispose`;
        - D2 added `decompiler.memory()`, `warnings` on the program and a `target` on label tokens;
        - D3 added `timeLimitMs` and `maxInstructions`.
    - glibc's signatures come with it as `@specy/decompiler/prototypes/glibc.h`, also exported as a string at `…/prototypes/glibc`.
    - The wasm is about 713 KB gzipped and `x86-64.sla` 501 KB. Both are committed and rebuilt only by `scripts/compile_decompiler.sh` and `scripts/compile_specs.sh` with emsdk 6.0.9.
- **The editor**: Batch 1 is on `feat/file-views`. If the owner has merged it, branch from `main`; otherwise branch from `feat/file-views` and rebase onto `main` once it is merged.

## Carry-over notes

These are not written anywhere else. They come from the Batch 1 and decompiler agents.

- **The Listing behind a Pseudocode pane.** `EditorGroup.displayedListing` is computed only when the pane's view is `listing` (E2), but a Pseudocode pane needs the Listing document too, for `functionAtLine`, `lineOfAddress` and the `ProgramImage`. Give it access without making every Hex pane generate a Listing.
- **Model keys.** `WorkbenchSession.retainedModelKeys` keeps a `#listing` model key for every byte File; Pseudocode models need theirs kept the same way. Model identities and URIs already carry `view: 'pseudocode'` (`ModelView` in `lib/languages/service/uri.ts`).
- **The view switch.** `fileViewsOf('executable')` in `lib/fileViews.ts` is `['hex', 'listing']`. Add `'pseudocode'`, and add the button to `VIEW_BUTTONS` in `components/specific/workbench/ExecutionControls.svelte` ("Decompile", with an icon). Then re-measure the dock's container queries for the third button: `ExecutionDock.svelte` records the widths it measured in a comment above them.
- **Pairing.** `resolveMappingPair` (`lib/workbench/mappingPair.ts`) now pairs only panes that both show text. The Pseudocode and Listing pair is a separate path, using the plan's function-scoped `PseudocodeMap` (decision 14). Its consumers take a line range so they never walk a whole Listing; libc's has 473,000 lines.
- **The debugger.** `showBuildFile` already leaves a Pseudocode pane alone (E6). The Listing pane beside it follows the program counter, and the Pseudocode highlights the line whose `addresses` hold it.
- **Names.** Pass every label the Listing has (decision 7): functions, `DAT_` and `s_` data, `name@plt` stubs passed as the functions they call (`strcmp`), and `name@got` slots as data. The package invents no names: an address left unnamed prints the decompiler's own (`cRam…`, or `func_0x…` for a call target).
- **Calls through a GOT slot get no function signature.** For example `_start`'s `call [rel __libc_start_main@got]`. Fix this in E8.1. If the package's `ProgramImage` cannot say "this slot holds a pointer to function X", extend it: for example a `pointers: {address, name}[]` input that types the slot as a pointer to X's prototype. That is a package change, so give it its own commit in the submodule, with tests, and a version still below 1.0.0.
- **IRELATIVE `.plt` stubs** are named by the Listing (the binary import notes, M7). Passing them makes `func_0x…` disappear from static binaries, where D3 counted 744 such calls.
- **Slow functions.** `printf_positional` in a static glibc binary took 14 s on a desktop and up to 26 s under load, against the 30-second limit. Show "Decompiling…" while waiting and the package's own message when the limit is reached. The worker's own timeout is 45 s (plan decision 8).
- **Memory.** The SLEIGH translator stays cached after `dispose` (about 18 MB). Keep one open program per Executable and dispose it when the File's bytes change (Byte edits change them: include `byteEditsKey` in every cache key) or its last pane closes.
- **The Build output** gets Hex, Disassemble and Decompile like any Executable. Its Pseudocode, like its Listing, takes no Breakpoints and shows no program counter (plan decision 15, E7).
- **An open question for the owner.** In a Debug session, a single pane the person switched to Hex returns to Disassemble at the next Step (E6). The design says only the Build moves it. Ask before changing this either way.

## Rules

- **Branches and commits.** Create `feat/pseudocode` as described in **Where things are**. Commit per milestone, in the submodule for package work and in the monorepo for editor work (bumping the submodule pointer). Never push, tag or publish. Never add `Co-Authored-By` or any other trailer.
- **Shared working tree.** Another session may have uncommitted changes in the tree. Commit by path, and never stage, revert or format files you did not change.
- **The submodule (D1.6).**
    1. `git submodule add -b main https://github.com/Specy/decompiler-js packages/decompiler`.
    2. List `packages/decompiler/js` in `pnpm-workspace.yaml`.
    3. Add a `build:decompiler` task to the root `vite.config.ts`, beside `build:x86` and inside `build:cores`.
    4. Add the submodule to the `CORES` format and lint ignore lists.
    5. Add its `dist` to the paths CI's `cores` job uploads.
    6. Make the editor depend on `"@specy/decompiler": "workspace:*"`.
- **Checks.**
    - The package, in `packages/decompiler/js`: `npm run type-check`, `npm test`, `npm run build` and `npm run test:dist`.
    - The editor, from the root: `pnpm run check`, `pnpm run lint`, `pnpm test` and `npx --no-install vp fmt --check`.
    - The browser recipes in the plan's **Ground rules**: your own dev server with HMR off and its own cache directory, headless Chrome 153 with `matchMedia` patched, and a real click before typing into Monaco.
- **Record deviations** as E8, E9 and E10 bullets in the design's **Implementation notes**, with commit hashes and measurements.

## When to stop and ask instead of deciding

- Anything that would change a decision in the design or an ADR.
- The Step-to-Disassemble question above.
- Tagging or publishing `@specy/decompiler`, which is the owner's job.

## Final report

For each milestone, give its commits and what was done. Then give:

- the Pseudocode of crackme's `main` and of crackme-stripped's `main` as the editor shows them;
- decompile times in the browser;
- every deviation, with its reason;
- the checks' results;
- what is left for the owner.
