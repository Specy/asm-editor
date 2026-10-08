# C/C++ language help implementation plan

Scope agreed on **2026-10-07**. **Implemented locally on 2026-10-07; browser acceptance checks remain pending.** Milestones 1–5 and the automated lifecycle/build checks in milestone 6 are implemented. See the Implementation notes below for decisions, evidence and the remaining manual checks.

The outcome is useful help before the learner presses Compile: C/C++ keywords and snippets, suggestions for the Target's `sim_` functions and supported standard-library names, parameter hints, hover documentation, and include-path suggestions. Compile remains the authority for compiler errors. The glossary definition is [C/C++ language help](../../CONTEXT.md#cc-language-help).

## Agreed scope and capability limits

- Use Monaco completion, hover, and signature-help providers with local metadata and conservative source scanning.
- Explain each known library function with its declaration, required header, concise consumer documentation, and a link to the relevant Documentation entry.
- Provide keyword descriptions and small snippets appropriate to the compiler's C17 or C++17 mode. Verify authored examples against those modes.
- Offer explicit catalog entries for shipped public macros, typedefs, and constants as well as functions: for example `NULL`, `EOF`, `size_t`, fixed-width integer types, and the supported `SIM_SCREEN`/device helpers.
- Keep existing Monaco word suggestions as generic text suggestions; do not describe them as semantic completion.
- After the original implementation, the user approved current-file declaration suggestions for variables, parameters and ordinary functions, with basic lexical scope and function hints (2026-10-07). Included-header declarations remain deferred. Do not add project-wide symbol analysis, type inference, object/member completion, overload resolution, rename, references, or semantic diagnostics.
- Do not claim a complete C or C++ standard library. In particular, the shipped C++ wrappers expose selected C names; they do not imply containers, algorithms, or other unsupported namespaces.
- Recognized current-file declarations take precedence over library names using lexical declaration order and block scope. This is best-effort: it does not resolve arbitrary C/C++ bindings or establish program validity. Library help describes a known entry; it does not certify a call.
- Do not compile on keystrokes or send completion, hover, or parameter-hint requests to a compiler service. Ordinary editing must produce no compiler network requests.
- Full type-aware C/C++ analysis is deferred. Keep the provider-facing interface replaceable, without implementing JSON-RPC or a language server now.

The lightweight approach matches the agreed help needs and the repository's existing metadata and Monaco integration. A later semantic option would require a separate decision and fresh measurements: [clangd's features](https://clangd.llvm.org/features) include semantic completion and live errors, while [clangd-in-browser](https://github.com/guyutongxue/clangd-in-browser) requires `SharedArrayBuffer`, cross-origin isolation, and COOP/COEP. Those dependencies are outside this plan. No new ADR is needed for these reversible provider implementation details.

## Current repository state, verified 2026-10-07

- [Monaco.ts](../../src/lib/monaco/Monaco.ts) returns immediately for `c` and `cpp` registration. Its registration/disposal machinery currently installs assembly language services.
- [Editor.svelte](../../src/components/specific/project/Editor.svelte) maps C to Monaco's `cpp` ID when creating or selecting models. A model's `getLanguageId()` therefore cannot establish whether its source is C or C++.
- [records.ts](../../src/lib/sourceCompilation/records.ts) distinguishes `.c` from `.cpp`/`.cc`/`.cxx`, but `editorFileLanguage` currently classifies `.h`/`.hpp`/`.hh`/`.hxx` as `cpp` for editor presentation.
- [uri.ts](../../src/lib/languages/service/uri.ts) provides stable identities containing session ID, Project path, live/Build source kind, and Build generation. [sessionRegistry.ts](../../src/lib/languages/service/sessionRegistry.ts) resolves the owning session and its `sourcesFor` source set.
- [ProjectLanguageSession.ts](../../src/lib/languages/service/ProjectLanguageSession.ts) retains live sources and immutable Build source sets; [WorkbenchSession](../../src/lib/workbench/WorkbenchSession.svelte.ts) and [EditorGroup](../../src/lib/workbench/EditorGroup.svelte.ts) supply identities for each pane.
- [compilerExplorer.ts](../../src/lib/sourceCompilation/compilerExplorer.ts) supplies the editor-owned headers with `-nostdinc`/`-nostdinc++`, searches quoted Project headers from the source directory and Project root, and uses C17/C++17 for hosted Targets. x86 uses its translation profile and a restricted freestanding header set.
- [runtimeLibrary.ts](../../src/lib/sourceRuntime/runtimeLibrary.ts) can lazily load the small public function list separately from library assembly and sources. The current generated list contains names, headers, prototypes, and one-line consumer descriptions.
- [runtimeLanguage.ts](../../src/lib/sourceRuntime/runtimeLanguage.ts) serves assembly help: `runtimeFunctionsForModel` depends on `sources.runtimeAbi`, and its documentation adds register/call instructions. Reusing it directly would omit source help before the first Compile and present the wrong documentation.
- [environmentLibrary.ts](../../src/lib/sourceRuntime/environmentLibrary.ts) lazily loads each Target's `<sim.h>` and exposes its read-only path, `@runtime/include/sim.h`. Its header generator already reads structured syscall bindings and also generates device helpers and `SIM_SCREEN`.
- The [C++ wrappers](../../runtime/include/cstdio), including `cstdlib`, `cstring`, and `cmath`, explicitly bind names into `std` with `using ::name`; these declarations, rather than a guessed prefix rule, determine qualified suggestions.

### Target matrix

| Project Target   | Compilation and library help                                                                                            | Standard-header suggestions                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIPS             | C/C++ compilation; implemented MARS `sim_` services/device helpers and the shipped Runtime ABI's public library entries | Shipped C headers; actual C++ wrappers for C++                                                                                                                                                 |
| RISC-V (RV32)    | C/C++ compilation; implemented RARS `sim_` services/device helpers and the shipped Runtime ABI's public library entries | Shipped C headers; actual C++ wrappers for C++                                                                                                                                                 |
| RISC-V-64 (RV64) | Same capability categories as RV32, with its own generated `sim.h`                                                      | Shipped C headers; actual C++ wrappers for C++                                                                                                                                                 |
| X86              | C/C++ compilation; implemented Linux `sim_` bindings plus entries actually defined by supplied freestanding headers     | `sim.h`; C: `stddef.h`, `stdint.h`, `stdbool.h`, `stdarg.h`, `limits.h`, `float.h`, `iso646.h`, `stdnoreturn.h`; C++ additionally: `cstddef`, `cstdint`, `climits`, `cfloat`, `cstdarg`, `new` |
| M68K, Z80        | C/C++ compilation unsupported; basic language help only                                                                 | No Target-dependent library or system-header suggestions                                                                                                                                       |

x86 must not suggest `printf`, `scanf`, `malloc`, `<stdio.h>`, or other hosted Runtime library APIs. Its start/support units do not make that library available. Filter against the actual compiler-supplied header set, even when shared ABI metadata contains more entries.

A supplied header is not evidence that every declaration can execute. x86's [<new>](../../runtime/include/new) contains inline placement construction, but its [support unit](../../src/lib/languages/X86/support.asm) supplies only no-op delete hooks needed by compiler-emitted virtual destructor references, with no allocating `operator new`. Do not advertise ordinary dynamic `new`/`delete`, allocator entries, or allocator snippets as x86-supported APIs.

## Proposed implementation boundary

Add a small `src/lib/sourceLanguageHelp/` module family: context resolution, catalog loading, lexical scanning, language entries, and provider adapters. These are proposed touchpoints, not existing files. Keep metadata loading and plain-data queries independent of Monaco UI objects so the behavior can be tested and a future analysis engine can replace it.

The request flow is:

```text
Monaco model + cursor + cancellation token
    -> source identity / File-language / frozen capability context
    -> lexical context + selected local catalog
    -> completion, hover, or signature-help result
```

### Source, language, and capability context

- Parse Project URIs through `parseProjectSourceUri`; resolve `languageSession(sessionId)` and `sourcesFor(sourceKind, buildGeneration)`. Never route through the active editor, selected File, Entry path, or a global current Project.
- Derive C versus C++ from the canonical Project path with `sourceLanguage`, independently of Monaco's `cpp` tokenizer ID. For standalone editors, pass an explicit File-language hint through the Editor integration; do not infer C++ from that shared ID.
- Use C++ mode for `.hpp`/`.hh`/`.hxx`. Treat `.h` as a shared header: offer the common C17/C++17 language subset and unqualified public C/library names, without assuming it is C or enabling C++-only snippets. Explicit `std::` help requires a reliable C++ context; a later header-mode override can be considered separately.
- Basic language help may work without a registered Project. Target-dependent results require a valid owning session, supported Target, source set, and capability descriptor; otherwise return no such results.
- Extract a side-effect-free compiler capability descriptor, shared with `compilerExplorer.ts`, containing supported Target, language modes, Runtime ABI/header catalog, and actual allowed system headers. Do not import the compiler client or x86 translator to discover those facts.
- For live C/C++ sources, use the current compiler capability, including `CURRENT_RUNTIME_ABI` on hosted Targets, before any Compilation record exists. The assembly _Link Runtime library_ Setting being off must not suppress source help: compiled MIPS/RISC-V programs select their runtime automatically.
- Expose lightweight source-help context through the session registry, separately from assembly analysis. Freeze the capability descriptor, catalog revision, and File-language hints for each Build generation along with `sourcesFor('build', generation)`; retain a compiled ABI pin where present. Do not consult changed live Files/includes or mutable pane settings for a Build request.
- If a retained Build refers to an unavailable ABI/capability revision, fail closed for affected library entries. Do not silently replace its catalog with another ABI.
- Capture identity, source-context revision, and model version before awaiting a lazy load. Afterward check cancellation, model disposal/version, and that the same session/generation/context still exists. Discard obsolete results; one pane or Project must never receive another's response.

### Metadata authority and drift

- Runtime function declarations and consumer summaries come from `generated/v1/functions.json`; header availability and declarations come from the shipped `generated/v1/include.json`/`runtime/include` inputs.
- Extend `scripts/sim-header/{generate,simHeader}.mjs` to emit a small per-Target help catalog from the same structured bindings that emit `sim.h`. Refactor device/screen helper declarations into shared structured data so header generation and catalog generation use the same entries.
- Include only implemented services. Capture names, signatures, structured parameter labels/offsets, required headers, summary, documentation href, Target, language availability, definition/link capability, and entry kind. Check callable/data-entry availability beyond the presence of a header declaration; x86 `<new>` is a required negative case.
- Do not discover functions by regex parsing generated inline assembly or function bodies. Explicitly catalog public macros, typedefs, and constants; exclude include guards and private `__SIM_*` implementation macros.
- Generate C++ qualified aliases from actual wrapper `namespace std` bindings. Distinguish `printf` requiring `<stdio.h>` from `std::printf` requiring `<cstdio>`; preserve the wrappers' actual global aliases without creating duplicate suggestions for a single spelling.
- Use an explicit, validated public-entry manifest for header macros/types/constants, checked against shipped declarations. Deduplicate repeated declarations such as `size_t`/`NULL` while retaining valid header alternatives. Do not expose target-dependent numeric sizes or macro expansions as universal facts.
- Build consumer descriptions from parameter/result meaning and environment behavior. Remove register-placement and internal assembly text from source help; do not reuse `runtimeFunctionDocumentation` unchanged.
- Use current link conventions: `/documentation/{mips|risc-v}/runtime-library#<name>`, `/documentation/{mips|risc-v}/syscall#service-<code>`, and `/documentation/x86/syscall#syscall-<name>`. Validate Screen/device links against actual entries before shipping.
- Extend generation's `--check` behavior to detect stale catalogs as well as headers. Validate every catalog declaration/header/alias/link and reject unsupported or duplicate entries. Runtime header/catalog changes must regenerate and pass drift checks together.
- Browser providers load only compact catalogs. Full headers are optional when opening documentation/source; library members, Core modules, full Documentation Chapters, and compiler-output translation code are not help dependencies.

### Lexical safety and presentation policy

Use one tolerant lexical scanner for completion, hover, and call context. It must track comments, escaped character/ordinary string literals, C++ raw strings with custom delimiters and prefixes, and incomplete literals across lines. Treat line continuations correctly. Suppress assistance inside comments/strings, except intentional editing of a literal `#include "..."` or `#include <...>` path.

Recognize ordinary identifiers and simple calls, plus explicitly supported `std::name` spellings in C++ mode. Suppress library lookup after `.`, `->`, or unsupported namespace qualification. Recognized current-file declarations take precedence over matching library names in their lexical scope. Unrecognized declarations can still shadow a library name: help must not claim complete binding resolution.

For signature help, find the innermost eligible unfinished call with a balanced delimiter stack. Count commas only at that call's argument level, skipping literals/comments and nested parentheses, brackets, and braces. Do not split source or prototypes with `split(',')`. Preserve function-pointer parameter groups when generating signature labels, for example `qsort`'s comparator. Handle zero-parameter declarations and variadics explicitly; subsequent variadic arguments stay on the `...` parameter. Do not invent fixed parameters beyond the declaration.

Decline ambiguous C++ template/cast/declaration contexts, operator/member calls, and unsupported function-pointer calls instead of guessing. The scanner is lexical assistance, not a C++ parser, preprocessor evaluator, or semantic correctness check. Cache lexical state by model/version where useful; bound work and observe cancellation. Establish any numeric work limits from implementation measurements, rather than inventing an approved budget here.

Completion inserts the identifier only, with the correct replacement range. Function detail/documentation shows signature, required header, consumer summary, and documentation link. Entries may appear before their header is included, with that dependency stated plainly. The first version does not add includes or other automatic edits. Authored language snippets use normal Monaco tab stops and predictable replacement ranges.

For include editing, quoted suggestions cover plain Project headers accepted by the Compiler driver (`.h`, `.hpp`, `.hh`, `.hxx`, `.inc`), resolved from the current source directory first and Project root second. Use the selected live/Build source set, canonical path rules, and the actual driver search order. Angle suggestions contain only known shipped headers available for this Target and language; Project files never supply angle suggestions. Do not promise computed macro includes or arbitrary filesystem/toolchain paths.

## Staged implementation

### 1. Resolve source-help context

**Deliverable:** a pure capability descriptor and per-model context resolver, without user-facing providers yet.

**Touchpoints:** proposed `sourceCompilation/capabilities.ts` and `sourceLanguageHelp/context.ts`; `records.ts`, `compilerExplorer.ts`, `sessionRegistry.ts`, `ProjectLanguageSession.ts`, `WorkbenchSession.svelte.ts`, `EditorGroup.svelte.ts`, and the Editor File-language hint.

**Dependencies:** none. Extract existing header/Target capability facts without changing compilation behavior; preserve assembly service behavior.

**Acceptance and validation:** focused context tests establish:

- `.c` versus `.cpp` works despite both Monaco IDs being `cpp`; C++ headers differ from neutral `.h`.
- Standalone editors receive basic help; invalid/disposed identities receive no Target-dependent help.
- A fresh hosted Project has library capabilities before Compile with the assembly runtime Setting off. x86 receives its restricted headers; M68K/Z80 receive no library capability.
- Two Projects/panes with the same path remain distinct.
- A Build keeps its own Files, ABI/capabilities, and generation after live edits, renames, or header deletion; an absent generation fails closed.

### 2. Produce authoritative help catalogs

**Deliverable:** compact lazy-loadable runtime/header and per-Target environment catalogs with checked signatures, aliases, summaries, and links.

**Touchpoints:** `scripts/sim-header/generate.mjs`, `simHeader.mjs`, proposed `scripts/source-language-help/` generator/checker and generated catalog files; `runtime/include`, existing runtime metadata, `sourceRuntime/{environmentLibrary,runtimeLibrary}.ts`, and proposed `sourceLanguageHelp/catalog.ts`.

**Dependencies:** milestone 1's capability contract. Consume existing runtime artifacts; do not rebuild or load runtime assembly merely to generate help.

**Acceptance and validation:** generation/checker tests establish:

- Output is deterministic and `--check` fails on drift. Every environment entry matches its header/binding, including device functions, `sim_rgb`, and `SIM_SCREEN`; private helpers and unimplemented services are absent.
- `qsort` retains one comparator parameter; variadic signatures retain `...`.
- Qualified names match wrapper declarations, including `<cmath>`'s actual bindings. `NULL`/`EOF`/standard types appear only where supplied; x86 has no hosted runtime entries or allocating `new` entries despite receiving `<new>`.
- All documentation hrefs match chapter entries or the verified Screen/device destination.
- Catalog generation uses structured declarations and explicit public entries, with no header/body regex function discovery.

### 3. Implement shared lexical context

**Deliverable:** pure identifier, include, and unfinished-call context queries used by all providers.

**Touchpoints:** proposed `sourceLanguageHelp/scan.ts` and focused scanner tests; catalog parameter metadata where needed.

**Dependencies:** milestone 1's language modes; milestone 2 supplies signature metadata but does not own source scanning.

**Acceptance and validation:** scanner fixtures establish:

- Multiline/nested/incomplete calls, escaped quotes, character literals, commas in strings/raw strings, fake calls in comments, line continuations, and nested compound expressions preserve the right context.
- In `printf("%d,%d", f(1, 2), value` the last argument is index 2; the cursor inside `f` selects that nested call if known. Function-pointer prototype parameters, zero arguments, and variadics retain their declared shape.
- Raw-string/comment contents produce no identifier help. `obj.printf`, `ptr->printf`, unknown namespaces, ambiguous templates, and function-pointer calls receive no guessed library signature.
- Literal include paths remain recognizable while ordinary strings remain suppressed.

### 4. Add keyword, library, and include completion

**Deliverable:** local suggestions with correct text insertion and visible dependencies.

**Touchpoints:** proposed `sourceLanguageHelp/{languageEntries,completion,register}.ts`; `Monaco.ts` for lazy C/C++ registration; installed `monaco.d.ts` provider/item contracts; Editor integration as needed.

**Dependencies:** milestones 1–3. Register once for the effective C/C++ model selectors, including the existing shared `cpp` ID; each request resolves its semantic File language.

**Acceptance and validation:** provider tests and compiled snippet fixtures establish:

- C excludes C++-only keywords/snippets; snippets are concise and compile in C17/C++17 without requiring unsupported libraries, exceptions, or RTTI. Neutral `.h` remains language-neutral.
- Hosted completion offers `printf` and C++ `std::printf` with distinct required headers; insertion after `std::` replaces only the name. A not-yet-included function remains discoverable and clearly names its header.
- `sim_` suggestions differ by Target. Quoted paths honor source-directory/root precedence and snapshot Files; angle paths honor the shipped-header matrix.
- Selecting a function never inserts an include. Replacement ranges, qualification, and suppressed contexts follow the stated policy.

### 5. Add hover and parameter hints

**Deliverable:** concise keyword/catalog hovers and accurate parameter highlighting for eligible known calls.

**Touchpoints:** proposed `sourceLanguageHelp/{hover,signatureHelp,documentation}.ts`, shared scanner/catalog, and `register.ts`.

**Dependencies:** milestones 1–4; reuse the same filtering and lookup policy as completion.

**Acceptance and validation:** provider tests establish:

- Hovering `printf`, `std::printf`, and a Target-supported `sim_` name shows the appropriate declaration/header, consumer description, and working link; keywords show their authored language description.
- Hover uses an explicit token range and escapes metadata as safe Markdown; no register/assembly calling convention appears in C/C++ documentation.
- Parameter help opens on `(`, advances on argument commas, follows nested calls and edits, and closes when context ends. `qsort`'s function-pointer declaration stays intact; variadic calls highlight `...` for remaining arguments.
- Members/unknown names/incomplete literals yield no misleading catalog help.

### 6. Verify provider lifecycle and Workbench behavior

**Deliverable:** browser-verified integration and a recorded validation summary, with compiler diagnostic ownership preserved.

**Touchpoints:** `Monaco.ts`, `Editor.svelte`, Workbench/session lifecycle, proposed provider integration tests, and this plan's completion status when implementation is finished.

**Dependencies:** milestones 1–5. Store provider disposables with Monaco's loader; share in-flight registration/catalog loads. Release model caches and session context on disposal, and permit clean re-registration. A failed lazy load returns no affected help and can recover on a later request without an unhandled rejection.

**Acceptance and validation:** complete these integration checks:

- Interact with completion, snippet tab stops, hover links, and parameter hints in a real browser on MIPS, RV32, RV64, and x86; inspect C/C++ headers and an unsupported Target.
- Repeat Project open/close and two-pane switching without duplicate providers or cross-Project results.
- Hold a catalog load pending, edit/dispose/switch the model, then resolve it and verify the obsolete request is discarded. Repeat in a Build view while live headers change.
- Verify editing and provider requests produce no compiler calls; local lazy asset loading is allowed.
- Compile a deliberate error manually and confirm its existing diagnostics still own Problems/markers and Build gating; providers neither clear nor publish compiler diagnostics.
- Check shipped chunks: opening help must not load Core, library-member assembly, full Documentation Chapters, or the x86 translator.
- Run repository type checks and targeted generation/provider/scanner tests, then record browser cases actually executed.

## Completion criteria and remaining decisions

The feature is complete when all six milestone acceptance cases pass and the recorded validation shows the agreed help working before Compile across the supported matrix. Document any intentionally declined lexical contexts; do not label them compiler errors or quietly broaden the semantic scope.

The Implementation notes record the selected module filenames, catalog representation, and measured cache/scan limits. The `.h` neutral policy, identifier-only insertion, header dependency presentation, Target matrix, and manual Compile boundary are specified here; changing them requires revisiting the plan. Screen/device documentation destinations must be verified during catalog work. No performance/bundle budget has been approved by this document.

### Evidence and validation performed for this plan

This plan was checked by reading the current repository sources listed above, small extracts of generated runtime metadata and headers, the installed [Monaco declarations](../../node_modules/monaco-editor/monaco.d.ts), and the documentation anchor construction in [mips.ts](../../src/lib/documentation/mips/mips.ts), [riscv.ts](../../src/lib/documentation/riscv/riscv.ts), and [x86.ts](../../src/lib/documentation/x86/x86.ts). The [assembly language-service plan](./assembly-language-service-plan.md) supplies the established identity/lifecycle approach; current code is the authority for what exists now. Document-local checks confirmed relative file links resolve, code fences balance, and all six milestones are present.

Monaco's official [completion provider example](https://github.com/microsoft/monaco-editor/blob/main/website/src/website/data/playground-samples/extending-language-services/completion-provider-example/sample.js) and [hover provider example](https://github.com/microsoft/monaco-editor/blob/main/website/src/website/data/playground-samples/extending-language-services/hover-provider-example/sample.js) corroborate the native-provider approach; use the installed declarations for exact signatures. At the planning stage, no implementation, generated artifact changes, tests, compilation experiments, or browser validation had been performed. The implementation evidence is recorded below.

An independent maintainer review checked the plan against the approved scope and current sources and found it fit for implementation, with no remaining blockers or material nits. The review covered pre-Compile capabilities, x86 allocation limits, C/header modes, Project and Build isolation, catalog provenance, and conservative lexical behavior.

## Implementation notes — 2026-10-07

### Milestone 1: source context and capabilities

- Added `sourceCompilation/capabilities.ts` as a pure shared capability descriptor. Compile and help share the existing x86 header allow list; compiler behavior is unchanged. Hosted help uses the current Runtime ABI before any Compilation record exists, independently of the assembly runtime Setting.
- `sourceLanguageHelp/context.ts` resolves the canonical model URI through the owning session. File paths determine C/C++ mode, C++ headers use C++ mode, and `.h` uses the specified neutral policy. Standalone editors explicitly supply their File language and receive basic help without fabricated Target facts.
- `ProjectLanguageSession.sourceHelpFor` exposes live context and a frozen descriptor with each retained Build source set and ABI. Model version, session identity, generation and context revision are rechecked after asynchronous catalog loads. Unavailable ABIs suppress the affected runtime entries rather than switching ABI.

### Milestone 2: catalogs and authority

- Chose generated compact JSON, lazy-loaded by Target plus a shared runtime/header catalog. `scripts/sim-header/helpCatalog.mjs` consumes the same structured syscall bindings as `sim.h`. Device/RGB/Screen declarations now live in `scripts/sim-header/helpers.mjs`, shared with the header renderer. Regeneration leaves all four committed `sim.h` files byte-for-byte unchanged.
- `scripts/source-language-help/generate.mjs` reads committed Runtime function/header artifacts and checks them against `runtime/include`. Public macros, types and constants use an explicit validated manifest. C++ aliases come from actual wrapper `using ::name` declarations, preserving global spellings and required-header alternatives without duplicate names. This process neither rebuilds the Runtime nor contacts a compiler. Its pure catalog generator is also exercised directly by the normal test suite, including deterministic regeneration on repeated calls, so runtime drift checks do not depend on subprocess permissions.
- Catalogs contain 44 MIPS, 45 RV32, 45 RV64 and 137 x86 environment entries, and 693 runtime/header entries including qualified aliases and data entries. Runtime entries are filtered by the Target's available headers; x86 gets basic types/macros and simulator calls, without hosted functions or allocating `new`.
- Source documentation contains consumer descriptions rather than register placements or assembly. Provider tests verify every produced href against the actual Documentation entries, including `using-c#screen-and-devices` and `using-c#libraries`.
- Added `npm run source:help:generate` and `npm run source:help:check`. The check covers both generated headers and help catalogs. A stale runtime catalog in an isolated `/tmp` fixture was rejected with exit status 1; the real generated artifacts pass.

### Milestone 3: lexical context

- One tolerant scanner serves identifiers, literal include paths and unfinished calls. Tests cover escaped ordinary/character literals, prefixed/custom-delimiter raw strings, incomplete multiline literals, comments, spliced comment delimiters, line continuations, nested delimiters and compound expressions.
- Parameter labels carry declaration offsets generated with balanced delimiters, keeping `qsort`'s comparator intact. Zero-parameter calls and variadics are explicit; later variadic arguments stay on `...` and excess fixed arguments receive no invented parameter.
- Assistance declines members, unknown namespace qualification, function-pointer calls and recognized declaration/cast contexts. In C++, template brackets and relational/shift tokens inside calls conservatively suppress signature help. This is deliberately lexical, with no claim to resolve typedefs, shadowing, overloads or arbitrary casts.
- Continued include directives are supported; spliced identifiers and include paths are declined instead of replacing text across lines. Computed includes are not resolved.
- Cache scans by model version. Read at most the first **131,072 UTF-16 code units** through Monaco's range API; requests at or beyond that boundary, or replacement ranges crossing it, receive no catalog help. Generic Monaco word suggestions remain available. The measured representative 128 Ki-character scans took approximately 4–14 ms on this host after initial warm-up; this is a local measurement, not a mobile latency guarantee. Model/provider disposal clears caches and removes model listeners.

### Milestones 4–5: native Monaco providers

- `sourceLanguageHelp/register.ts` installs completion, hover and signature help once for `c` and `cpp`. The loader shares pending registration across panes, protects disposal races and permits re-registration or recovery after failed installation. Partial installation rolls back each completed registration.
- Completion inserts identifiers only, and after `std::` replaces only the final name. Function suggestions and hovers show the declaration, header dependency, consumer summary and an untrusted local documentation link. No automatic includes or diagnostic markers are produced.
- Eight small snippets cover main/functions, loops, conditionals, arrays and structures with normal Monaco tab stops. C and C++ keyword sets remain separate; neutral headers get the common set. x86 does not advertise allocating `new`/`delete`.
- Quoted includes use plain Project headers and the source-directory/root search order, including explicitly typed `./` and `../` paths without escaping the Project. Angle includes offer only the shipped Target/language headers. Build suggestions use the retained source set.
- Added a consumer-facing “Help while editing” section to MIPS, RISC-V and x86 guides; these shared Markdown sources also feed the editor Documentation panel.

### Milestone 6: validation and remaining browser checks

- Focused context, scanner, catalog, provider and loader tests pass. They cover distinct Projects with identical paths, C/C++/header modes, retained Build Files and ABI, canceled/edited/disposed requests, failed-asset recovery, duplicate registration, partial rollback, model-listener cleanup, bounded range reads and absence of compiler network calls.
- The broader targeted run passed **213 tests** across 12 files, with **15 skipped** by existing platform gates and explicit exclusion of subprocess checks that reported `spawnSync EPERM` in this sandbox. Existing subprocess tests were not changed. `npm run source:help:check`, scoped ESLint/Prettier and `git diff --check` pass. `npm run check` reports zero errors and the 31 existing warnings.
- All eight expanded snippets passed native GCC `-std=c17 -fsyntax-only` and G++ `-std=c++17 -fno-exceptions -fno-rtti -fsyntax-only`, in suitable top-level/function fixtures. This checks syntax, not simulator execution.
- The production build passes. Its client manifest/source maps show separate dynamic catalog chunks and a provider chunk with only pure shared capability/path/session dependencies. No Core, Runtime member assembly, full Documentation Chapter, compiler client or x86 translator is in that dependency closure. The shared catalog is about **20 KB gzip**, plus approximately **3 KB** per hosted Target or **6 KB** for x86. Provider code is approximately **6–7 KB gzip**, in addition to small shared modules already used by the editor. No dependency, WASM payload or language-server deployment was added.
- **No real-browser acceptance case was completed in this implementation session.** The sandbox rejects Vite's listening socket with `listen EPERM`; installed Chrome also fails during startup. These are recorded limitations, not browser verification evidence.

Manual checks still required:

1. On MIPS, RV32, RV64 and x86, create C and C++ Files before Compile and exercise suggestions, snippet Tab stops, hovers/documentation links and nested/variadic parameter hints. Confirm x86 omits hosted functions, and check `.h` versus `.hpp` plus basic help on an unsupported Target.
2. Open/close Projects repeatedly and switch Files/two panes with identical paths on different Targets; check for duplicate menus or cross-Project help. Verify quoted include suggestions in a retained Build after changing/deleting live headers.
3. In browser developer tools, confirm editing/help requests produce only local asset loads and no Compiler Explorer request. The chunk dependency audit is complete; runtime network observation remains pending.
4. Compile a deliberate error, confirm Problems/squiggles and Build gating still belong to the compiler, then keep editing/requesting help and verify those diagnostics remain intact until the normal Compile flow updates them.

## Current-file declarations extension — 2026-10-07

The user committed the original feature as `3e0446c` (“Add simple completion and hover docs”), then approved current-file variable, parameter and function completion. This extension remains a separate, uncommitted set of changes. The unrelated `:memory:.ses` file is untouched.

- Added `sourceLanguageHelp/symbols.ts`: a conservative declaration index over the existing scanner's tokens, cached by scanned model version and C/C++/header mode. No compiler, dependency or generated catalog changes are required. Only the displayed model's text is indexed, including retained Build text; other Projects, Files and included headers do not supply names.
- Recognizes ordinary global/local declarations, pointers/references, arrays, comma declarations, typedefs/aliases used as types, named or anonymous struct declarations, function prototypes/definitions, zero/variadic parameters and named function-pointer parameters. C++ direct initialization is indexed as a variable when it cannot form an ordinary prototype. Identifier recognition respects the selected C17/C++17 mode, including C names that are C++ keywords. Struct/class fields, namespace/template contents and lambda-local declarations are deliberately skipped.
- Variables become eligible after their declarator; parameters belong to the function body. Block scopes and control-statement scopes restrict declarations, including unbraced `for` bodies, range loops and C++ condition declarations. Matching names use the nearest scope and latest declaration. Generic Monaco word suggestions remain available and do not promise scope correctness.
- Suggestions carry Variable/Function icons, source declaration details and priority over matching catalog/keyword suggestions. They insert only the name. Hovers show the recognized declaration. Explicit `std::` lookup keeps its existing catalog behavior.
- Parameter hints use recognized source prototypes with balanced parameter groups and exact label offsets. Differing overload declarations, function-pointer calls and unspecified C `f()` parameter lists receive no guessed signature. Explicit C `f(void)` and C++ `f()` are zero-parameter declarations. A recognized local variable suppresses a same-name library signature.
- This is not a full declarator parser or preprocessor evaluator. Types from unindexed headers, macro-generated declarations, trailing-return functions, complex templates/declarators, namespace members and type-aware member completion remain deferred. Source help does not certify that a declaration/call is valid.
- Work reuses the existing 131,072-code-unit scan bound and disposal/cancellation checks. Deep recursive scopes/control statements stop after 64 levels to prevent pathological nesting from overflowing the JavaScript stack. On this host, indexing plus lookup over representative 131,000-character source took roughly 8–14 ms; subsequent requests share the index. These are local measurements, not mobile latency guarantees.

Validation performed for this extension:

- **155 tests pass across seven files**, covering the whole help suite, Monaco registration and Project source sessions. This run has no skipped cases or excluded files. New cases cover declaration order/scopes, unfinished code, C/C++ mode differences, prototype identity, local shadowing, hovers/signatures, model edits, separate Projects and retained Build models.
- The documentation-link catalog test now uses the documentation suite's existing 60-second startup allowance because loading a Core exceeded its five-second default during a concurrent production build. No assertion or case was removed.
- Scoped ESLint, Prettier, generation drift checks and `git diff --check` pass. `npm run check` reports zero errors and the 31 existing warnings. The production build passes. Its provider chunk is 25,309 bytes raw / 9,346 bytes gzip, approximately 2.9 KB gzip more than the baseline. The client manifest and source maps show only the existing pure shared dependencies plus the new declaration index; the remaining unmapped chunk is Vite's preload helper. No Core, Runtime member assembly, full Documentation Chapter, compiler client or x86 translator enters the provider dependency closure. Catalog assets are unchanged.
- Real-browser verification remains pending: the sandbox still rejects Vite's listening socket with `listen EPERM`.

Manual checks for the extension, in addition to the original feature's checks above:

1. In a new C or C++ File, use the example below. Type `to` inside `main` and check `total` has a Variable icon and `int total` detail; inside the loop, type `ind` and check the `index` declaration. Check the dedicated declaration suggestion disappears outside its scope; generic Monaco word suggestions can still list the text.
2. Type `add(` and advance past the comma to check the parameter highlight. Hover `add` and `total` for their declarations. Add an inner block with a differently typed `total` and verify its hover/detail takes precedence only inside that block. Repeat with an unfinished function or loop header.
3. Open two Projects with different declarations at the same path; check they stay isolated. Compile, rename a live declaration, and check a retained Build still describes its own source. Confirm the normal compiler-error flow still works.

```c
int add(int left, int right) {
    return left + right;
}

int main(void) {
    int total = 0;
    for (int index = 0; index < 4; ++index) {
        total = add(total, index);
    }
    return total;
}
```
