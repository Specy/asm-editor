# C/C++ language help implementation plan

Scope agreed on **2026-10-07**. **Implementation has not started.** This document plans browser-local Monaco providers; it does not implement them.

The outcome is useful help before the learner presses Compile: C/C++ keywords and snippets, suggestions for the Target's `sim_` functions and supported standard-library names, parameter hints, hover documentation, and include-path suggestions. Compile remains the authority for compiler errors. The glossary definition is [C/C++ language help](../../CONTEXT.md#cc-language-help).

## Agreed scope and capability limits

- Use Monaco completion, hover, and signature-help providers with local metadata and conservative source scanning.
- Explain each known library function with its declaration, required header, concise consumer documentation, and a link to the relevant Documentation entry.
- Provide keyword descriptions and small snippets appropriate to the compiler's C17 or C++17 mode. Verify authored examples against those modes.
- Offer explicit catalog entries for shipped public macros, typedefs, and constants as well as functions: for example `NULL`, `EOF`, `size_t`, fixed-width integer types, and the supported `SIM_SCREEN`/device helpers.
- Keep existing Monaco word suggestions as generic text suggestions; do not describe them as semantic completion.
- Do not add project/local symbol analysis, type inference, object/member completion, overload resolution, rename, references, or semantic diagnostics.
- Do not claim a complete C or C++ standard library. In particular, the shipped C++ wrappers expose selected C names; they do not imply containers, algorithms, or other unsupported namespaces.
- Do not resolve shadowing or establish that a suggested name is declared at this position. Help describes a known library entry; it does not certify a call or program.
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

Recognize ordinary identifiers and simple calls, plus explicitly supported `std::name` spellings in C++ mode. Suppress library lookup after `.`, `->`, or unsupported namespace qualification. A local name can still shadow a library name: describe the known entry without claiming the scanner resolved the program's binding.

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

Implementation must still choose exact module filenames, catalog representation, and measured cache/scan limits. The `.h` neutral policy, identifier-only insertion, header dependency presentation, Target matrix, and manual Compile boundary are specified here; changing them requires revisiting the plan. Screen/device documentation destinations must be verified during catalog work. No performance/bundle budget has been approved by this document.

### Evidence and validation performed for this plan

This plan was checked by reading the current repository sources listed above, small extracts of generated runtime metadata and headers, the installed [Monaco declarations](../../node_modules/monaco-editor/monaco.d.ts), and the documentation anchor construction in [mips.ts](../../src/lib/documentation/mips/mips.ts), [riscv.ts](../../src/lib/documentation/riscv/riscv.ts), and [x86.ts](../../src/lib/documentation/x86/x86.ts). The [assembly language-service plan](./assembly-language-service-plan.md) supplies the established identity/lifecycle approach; current code is the authority for what exists now. Document-local checks confirmed relative file links resolve, code fences balance, and all six milestones are present.

Monaco's official [completion provider example](https://github.com/microsoft/monaco-editor/blob/main/website/src/website/data/playground-samples/extending-language-services/completion-provider-example/sample.js) and [hover provider example](https://github.com/microsoft/monaco-editor/blob/main/website/src/website/data/playground-samples/extending-language-services/hover-provider-example/sample.js) corroborate the native-provider approach; use the installed declarations for exact signatures. No implementation, generated artifact changes, tests, compilation experiments, or browser validation were performed for this plan.

An independent maintainer review checked the plan against the approved scope and current sources and found it fit for implementation, with no remaining blockers or material nits. The review covered pre-Compile capabilities, x86 allocation limits, C/header modes, Project and Build isolation, catalog provenance, and conservative lexical behavior.
