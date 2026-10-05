# Emulator and compilation cleanup audit

Research only. No implementation, test, config, dependency, submodule, or existing documentation files were changed by this audit. The worktree already contained extensive user edits; findings below use the checked-out files as evidence and avoid attributing those edits to this audit.

## Coverage

Reviewed `src/lib/languages` (M68K, MIPS, RISC-V, x86, Z80, Generic/Base, service adapters, and peripherals), `src/lib/sourceCompilation`, `runtime/`, `scripts/runtime/`, and emulator-facing package scripts. Checked call sites for source-compilation resolution helpers and adapter fallbacks. Read `CONTEXT.md`, ADR 0027, and `docs/design/source-compilation.md`; used focused submodule source/API evidence and selective history where it clarified compatibility origin. Did not broad-audit vendored emulator upstream, generated x86 instruction tables, or unrelated application UI. No tests or builds were run.

## Proven removal candidate

### E01 — Dormant `ProjectSourceSession`

**Confidence: high.** [`ProjectSourceSession.ts:6`](/home/dev/code/asm-editor/src/lib/languages/service/ProjectSourceSession.ts:6) is never imported or constructed anywhere in the repository; a repository-wide reference search finds only its declaration. It registers a source/build-snapshot view but permanently exposes `snapshot` as `undefined`.

The class was added by `cf71443` with the comment “for Targets whose semantic Worker has not migrated yet.” That temporary boundary is gone: [`WorkbenchSession.svelte.ts:673`](/home/dev/code/asm-editor/src/lib/workbench/WorkbenchSession.svelte.ts:673) creates `ProjectLanguageSession` for the selected Project target, source changes call `update` (line 537), and build snapshots call `setBuild` (line 551). [`LanguageWorkerManager.ts:21`](/home/dev/code/asm-editor/src/lib/languages/service/LanguageWorkerManager.ts:21) maps every supported analysis target to a Worker, with MIPS and both RISC-V modes sharing the MARS Worker.

**Suggested cleanup:** remove the unused class and its now-unneeded `ProjectAnalysisSnapshot` type import. Keep `LanguageSessionView` and the registry: `ProjectLanguageSession` still implements and registers that interface. **Risk/validation:** check the source registry and editor navigation providers still resolve live/build sources through `ProjectLanguageSession`; no behavior depends on the dormant implementation.

### E02 — M68K instruction-address compatibility scan

**Confidence: high.** [`M68KEmulator.svelte.ts:983`](/home/dev/code/asm-editor/src/lib/languages/M68K/M68KEmulator.svelte.ts:983) conditionally probes `Program.getInstructionAddresses()` through an optional cast, then falls back to walking every two-byte address from `entryPoint` to `endAddress` and calling `getInstructionAt` until `instructionCount` addresses are found. That fallback is the compatibility path for the published Core described in the code comment at lines 991–993.

The installed (non-symlinked) `node_modules/@specy/s68k` is 2.5.0. Its [`Program` declaration](/home/dev/code/asm-editor/node_modules/@specy/s68k/dist/index.d.ts:89) and implementation [`getInstructionAddresses()`](/home/dev/code/asm-editor/node_modules/@specy/s68k/dist/index.js:88) provide the compact address index directly. The matching local submodule is also tagged v2.5.0 and has the same API. Thus the fallback no longer serves the package the editor installs. It was introduced with the Core integration commit `61b9798` to bridge a published-versus-local API gap at that time.

**Suggested cleanup:** type the helper against the pinned `Program` API and return `program.getInstructionAddresses()` directly; remove the optional cast, `interpreter` and `info` helper parameters if their only use is this fallback, and update its caller. **Risk/validation:** ensure the method's ordering and returned set still match the instruction index consumed by build artifacts and breakpoints; validate against a sparse program with data between instructions and a non-default entry point.

### E05 — Unused M68K CCR parser superseded by the Core converter

**Confidence: high.** [`M68kUtils.ts:1`](/home/dev/code/asm-editor/src/lib/languages/M68K/M68kUtils.ts:1) exports `parseCcr`, but no production or test caller remains. It decodes five low bits in C/V/Z/N/X order. The active M68K undo adapter already uses the pinned Core's `ccrToFlagsArray` at [`M68KEmulator.svelte.ts:303`](/home/dev/code/asm-editor/src/lib/languages/M68K/M68KEmulator.svelte.ts:303), which is the status-flag conversion used by current code. The helper dates to the M68K utility module's initial 2025 introduction and has no other users.

**Suggested cleanup:** remove `parseCcr`, retaining `getM68kErrorMessage` from the same file. **Risk/validation:** confirm no out-of-repository consumer relies on this app-internal export; the current emulator path does not.

### E06 — Unused identity maps for M68K branch conditions and shift directions

**Confidence: high.** [`M68K-documentation.ts:263`](/home/dev/code/asm-editor/src/lib/languages/M68K/M68K-documentation.ts:263) builds `branchConditionsMap` as an identity map over `branchConditions`, and line 309 builds `directionsMap` the same way over `directions`. Neither map has a caller. The live docs use the arrays directly; branch help uses the separate `branchConditionsDescriptions` and `branchConditionsFlags` maps, while shift docs use `directions` and `directionsDescriptions`.

**Suggested cleanup:** remove the two identity maps. **Risk/validation:** both are exported from the app module, so check for consumers outside this repository before removing them.

### E07 — Monaco source converters have tests but no production caller

**Confidence: medium-high.** [`monacoConversions.ts:7`](/home/dev/code/asm-editor/src/lib/languages/service/monacoConversions.ts:7) exports `sourcePositionToMonaco` and `sourceRangeToMonaco`; repository search finds their unit tests as the only callers. They are simple field-by-field +1 conversions. The neighboring `zeroBasedLineToMonaco` is separate and should be retained if its production caller remains.

**Suggested cleanup:** remove the two unused conversion exports and their unit assertions, or migrate a real Monaco provider to them if centralizing those conversions is still the intended design. **Risk/validation:** preserve zero-based SourcePosition/SourceRange semantics in any future provider that adopts them.

### E03 — Obsolete x86 Core-version compatibility branches

**Confidence: high.** The current package and lockfile pin `@specy/x86` 4.0.0. The installed [`index.d.mts`](/home/dev/code/asm-editor/node_modules/@specy/x86/dist/index.d.mts:1066) declares `compileProject`, [`checkProject`](/home/dev/code/asm-editor/node_modules/@specy/x86/dist/index.d.mts:1084), `setUndoEnabled` (line 1102), `getUndoDepth` (1112), `getRecordedEntryCount` (1122), and `getCompiledInstructions` (1180). It also requires `projectLinking: 'archive'` (1031); installed runtime implementations are present in [`index.mjs`](/home/dev/code/asm-editor/node_modules/@specy/x86/dist/index.mjs:2862). The 3.0.0 published declarations already had the project APIs and compiled-instruction method ([published 3.0.0 package](https://registry.npmjs.org/@specy/x86/-/x86-3.0.0.tgz), lines 999, 1016, 1076), but did not yet have archive linking or the undo-history methods. The current pin therefore makes all these feature tests obsolete, including gates that were still needed under 3.0.

The code still branches on these obsolete capabilities: `hasNativeProjectApi` selects `compileLegacyProject` and old `checkCode` paths in [`X86Emulator.svelte.ts:231`](/home/dev/code/asm-editor/src/lib/languages/X86/X86Emulator.svelte.ts:231) and [line 264](/home/dev/code/asm-editor/src/lib/languages/X86/X86Emulator.svelte.ts:264); `hasCompiledInstructionApi` can suppress build artifacts at [line 328](/home/dev/code/asm-editor/src/lib/languages/X86/X86Emulator.svelte.ts:328); project breakpoint conversion still selects generated-line mapping at [line 513](/home/dev/code/asm-editor/src/lib/languages/X86/X86Emulator.svelte.ts:513). `x86CoreSupportsUndoRecording` and `recordedEntryCount` retain optional casts at lines 867–885. The language-service checker repeats its own `checkProject` feature test at [`x86Adapter.ts:83`](/home/dev/code/asm-editor/src/lib/languages/service/adapters/x86Adapter.ts:83). [`x86StartUnit.ts:51`](/home/dev/code/asm-editor/src/lib/languages/X86/x86StartUnit.ts:51) probes `projectLinking`, and `x86CoreProject` still constructs the old “all files” layout. Tests retain matching conditional branches/skips, including archive-linking and unavailable-Undo cases in [`X86Emulator.test.ts:701`](/home/dev/code/asm-editor/src/lib/languages/X86/X86Emulator.test.ts:701) and [line 976](/home/dev/code/asm-editor/src/lib/languages/X86/X86Emulator.test.ts:976), and a probe test in [`x86StartUnit.test.ts:62`](/home/dev/code/asm-editor/src/lib/languages/X86/x86StartUnit.test.ts:62).

The single-buffer/legacy-project path originated before 3.0's Project compile/check API. The archive-vs-all-files branch was a valid bridge while the editor installed 3.0 and the local submodule exposed 4.0; it too is now superseded by the current pin. The non-archive linker mode also explains older test cases asserting conflicts from files that archive linking now leaves unused.

**Suggested cleanup:** type against `CoreX86Emulator`'s current API and call project compile/check, instruction listing, undo controls/count, breakpoint-by-file/line, and archive linking directly. Delete the single-buffer compile/check implementation and old start-unit compatibility layout; remove associated version-probe helpers and tests that assert behavior on absent methods. Keep `expandLegacyX86Project` only for the reachability walk until it is split as E04. **Risk/validation:** verify Project include resolution, binary `%incbin`, direct per-file diagnostics and breakpoints, start/support unit linking, undo across the start unit, and build-artifact/source mapping using only the 4.0 behavior. Check that generated translation-unit limits and current uncommitted x86 changes are preserved while removing branches.

### E09 — RISC-V Core guards for APIs present in the pinned Core

**Confidence: high.** [`RISC-V-core.ts:21`](/home/dev/code/asm-editor/src/lib/languages/RISC-V/RISC-V-core.ts:21) treats `RISCV.assemblerProfiles` as optional, defaults a missing property to `['rars']`, and separately checks for optional `analyzeGnuUnit` before runtime linking. The exact installed and pinned `@specy/risc-v` is 3.7.0; its declaration lists `assemblerProfiles`, `analyzeGnuUnit`, and a typed `makeRiscVFromFiles(files, entry, options)` whose `AssemblyOptions` includes `assemblerProfile`, `libraries`, and `entrySymbol`. `JsRiscV` also declares `getAddressOfLabel`, so the local `ProfileCore` intersection and the hand-written factory cast at lines 5 and 29 are redundant.

The guard and its test were introduced to prevent older published Cores from silently ignoring profile options. That package version is no longer in the editor's dependency graph. MIPS 3.7.0 likewise declares both `assemblerProfiles` and `analyzeGnuUnit`; its wrapper already uses the typed API directly and has no parallel fallback.

**Suggested cleanup:** call `RISCV.makeRiscVFromFiles` with its declared options and use the declared Core methods directly; remove the old-Core guard and its simulated-old-package test. **Risk/validation:** preserve the error for unsupported profile strings from input validation and the current requirement that GNU profiles/runtime linking use a Core that actually supports them; the pinned Core's types and runtime exports provide both.

## Needs verification before cleanup

### E10 — Re-measure the x86 per-slice throughput estimate after Core performance changes

**Confidence: medium; measurement needed.** [`X86Emulator.svelte.ts:67`](/home/dev/code/asm-editor/src/lib/languages/X86/X86Emulator.svelte.ts:67) fixes the conversion at 10 instructions/ms, with its comment dating the measurement to phase 8 and about 11 instructions/ms. That estimate sets the run limit at line 512 through `sliceInstructionBudget`; the Core is now v4.0.0 and its history records a performance change specifically titled “record debugger undo history in wasm and run bounded batches” ([Core history](https://github.com/specy/blink-js/commit/68aa170), followed by [v4.0.0](https://github.com/specy/blink-js/releases/tag/v4.0.0)). The current Core executes a request in native slices capped at 50,000 instructions ([`x86-emulator.ts:622`](/home/dev/code/asm-editor/emulators/x86/blink-js/src/x86-emulator.ts:622)). Those changes establish that the old calibration predates a relevant execution-path change, but do not themselves quantify instructions/ms; internal batching caps host blocking while undo moved into WASM, and either effect could alter the old rate.

**Suggested cleanup:** in an isolated worktree, rerun the existing compute-only throughput and responsiveness measurement with the installed 4.0 package, then update the estimate/comment if the per-instruction rate moved materially. Do not remove the fixed estimate from code based on the commit title or the 50,000 batch cap alone. **Risk/validation:** a stale low estimate increases yield overhead relative to instructions executed and reduces compute throughput; an estimate that is too high can again delay Stop and host rendering. Preserve the under-100-ms Stop and under-five-percent yield-overhead targets in ADR 0007.

### E04 — x86 native-path reachability reuses the legacy expander

**Confidence: medium.** On the native API path, [`x86Adapter.ts:57`](/home/dev/code/asm-editor/src/lib/languages/service/adapters/x86Adapter.ts:57) calls `expandLegacyX86Project` for its `reached` set. That function also expands source text, builds a line map, constructs virtual binary-file records, and accumulates diagnostics; the native path uses only `reached` (lines 91–95). The current rationale is valid: the native Core does not provide a reached-file set, and the editor must not claim an unresolved include is unreachable.

**Suggested cleanup:** extract a small include-reachability walker shared with the legacy path, so the native path does not produce unused expanded assembly, line mappings, or virtual Files. Do not remove the include walk unless the Core API gains a trustworthy reached set. **Risk/validation:** preserve the current rule that an unresolved include yields `unknown` reachability, while assembling each independent translation unit for status reporting.

### E08 — Z80 color field metadata is disconnected from the docs renderer

**Confidence: medium.** [`Z80-model.ts:452`](/home/dev/code/asm-editor/src/lib/languages/Z80/Z80-model.ts:452) exports `Z80_COLOR_FIELDS` with the 3-3-2 masks and shifts; it has no caller. The Z80 docs renderer's `cssColor` at [`z80.ts:267`](/home/dev/code/asm-editor/src/lib/documentation/z80/z80.ts:267) independently hardcodes the same bit positions. The metadata was introduced with the stated purpose “for the documentation page's color table,” but the current renderer uses `Z80_COLORS` and the hardcoded conversion.

**Suggested cleanup:** either drive the renderer's channel extraction from `Z80_COLOR_FIELDS` to establish it as the single source of truth, or remove the unused metadata if the documentation has no need to expose bit widths. **Risk/validation:** keep color swatches aligned with the 3-3-2 byte layout and channel expansion used by the Z80 Screen adapter.

## Other low-reference symbols assessed

- `redOf`, `greenOf`, and `blueOf` in `peripherals/screen/color.ts` have no current internal call sites. They are tiny unused exports rather than a published app-module API; they are low-priority removal candidates if the renderer does not adopt them.
- `provideRuntimeFunctions` has a real test caller: `runtimeEmulator.test.ts` injects the test ABI's `puts` metadata so the emulators' undefined-library-function hint path can be tested without loading generated metadata. Keep this test seam.
- `x86InstructionNames` and `x86SyscallsByNumber` have no current internal callers or dynamic lookups. They are low-priority dead exports from an app module, not a published package API; remove them if a later cleanup has no broader downstream consumer to preserve.

## Intentional compatibility / KEEP

- **MIPS and RISC-V peripheral and history adaptations:** retain Core-facing conversions and undo adapters unless a concrete currently pinned Core API change supersedes them. Their current callers are active in each emulator; comments mentioning “legacy” often describe behavioral parity, not an obsolete branch.
- **Source compilation's `rars` fallback and old records:** [`assemblyProfile.ts:63`](/home/dev/code/asm-editor/src/lib/sourceCompilation/assemblyProfile.ts:63) preserves the manual Project setting/default when no reachable Compilation record requires a profile. Records written before profile provenance also remain accepted. ADR 0027's self-contained boundary is superseded by ADR 0029, but these parsing/default paths are still exercised by current project compatibility and are not removable on that document change alone.
- **`resolveRuntimeLink` and `resolveX86Start`:** both are called from `WorkbenchSession` and remain the active policy boundary for runtime ABI and x86 start-unit selection. ADR 0027's earlier model was superseded; these helpers implement the current Runtime ABI/start-unit behavior, not dead code.
- **M68K, MIPS, and RISC-V adapters:** their legacy-specific stack placement, status, and interrupt behavior is still consumed by current emulator classes. No redundant old emulator interface with no callers was established in this pass.

## Audit limits

This audit identifies six high-confidence findings, one medium-high conversion-helper candidate, two refactor/consolidation opportunities, and one measurement request. The current installed x86 4.0 package and local submodule both provide the Project, archive-linking, compiled-instruction, and undo-history APIs, so the conditional compatibility paths and their old-version tests can be removed together. Generated instruction data and broad upstream submodule internals were intentionally excluded; adapter behavior there was assessed from editor call sites and the pinned package APIs rather than by searching vendored text for words like “legacy” or “fallback.”
