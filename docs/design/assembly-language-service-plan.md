# Assembly language service: implementation plan

Written on 2026-09-09 and updated on 2026-09-10. This plan covers the Monaco language support for
M68K, MIPS, RISC-V, RISC-V-64, x86 and Z80. The first implementation slice described below is now
present in the working tree; the remaining phases are the roadmap for later changes.

The goal is LSP-like editor behaviour in the browser: accurate live diagnostics, context-aware
completion, signature help, symbol navigation, rename, semantic highlighting and related source
features. The first implementation remains native Monaco providers backed by Web Workers. A real
Language Server Protocol transport is deliberately deferred because JSON-RPC would add a boundary
without improving the analysis available to this application.

The M68K additions are based on the installed `@specy/s68k` 2.1.1 API, the current M68K provider
and Emulator integration, and the matching local S68K 2.1.1 source. The detailed findings and
primary-source references are recorded in
[m68k-language-service-research.md](./m68k-language-service-research.md).

## Implementation status

Implemented so far:

- Stable live and Build-snapshot Monaco model URIs, Project-aware model navigation and retained
  per-File view state.
- Correct debug source selection across `A -> B -> A`, zero-based execution-line conversion and
  editable Build breakpoints while live source remains read-only during execution.
- A Project-scoped M68K Web Worker session with incremental File synchronization, stale-result
  rejection, exact diagnostics and included/unreachable File status.
- M68K Project completions, signature help, hover, document symbols, definitions and include links.
- Conservative Project-wide symbol completion, document symbols and definitions for MIPS,
  RISC-V, RISC-V-64, x86 and Z80, plus fixes to the existing completion and grammar providers.
- Context-sensitive instruction/operand completion for all Targets, instruction snippets with tab
  stops, and signature help backed by each available instruction catalogue. Completion is suppressed
  in comments and the shared line parser continues through incomplete operands, strings and address
  expressions.
- Project symbol hover, relative include/incbin path completion and clickable document links.
  Document outlines now distinguish labels, constants, macros, sections and common data declarations;
  Z80 merges the Core's authoritative symbols with tolerant source-structure symbols so an unrelated
  error or unreachable File does not empty the outline.
- Dedicated revisioned diagnostic Workers for MIPS, RISC-V, RISC-V-64, x86 and Z80. MIPS and
  RISC-V preserve Core diagnostics, macro expansion locations, Entry/include reachability and
  `@screen` warnings; their Target modes run in isolated Workers. Z80 uses its Project assembler,
  while x86 recursively compiles literal NASM `%include` Files, maps Core diagnostics and execution
  lines back to the originating File, and stages exact Project bytes for literal `incbin` directives.
- Authoritative Z80 cross-File definitions, references and document highlights from Core symbol
  occurrences, plus guarded Project rename when every occurrence maps safely to one physical source
  edit. Ambiguous, generated, changing-value and reserved-name cases are rejected.
- Project live diagnostics now have one Worker-owned path instead of also assembling through the
  execution Emulator; Playground and other single-buffer integrations retain automatic checking.
- Related diagnostic Locations are visible as nested, clickable entries in the output panel.
- Folding covers explicit regions, sections, label-owned routines, macros and conditional-assembly
  blocks. Conservative document and range formatting is registered for every Target, preserves the
  document's LF/CRLF convention and has assembled-output equivalence tests against all five Cores.
- Provider lifecycle cleanup, source/build isolation, and contract tests for the shared conversion,
  URI, selection, diagnostic and language-provider behavior.

Still planned:

- Semantic tokens, optional inlay hints/code lenses, diagnostic-backed code actions and the
  performance/browser-rollout work from the later phases.
- Replacing the remaining tolerant MIPS/RISC-V/x86 symbol facts with authoritative Core symbol
  identities if those packages expose them. References and rename are intentionally deferred by the
  current product decision.
- A native x86 virtual-Project API. The app handles literal `%include`/`incbin` paths today, including
  nesting, missing Files and cycles, but macro-computed include names still require upstream Core
  support to retain exact File-aware diagnostics and debug locations.

## Scope

In scope:

- M68K/EASy68K-flavoured 68000, MIPS, RISC-V, RISC-V-64, x86/NASM and Z80 assembly Files.
- Live Project Files, including definitions and references across included Files.
- Read-only language features on a Build snapshot when it is displayed.
- Monaco diagnostics, completion, signature help, hover, document symbols, definitions,
  references, document highlights, rename, document links, folding, semantic tokens, code actions,
  formatting, inlay hints and code lenses where the underlying Target can support them accurately.
- A reusable, Project-aware analysis layer separated from execution.
- Provider contract tests, architecture fixtures, performance measurements and browser verification.

Out of scope:

- C language support.
- A network process, JSON-RPC, `monaco-languageclient`, or compatibility with external editors.
- Changing assembler syntax or silently accepting source the selected Core rejects.
- x86 dialect switching. The Emulator uses NASM, so the language service will describe NASM. MASM
  and FASM support require separate Target/dialect decisions later.
- Editing binary Files.
- Project-wide symbol UI beyond Monaco's available provider surface. The symbol index must make a
  later Project-symbol picker possible, but this plan does not add that picker.

## Existing foundations and constraints

- A Project already owns Files and an Entry path. Compilation consumes the Entry file and the Files
  reached from it; the displayed File is independent of Entry.
- A Debug session executes an immutable Build snapshot. Live Files can diverge from that snapshot,
  so a source location must always identify both its File and whether it belongs to live source or a
  particular Build.
- `GenericEmulator` currently starts a debounced `_checkCode` assembly after source changes and
  stores the result in `compilerDiagnostics`.
- MIPS and RISC-V Cores keep important state in module globals. A throwaway check can corrupt a
  retained or running Core unless it is serialized with execution. RISC-V bitness is also a module
  global.
- x86 checking loads an additional WASM Core and is asynchronous. Its current public editor API is
  single-file and exposes diagnostics but no tolerant syntax or symbol model.
- M68K now uses `@specy/s68k` 2.1.1. `S68k.parseLine` provides tolerant, exact per-line spans for
  labels, operations, operands and comments, while `S68k.assemble` provides Project-aware exact
  diagnostics, related include Locations and an error-free Program's symbol definitions and values.
- An S68K `Program` is a WASM allocation that must be disposed even when it is created only for live
  analysis. An error result frees itself, but a successful or warning-only result returns a Program;
  ignoring it leaks WASM memory.
- S68K is a fixed EASy68K-flavoured M68000 dialect with per-call analysis state and no mutable
  architecture/bitness global. Its Worker needs ordinary request ordering, but not the MARS family's
  mode-pinning workaround.
- S68K symbol semantics are not a flat text index. Local labels are scoped under the preceding
  global label, `set` variables can resolve to different definitions by assembled-sequence position,
  and the same source File can be included more than once. A source Location can therefore have
  several expansion instances, values or addresses.
- S68K ranges are zero-based and half-open but count Unicode scalar values; Monaco columns count
  UTF-16 code units. They coincide for valid Latin-1 M68K text but not for invalid astral characters,
  so the adapter still needs a line-text-aware conversion.
- The current M68K provider already has v2-aware grammar, completion, hover and conservative
  formatting. Its app-owned instruction/directive documentation duplicates facts held in S68K's
  private instruction table, and its `incbin` preparation deliberately aliases Files so the Core sees
  the app's exact UTF-8 File bytes.
- Z80 already exposes a tokenizer, instruction parse trie, assembled lines, symbols, definitions and
  references. It is the strongest starting point for the first full semantic-navigation slice.
- Monaco models currently have generated in-memory URIs. Models exist only after a File has been
  displayed, and the Editor component owns their lifetime.
- Current Explorer selection always assigns `sourceView = 'live'`. During a Debug session this moves
  away from the Build model implicitly; `Project.svelte` then suppresses the selected-line and
  breakpoint inputs because both are gated on snapshot/lock state. This explains the observed
  A -> B -> A and “cannot edit breakpoints after switching” regressions; it is editor state coupling,
  not an S68K execution limitation.
- `Editor.svelte` already recreates decorations when its active model changes, but its reveal effect
  excludes zero-based line zero and passes a zero-based line directly to Monaco. Current-location
  projection and viewport reveal need one shared conversion rather than separate off-by-one rules.
- Project limits allow up to 4,096 Files and 16 MiB. The service must not create thousands of Monaco
  models or resend the complete Project on every keystroke.
- All line and column conventions currently differ by Core. Monaco is one-based and UTF-16,
  S68K/Z80 lines are zero-based, S68K columns are character-based, and MIPS/RISC-V source locations
  are one-based.

## Proposed implementation shape

The implementation should use an LSP-shaped boundary even though it does not initially speak LSP:

```text
Monaco provider adapters and diagnostic publisher
                       |
                       v
        Project Language Session (main thread)
          URI, File versions, model lifecycle
                       |
             typed request protocol
                       |
                       v
       Target-family Language Worker (browser)
       tolerant syntax + cached Project analysis
                       |
                       v
             architecture/Core adapter
```

### Source identity

Every assembly Monaco model receives a stable URI made with `monaco.Uri.from`, conceptually:

```text
asm-editor://<session-id>/live/<project-path>
asm-editor://<session-id>/build-<generation>/<project-path>
```

The implementation must not parse these URIs with string slicing. A URI helper owns construction,
validation and decoding. The URI's Project path uses the same case-sensitive canonical path as the
Project File map. Session IDs are opaque and must not depend on a mutable Project name.

Live model identity survives switching Files. A File rename changes its URI and creates a deliberate
Monaco model migration while preserving text, selection and Undo history where Monaco permits it.
Build models are read-only and are discarded with their Build generation.

### Project Language Session

One `ProjectLanguageSession` owns language intelligence for one live Project or one immutable Build
snapshot. It knows:

- session ID, Target, Entry path and source kind (`live` or a Build generation);
- all Project Files without requiring a Monaco model for each File;
- a monotonically increasing Project revision and per-File text versions;
- lazily materialized Monaco models and their disposables;
- the latest accepted diagnostics and analysis revision;
- the Target-family Worker client.

The Project and Playground integrations send explicit File operations to the session: open the
source set, change text, create, delete, rename, change Entry and dispose. They do not repeatedly send
an unchanged complete source set for a one-character edit.

Monaco models are materialized only for displayed Files and cross-File navigation/peek targets.
Diagnostics for Files without a model remain in the session and can drive File-sidebar badges. When
a model is materialized, its current diagnostics are published immediately.

Register one `monaco.editor.registerEditorOpener` handler. A definition/reference target in another
File asks the owning session to materialize that model, selects the corresponding displayed File,
waits for the editor to attach the model and then applies the requested selection. Navigation never
changes Entry.

### Cross-File model and Debug-view invariants

Entry chooses where assembly starts; it must never decide whether another text File receives a
language ID or language features. Every live and Build text model receives the Target's language ID
when materialized, whether the File is Entry, reachable by `include`, temporarily unreachable or not
yet opened. Provider routing, cached analysis, markers and decorations key off the model's stable URI,
not the currently displayed path or Entry.

Represent the displayed source as one value `{ sourceKind, path, buildGeneration? }`. Explorer
selection changes `path` without silently changing `sourceKind`. In particular, selecting File B
while viewing a Build snapshot must open B from the same Build; it must not switch to live B. During
an active Debug session, source navigation defaults to that immutable Build snapshot. Returning to
live source is a separate explicit transition, and text editing stays locked until the session ends.

The current-instruction decoration is a Build `SourceLocation`, not a line number attached to
whichever model happens to be active. Reapply it whenever its `{ buildGeneration, path }` model is
selected, clear it from other models, and convert its zero-based line to Monaco exactly once. This
must work for line zero and after A -> B -> A model switches. Cursor/reveal behaviour must not be the
only owner of the selected-line decoration.

Breakpoints are independently mutable `SourceBreakpoint { file, line }` values. Read-only source and
FileSystem locking disable text/File mutations, not glyph-margin breakpoint toggles. Every displayed
Build File shows its own breakpoint decorations after switching models. A breakpoint changed while a
Run is active becomes visible immediately and applies at the next safe execution-slice boundary; it
does not mutate a synchronous Core call already in flight. A breakpoint is never placed against live
text while execution is interpreting a divergent Build snapshot.

### Worker split and lifecycle

Use lazily created, reference-counted Target-family Workers rather than one Worker per editor:

- one MARS-family Worker for MIPS, RISC-V and RISC-V-64, serializing Core operations and pinning the
  requested Target before each analysis;
- one M68K Worker, owning the S68K WASM module and disposing every analysis-only Program after its
  plain analysis data has been copied;
- one Z80 Worker;
- one x86 Worker because it owns a relatively heavy WASM diagnostic Core.

The Worker realm isolates MIPS/RISC-V analysis globals from the execution Core on the main thread.
The Worker manager terminates an idle Worker after its final session is disposed. SSR code must not
construct Workers.

Requests and responses carry a request ID, session ID and Project revision. Provider cancellation
tokens cancel or ignore request results. Synchronous Core assembly cannot be interrupted once it has
started, so diagnostic work is debounced and coalesced before starting, and every stale result is
dropped. A queue must retain only the latest pending diagnostic revision per session.

### Analysis layers

Each architecture adapter produces two layers:

1. A tolerant source model that is available even when the program is incomplete. It contains
   tokens, line roles, instruction/directive context, symbols and occurrences that can be recognized
   safely.
2. An authoritative Core result when assembly/checking completes. It contributes diagnostics,
   resolved symbols, generated statements, addresses and expansion information.

The authoritative result may enrich or invalidate tolerant facts but must not erase useful syntax
information merely because one line does not assemble. Features that cannot be proven safe return no
result rather than guessing. In particular, rename is available only for an occurrence resolved to
one symbol identity.

Each adapter declares a typed capability set, including whether a feature is tolerant,
authoritative, Build-only or unavailable. Register a Monaco provider only when its routing layer can
return valid results for that Target. This is especially important for M68K 2.1.1: exact diagnostics
and definition facts are available, while complete references, safe rename and instruction/source
listing are not.

### Common source model

Add plain, structured-cloneable types independent of Monaco, Svelte and every Core:

```ts
type SourcePosition = { line: number; column: number } // zero-based UTF-16 code units
type SourceRange = { start: SourcePosition; end: SourcePosition }
type SourceLocation = { path: string; range: SourceRange }

type ExpansionContext = {
    id: string
    includeChain: SourceLocation[]
}

type LanguageDiagnostic = {
    location: SourceLocation
    severity: 'error' | 'warning' | 'suggestion'
    message: string
    hint?: string
    source: string
    code?: string
    related?: { location: SourceLocation; message: string }[]
}

type SymbolKind = 'label' | 'constant' | 'variable' | 'register-list' | 'macro' | 'section' | 'data'
type SymbolOccurrence = {
    symbolId?: string
    name: string
    kind: SymbolKind
    role: 'definition' | 'reference'
    location: SourceLocation
    expansion?: ExpansionContext
}
```

Ranges are half-open. Architecture adapters normalize Core coordinates to zero-based UTF-16 once;
only the Monaco adapter converts them to one-based positions. Core-coordinate conversion functions
receive the containing line text; adding one to a Core column is not sufficient for every Target.
Diagnostics must never use column zero or an arbitrary end column at the Monaco boundary.

The index must keep source identity separate from expansion identity. Definition, references and
rename operate on deduplicated source Locations. Build addresses, variable values and include chains
may belong to one or more expansion instances of that same source Location; if those instances
disagree, hover and inlay hints show the alternatives or omit the value rather than choosing one.

## Proposed file layout

Names can change during implementation, but responsibilities should remain separated:

```text
src/lib/languages/service/
  protocol.ts                 worker request/response types
  sourceModel.ts              neutral diagnostics, ranges, symbols and analysis types
  uri.ts                      Monaco URI construction and parsing
  ProjectLanguageSession.ts   main-thread Project and model lifecycle
  LanguageWorkerManager.ts    lazy, reference-counted Worker clients
  providerRegistry.ts         shared Monaco provider registration
  monacoConversions.ts        the only zero/one-based conversion boundary
  workers/
    mars.worker.ts
    m68k.worker.ts
    z80.worker.ts
    x86.worker.ts
    workerServer.ts
  adapters/
    m68kAdapter.ts
    mipsRiscvAdapter.ts
    z80Adapter.ts
    x86NasmAdapter.ts
```

Static architecture data should live in plain modules, not Emulator `.svelte.ts` modules. The
language service must not import an Emulator solely to discover register names.

Move M68K's Project-to-S68K File preparation into a shared, pure module used by both the Emulator
Build path and `m68kAdapter`. In particular, its private exact-byte `incbin` aliases must be identical
for execution and live checking and must never appear in user-facing diagnostics, links or symbols.

Likewise, extract Project source-view transitions and Debug-decoration projection into small plain
modules rather than adding more coupled `$effect` conditions to `Project.svelte` and `Editor.svelte`.
The Svelte components should render a tested `{ sourceKind, path, buildGeneration }` selection and
tested `(selection, currentLocation, breakpoints) -> decorations` result.

## Phase 0: pin current behaviour and repair correctness

Before introducing the service boundary:

- Add a provider test harness that creates real Monaco text models where practical and small typed
  model fakes for pure line-analysis tests.
- Add a Project/Editor integration harness that materializes at least two File models, switches
  A -> B -> A, and inspects each model's language ID, markers and decorations. Cover both live and
  active-Build source kinds; provider unit tests alone cannot catch model-selection regressions.
- Add one contract fixture set shared by every Target: blank lines, comments, strings, incomplete
  tokens, label-only lines, label plus mnemonic, inline comments, uppercase mnemonic, first and later
  operands, and an unknown mnemonic.
- Fix MIPS/RISC-V label-only completion crashes and the operand offset after `label:mnemonic`.
- Fix RISC-V register insertion so `t0`, `zero` and `x10` are inserted intact.
- Remove RISC-V Core-global mutations from completion and hover. Filter RV32/RV64 documentation and
  variants from immutable metadata passed to the provider.
- Make MIPS/RISC-V mnemonic and directive lookup match the Core's case behaviour while preserving
  the Core's symbol case rules.
- Fix the RISC-V register Monarch rule so one register cannot consume the prefix of another.
- Register `X86LanguageConfiguration`; reorder the x86 Monarch rules so labels and NASM
  preprocessor directives are reachable; add an x86 `wordPattern` that treats `%directive` and
  assembler symbol spellings as complete words.
- Preserve the current M68K v2 vocabulary, case-preserving operation completion, addressing-mode
  templates, `S68k.parseLine`-based hover and string/comment-safe formatter with regression tests.
  Treat those changes as the migration baseline, not code to replace wholesale.
- Pin the M68K adapter contract to the installed S68K 2.1.1 declarations and assert its supported
  API/version at the adapter boundary. Match diagnostic `code`, never message capitalization or
  punctuation; 2.1.1 deliberately revised diagnostic prose without adding the missing analysis APIs.
- Make M68K hover return `null` when the cursor is not on a documented operation and use the
  operation's exact `nameSpan`, not a range extending to column 1,000. Remove blanket `preselect`
  from resolved M68K completions and verify replacement ranges with real Monaco word rules.
- Add M68K provider cases for colon and bare labels, local `.labels`, `*` as a comment-line marker
  versus current-address/multiplication, all size suffixes, nested address expressions, special
  registers, `include`/`incbin` text fields and refused operations.
- Reproduce the current M68K multi-File regression with Entry A, included B and unreachable C:
  completion/hover/highlighting must work in all three, while authoritative Core errors from B attach
  to B and C is identified as outside the current assembly graph rather than looking unregistered.
- Reproduce the current Debug regressions: after selecting the current instruction in A, switch
  A -> B -> A and require the selected line to return, including when it is line zero; add and remove
  a breakpoint in B while the Run is active and require the glyph and next-slice behaviour to update.
- Remove invalid multi-character completion triggers such as `deleteLeft` and `tab`, remove the
  RISC-V debug `console.log`, return `null` for empty hover results, and use token-sized hover ranges.
- Rename new APIs to `Completion`, not `Completition`; leave temporary deprecated aliases only if a
  caller outside the repository requires them.
- Implement `Monaco.dispose`, including provider/configuration/tokenizer registrations, and make a
  failed language registration retryable.

Acceptance:

- No completion provider throws for any contract fixture.
- Completion insertion preserves the typed prefix exactly once.
- RV32 never displays or inserts an RV64-only instruction form; RV64 does.
- Uppercase MIPS/RISC-V source receives the same instruction assistance as lowercase source.
- Labels and `%define` tokenize correctly under x86.
- The current M68K v2 provider tests remain green, and the real-model tests prove its hover and
  completion ranges are exact.
- Every non-entry M68K text model reports language ID `m68k` and retains completion, hover, markers,
  selected-line state and per-File breakpoints across model switches as applicable.
- Repeated register/dispose cycles do not multiply provider results.

## Phase 1: sessions, URIs and model navigation

- Introduce the neutral source model, URI helper, session manager and lazy model registry.
- Pass a stable session identity, all Files, Entry and source kind into `Editor` instead of leaving
  model identity private to the component.
- Create live and Build model URIs and migrate existing per-File Undo histories carefully.
- Implement change/create/delete/rename/Entry messages and session disposal.
- Register the editor opener and support same-File and cross-File location navigation without
  changing Entry.
- Replace the current `selectLiveFile`-style implicit view change with source-kind-preserving File
  selection. Materialize a Build model when Explorer navigation starts from a Build model, especially
  while a Debug session owns the FileSystem.
- Split `Editor` interaction policy into text editability and breakpoint-gutter editability. A
  running/paused Build model is read-only text but keeps glyph-margin hit testing and per-File
  breakpoint decoration enabled.
- Make a File-language change or extension-changing rename call `setModelLanguage` on a retained
  model.
- Keep C models on their current provider. M68K models enter the same session/URI path as the other
  assembly languages while retaining the v2 provider behaviour pinned in phase 0.

Acceptance:

- Every visible assembly model can be mapped unambiguously to session, source kind and File path.
- Switching Files preserves the correct model and Undo stack.
- Renaming a File cannot leave a stale model addressable under its previous URI.
- A synthetic definition location opens another File and selects its exact range.
- Opening Entry A, included B or unreachable C produces a model with the same assembly provider
  surface; switching Files never resets the view from Build to live implicitly.
- With an active Build, A -> B -> A restores A's current-instruction decoration, cursor/scroll state,
  markers and breakpoint glyphs without rebuilding or changing Entry.
- Disposing a Project removes its session, models, markers and navigation handlers.

## Phase 2: Worker analysis and diagnostics

- Implement the typed Worker client/server, latest-revision queue and Worker lifecycle.
- Configure `vite-plugin-wasm` for Worker builds as well as the main Vite plugin pipeline before
  importing S68K in `m68k.worker.ts`. Keep every Worker construction behind the browser boundary.
- Send the initial Files once and incremental File operations afterward.
- Move live checking out of `GenericEmulator.semanticCheck` into architecture analysis adapters.
  Keep explicit Build compilation in the Emulator; Build diagnostics describe the Build snapshot,
  while session diagnostics describe live Files.
- Migrate Project, Playground, embed and exam surfaces to choose diagnostics by source kind. Live
  Build-button gating uses the latest live session diagnostics; a Build remains authoritative if the
  user invokes it while checking is pending.
- Publish exact Monaco markers to every materialized model and retain diagnostics for unopened
  Files. Add per-File error/warning counts to the File sidebar.
- Publish markers by analyzed URI/File revision, not by filtering a single global array only when a
  File happens to be displayed. A newly selected secondary model receives its cached markers at once;
  switching away cannot clear another model's marker state.
- Extend the diagnostic panel boundary to consume the neutral diagnostic shape (or a lossless view
  of it) instead of first collapsing it into the Emulator's start-column-only `Diagnostic`. Render
  related Locations as navigable entries through the same editor opener.
- Include message, Hint, severity, source, diagnostic code and related include/macro locations when
  the Core supplies them.
- Convert Core ranges to Monaco UTF-16 columns against the exact File revision that was analyzed.
  For M68K this conversion is required even for invalid non-Latin-1 text, where an astral character
  occupies one S68K character column and two Monaco code units.
- Preserve the public explicit `checkCode` use case without tying it to execution state. It may
  delegate to the same adapter or remain a one-shot Core call for non-editor consumers.
- Remove duplicate debounced live assemblies and the MIPS/RISC-V execution/check serialization that
  is no longer needed once checks run in another realm. Retain serialization required by execution
  itself.

Target adapters:

- M68K: call `S68k.assemble` with the complete `{ files, entry }` Project in its Worker. Preserve
  every diagnostic's exact range, stable code, severity, Hint and related include Locations. Extract
  plain `ProgramInfo`/symbols when a Program exists, then dispose the Program in a `finally` block;
  never retain a runnable WASM handle in an `AnalysisSnapshot`.
- M68K: use the same extracted exact-byte File preparation as the Build path. Authoritative
  diagnostics cover the Entry and Files reachable through `include`/`incbin`; tolerant per-File
  syntax may cover unopened or unreachable text Files but must not present them as assembled.
  `parseLine` itself reports no diagnostics, so until an upstream tolerant Project/File analysis API
  exists, mark an unreachable File as “not part of the current Build” rather than presenting an empty
  diagnostic set as proof that it assembles.
- M68K: record the adapter capability honestly: successful assembly supplies symbol definitions,
  kinds and values, but S68K 2.1.1 supplies neither reference occurrences nor a partial symbol table
  after an error. The tolerant snapshot remains available when authoritative symbols disappear.
- Z80: assemble in the Worker and derive diagnostics plus the authoritative symbol index from
  `AssemblyResult`.
- MIPS/RISC-V: create a throwaway Core from the complete text source set, pin bitness immediately
  before creation, assemble, and retain tokenized lines and parsed/compiled statements for the
  accepted revision.
- x86: create one diagnostic Core inside the x86 Worker and serialize its checks. Initially retain
  Entry-only diagnostics because the Core is Entry-only; report this limitation in the adapter
  capability set rather than silently ignoring secondary Files.

Acceptance:

- No live assembly or x86 WASM check blocks the browser main thread.
- Development and production-preview browser tests load S68K WASM in the Worker in Chromium and
  Firefox, while an SSR import creates no Worker.
- Editing while a program runs cannot mutate the execution Core or its Target bitness.
- Diagnostics from revision N never replace diagnostics for revision N+1.
- Rapid typing produces at most one active and one latest pending check per session.
- Diagnostic ranges stay within their File and line; Hints appear in both markers and the diagnostic
  panel.
- M68K diagnostic codes and related include Locations survive both the neutral snapshot and Monaco
  marker conversion; repeated successful/warning-only checks do not grow WASM memory.
- Opening an included secondary M68K File immediately displays its cached Core diagnostics. Opening
  an unreachable one retains language features and visibly distinguishes “not analyzed by the
  Build” from “analyzed with no diagnostics.”
- Existing Build diagnostics and Build-snapshot source locations retain their current behaviour.

## Phase 3: completion, signature help and hover

Register providers declaratively for each language ID and route every request through the model's
session URI.

Common behaviour:

- Do not offer semantic completion in comments or strings.
- Distinguish mnemonic/directive, operand, expression and include-path positions.
- Filter and rank by the text being replaced, context and Target capabilities. `sortText` must be
  fixed-width and deterministic; at most one appropriate item is preselected.
- Use insert/replace ranges that handle prefixed words (`$t0`, `.data`, `%define`) without duplicating
  or deleting punctuation.
- Offer snippets for complete instruction forms, with tab stops for operands, while retaining plain
  mnemonic insertion as an option.
- Return signature help for every instruction variant the Target adapter can represent accurately,
  select the active operand after commas, and show immediate widths or operand restrictions. Declare
  partial signature metadata as a capability rather than merging incompatible forms.
- Resolve expensive completion documentation only when Monaco asks for it.
- Hover the token range only. Show instruction forms and descriptions, register aliases/width,
  symbol kind/value/address and definition location when known, and numeric values in decimal, hex
  and binary.

Target behaviour:

- M68K: use `S68k.parseLine` for the active line's field and operand spans. Complete exact `d0`-`d7`,
  `a0`-`a7`/`sp`, `pc`, `sr`, `ccr`, symbol names, numeric forms and `include`/`incbin` Project paths
  only in contexts that accept them. Keep refused operations visible as invalid syntax, not as
  completion offers.
- M68K: retain the current app documentation as the temporary source for operation descriptions,
  sizes, forms and flags, but add a full drift fixture against the Core's accepted/refused
  vocabulary. Generate signature help and operand snippets from one normalized metadata adapter so
  completion, hover and signatures cannot disagree with each other. Where the current aggregated
  record cannot distinguish overloads, offer only conservative help until the Core exports its Form
  table.
- M68K: treat the parsed addressing mode as a syntactic fact only. `parseLine` cannot validate the
  mode against an instruction or resolve a symbol. Enrich from the latest matching Project snapshot,
  and label unresolved/stale facts instead of silently presenting them as authoritative.
- M68K: show an error-free Program's label/constant/register-list value and definition in hover.
  Do not show one final `set` value as though it applied to every use, and do not choose one address
  when repeated includes give the same source line several expansion values.
- Z80: retain the assembler trie as the completion authority; cache symbol collection by File
  version; make condition/register ambiguity contextual.
- MIPS/RISC-V: replace string splitting with Core-token-aware tolerant line parsing. Share one
  parameterized implementation, with immutable Target metadata for MIPS, RV32 and RV64.
- RISC-V: complete ABI and `xN` aliases, floating registers, CSR names and rounding modes in only the
  operand positions that accept them.
- MIPS: keep `$` in register replacement ranges and exclude execution-only registers from ordinary
  instruction operands unless the assembler grammar accepts them.
- x86: use a tolerant NASM lexer and a small statement parser to distinguish prefixes, mnemonic,
  operands, bracketed effective addresses, size specifiers and preprocessor arguments. Replace the
  flat every-word list with context-specific sets. The hand-maintained instruction list is temporary
  until generated metadata is available.

Acceptance:

- Contract tests assert the labels, registers, directives and instruction variants offered at each
  cursor marker.
- Selecting every representative completion produces the expected source text.
- Instruction snippets generated from representative metadata assemble under their Target Core.
- M68K signature/completion fixtures cover every Core form and size represented by the app metadata;
  the suite fails when its accepted/refused operation vocabulary drifts from S68K.
- Signature help tracks the operand across commas and nested parentheses/brackets.
- Completion and hover honour provider cancellation and never use stale analysis silently.

## Phase 4: symbols, links and navigation

- Build one Project symbol table with stable symbol IDs, definitions and occurrences. Tolerant facts
  support incomplete source; authoritative Core facts resolve scope and value after successful
  analysis.
- Implement document symbols for labels, constants, macros, sections and data declarations, nested
  where the assembler's scopes make that meaningful.
- Implement definition/declaration, references and document highlights from resolved occurrences.
- Implement document links for include/incbin paths. Resolve relative paths using the containing File
  and the selected Core's rules; missing targets remain diagnostics, not clickable guesses.
- Implement rename preparation and Project edits. Reject architecture keywords, register names,
  invalid identifiers, collisions and unresolved/ambiguous occurrences before returning an edit.
- Preserve original spelling where symbol identity is case-insensitive. Do not change text in
  comments or strings merely because it resembles the symbol.

Target notes:

- M68K can seed definitions, kinds and values from `Program.getSymbols()` after a successful build.
  Its names are case-sensitive and local `.loop` definitions are published as scoped names such as
  `start:loop`; preserve the written spelling and model that scope explicitly.
- M68K 2.1.1 does not export references or use-site resolution. A tolerant source scan may supply
  document symbols and unresolved occurrences, but references and rename are enabled only for
  symbol kinds/uses the adapter can prove unambiguous. Local-label rename, `set` variables,
  register-list uses and include-expansion-sensitive references remain disabled until an upstream
  analysis API or equivalent exact resolver exists.
- M68K `include` is textual: one namespace and local-label/variable scope can cross a File boundary,
  and a File may be included several times. Keep one source edit per unique Location while retaining
  separate expansion identities for semantic values. Direct include/incbin links use S68K's
  beside-the-containing-File-then-Project-root resolution and never expose internal byte aliases.
- Z80 should use `SymbolInfo.definitions`, `references`, scopes and appearances rather than regexes
  after a successful assembly. Local labels and macro expansions require explicit fixtures.
- MIPS/RISC-V initially combine tolerant definitions with Core token/statement locations. Accurate
  semantic references and macro/local-label rename should remain disabled until the Core exposes
  symbol identities or the adapter can prove them.
- x86 must model NASM local labels, `equ`, macro/preprocessor names and case rules. Rename is enabled
  incrementally per supported symbol kind rather than over a regex-only project scan.

Acceptance:

- Go to definition works within a File and across an include boundary.
- References distinguish same-spelled scoped symbols.
- Rename edits exactly the resolved definitions/references across Project Files and nothing else.
- A repeated M68K include does not produce duplicate rename edits or attach one expansion's address
  to another; a `set` use is never linked to the wrong redefinition.
- Document symbols remain useful when an unrelated line contains a syntax error.
- Include navigation never escapes the Project root.

## Phase 5: semantic presentation and source structure

- Add semantic tokens for symbol definitions/references, labels by code/data kind, macros, registers,
  conditions, directives, instruction classes and undocumented/deprecated forms. Monarch remains the
  lexical fallback.
- Add folding ranges for sections, label-owned routines, macros, conditional assembly and explicit
  regions. Do not fold one label's body across a containing section/macro boundary.
- Add selection ranges that grow from token to operand to statement where the tolerant parser knows
  those boundaries.
- Add optional inlay hints for resolved symbol values/addresses and register aliases. Keep them off
  in comments, generated text and unresolved code, and cap density so assembly does not become
  unreadable.
- Add Build-snapshot code lenses or hints for address, opcode bytes and pseudo/macro expansion where
  the Core supplies a source map. Live source does not show stale Build addresses.

M68K presentation starts from `parseLine` spans for labels, operations, operands and comments, then
adds resolved symbol roles from the snapshot. Do not infer a linear instruction list by walking
addresses: S68K's JavaScript `Program` exposes an instruction count but not the instruction/source
listing, and `org`, sections and repeated includes make address guesses unsafe. M68K Build lenses
wait for an exported instruction/source listing with include-expansion identity.

Acceptance:

- Semantic token ranges do not overlap illegally and update after symbol-role changes.
- Lexical highlighting still appears before Worker analysis completes.
- Build-derived information is labelled as such and disappears when its Build snapshot is disposed.
- Repeated M68K includes either display expansion-specific values explicitly or display no value;
  no source line is assigned a guessed address.
- Hints can be disabled without disabling hover or navigation.

## Phase 6: code actions and formatting

Code actions begin with deterministic, diagnostic-backed changes:

- replace an unknown mnemonic/register with a uniquely close known spelling;
- insert or remove a required register/directive prefix;
- replace an out-of-range immediate only when the Core supplies a safe canonical representation;
- open/create a missing included File through the existing Project File operations;
- suppress no diagnostics unless the assembler itself supports a suppression syntax.

S68K's stable diagnostic codes are suitable action selectors, but its Hints are prose and must not
be parsed into edits. Add an M68K action only when the code, exact range, parsed line and replacement
rule together prove the edit. Keep the action absent for the known ambiguous whole-form/addressing
diagnostics until the Core or adapter can identify a unique correction.

Formatting is explicit and conservative:

- preserve comments, strings, label spelling, directive spelling and numeric bases;
- normalize whitespace around commas and inside architecture-specific address expressions;
- optionally align mnemonic and operand columns within contiguous statement blocks;
- never expand macros/pseudo-instructions or rewrite instruction/register case by default;
- implement document and range formatting from the same tokenizer, with idempotence tests;
- defer format-on-type until document/range formatting is stable.

Migrate the current `formatM68kSource` behaviour into the shared formatter contract without losing
its `parseLine`-aware protection for commas and colons inside comments and quoted text. Preserve the
model's LF/CRLF convention instead of always returning LF. Add range formatting and
idempotence/assembled-equivalence fixtures before adding alignment or format-on-type.

Acceptance:

- Every quick fix is tied to a current diagnostic and is absent when its preconditions are not met.
- Applying a representative quick fix removes or changes the intended diagnostic after reanalysis.
- Formatting twice produces no second edit.
- Formatting preserves strings, comments, symbols and assembled bytes for valid fixtures.
- M68K formatting preserves bare/explicit comments, text directive fields, character expressions and
  exact `include`/`incbin` paths.

## Phase 7: consolidation, performance and rollout

- Replace `Monaco.registerLanguage`'s language-specific conditional with descriptors that declare ID,
  Monarch grammar, language configuration, capabilities and provider factory.
- Delete the superseded MIPS/RISC-V duplication and repeated whole-model scans. Migrate rather than
  discard the new M68K v2 parser/formatter behaviour. Keep static completion and hover documentation
  cached.
- Generate x86 NASM registers, instructions and operand metadata from an authoritative checked-in
  source or from the x86 package build. Record the source/version in the generated file and add a
  drift test; do not keep an undocumented mixed NASM/MASM list.
- Add measurements for edit handling, warm completion, diagnostic latency, Worker startup, large
  Projects and repeated session disposal. No provider may perform full-project parsing or assembly
  synchronously on the main thread.
- Exercise the maximum File count without materializing every Monaco model. Exercise the maximum
  Project byte budget without full-source retransmission after a one-character edit.
- Roll out behind a temporary per-Target feature flag. Use M68K first to prove Project diagnostics,
  exact/related ranges, UTF-16 conversion and WASM disposal; use Z80 next to prove the full semantic
  navigation/rename surface. Then finish M68K's supported semantic surface, followed by MIPS,
  RISC-V/RISC-V-64 and x86. Remove a legacy provider only after that Target's declared capability
  contract and browser matrix pass.
- Update `CONTEXT.md`, relevant documentation and manual verification after names and behaviour are
  stable.

Every phase ends with:

- `npm run check` with no new errors or warnings;
- `npm run lint`;
- `npm test`;
- the relevant measurement suite;
- manual verification in Project, Playground, embed and exam surfaces, in both light and dark themes,
  including keyboard-only definition, references, rename, completion and diagnostic navigation;
- where the phase touches editor/Debug integration, manual multi-File verification: switch
  Entry/included/unreachable Files, return to the current instruction, and toggle per-File
  breakpoints before a Run, during it and while paused.

## Upstream Core improvements

The app can deliver tolerant features before these land, but full semantic accuracy benefits from
upstream APIs.

### `@specy/s68k`

- Add an analysis-only, error-tolerant `S68k.analyze({ files, entry })` API that returns plain data
  without constructing or retaining a runnable Program. It should include diagnostics, parsed source
  records after recovery and the Files actually read.
- Export the instruction/directive catalogue from the same tables the analyzer uses: implementation
  state, forms, operand-mode sets, sizes/defaults, numeric restrictions, flags and text-operand kind.
  Version the schema so the app can replace its duplicated M68K documentation rules safely.
- Export stable symbol identities, kinds, scopes, all definitions/redefinitions, occurrences and the
  exact definition selected at each use. Preserve local-label qualification, assembled-sequence
  position for `set`, original spelling and unresolved occurrences after recoverable errors.
- Export the include graph and expansion occurrences separately from source occurrences, including
  include chains/IDs for a File included more than once. This allows dependency invalidation and
  expansion-specific values without duplicate source edits.
- Export an instruction/source listing for Build presentation rather than only an instruction count
  and address lookup through an Interpreter.
- Express columns as UTF-16 code units or expose byte offsets/source spans that the client can convert
  unambiguously. Exact current ranges are otherwise already strong: retain stable codes, severity,
  Hints and related Locations.
- Add structured fix data for diagnostics that have one safe replacement. Hints remain prose for
  people and must not double as a machine-edit protocol.
- Let a Project File carry both its source text and exact File bytes, or provide an `incbin` loader,
  so an editor with UTF-8 Files does not need private path aliases when the same text File is included
  as source and as bytes.
- Resolve the known ambiguous whole-form/immediate diagnostic cases before code actions depend on
  those codes, and expose a package-level conformance fixture the app can run for metadata drift.

### `@specy/mips` and `@specy/risc-v`

- Replace module-global RISC-V bitness with an immutable factory option or separate RV32/RV64
  factories.
- Expose a structured symbol index: stable identity, kind, value/address, definition locations,
  reference locations, scope and original spelling.
- Expose directive and macro metadata from the same grammar used by assembly.
- Add end columns/lengths, diagnostic codes, Hints and related macro/include locations.
- Make tokenizer/parser results available after recoverable errors where possible.

### `@specy/x86`

- Expose assembler mode/dialect metadata rather than requiring copied instruction lists.
- Add multi-File compilation and File-aware diagnostics when the runtime can support it.
- Preserve error/warning severity and expose diagnostic columns, codes and related locations.
- Expose NASM source-map symbols and references before execution, not only address-to-symbol lookup
  from a loaded program.
- Confirm and test WASM resource loading inside a Vite module Worker.

### `@specy/z80`

- Add exact diagnostic ranges/codes and severity if warnings are introduced.
- Expose stable symbol/scope identifiers directly so callers do not derive IDs from object identity.
- Add a tolerant per-line parse result if the existing tokenizer/trie is insufficient for navigation
  through a broken File.

Each upstream request needs a package version gate and adapter fallback so an app release cannot mix
new assumptions with an older installed Core accidentally.

## Test matrix

The contract suite should include at least:

| Area              | Representative cases                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Words             | uppercase/lowercase mnemonics, prefixed directives, apostrophes, dotted/local labels                   |
| Incomplete source | empty line, trailing comma, open parenthesis/bracket, partial string, unknown mnemonic                 |
| Symbols           | definition/reference, constant, variable redefinition, register list, duplicate, scoped/local, macro   |
| Multiple Files    | secondary-model providers/markers, includes, repeated/missing/cycle, unused File, `incbin`, rename     |
| M68K              | bare/colon/local labels, `set` by position, `.b/.w/.l/.s`, all modes, `*`, SR/CCR, refused operations  |
| Target modes      | MIPS registers, RV32 versus RV64, RISC-V ABI versus `xN`, NASM effective addresses, Z80 conditions     |
| Diagnostics       | exact range, UTF-16 conversion, code, Hint, severity, stale result, related expansion/include Location |
| Navigation        | same File, another/unopened File, repeated expansion, Build snapshot, disposed session                 |
| Editing           | completion insertion, snippet tab stops, safe rename, idempotent formatting, quick-fix reanalysis      |
| Lifecycle         | register/dispose twice, switch Target, Project close, Worker idle termination, S68K WASM leak          |
| Debug switching   | A -> B -> A selected line, line zero, Build/live identity, breakpoint add/remove during Run/pause      |

Where possible, provider tests should assert semantic results in neutral source-model types before
testing Monaco conversion. This keeps Core parsing, Project identity and Monaco rendering failures
separable.

## Risks and mitigations

- **Tolerant/Core disagreement:** mark tolerant results as unresolved and enable destructive edits
  such as rename only after semantic resolution.
- **Worker bundle/resource failures:** add production-build browser tests for all four Worker
  families, especially S68K/x86 WASM and static adapter deployment. Configure the Vite WASM plugin
  in `worker.plugins`, not only the main plugin list.
- **Large structured clones:** send incremental File operations; never clone binary Files into an
  assembly adapter that cannot consume them.
- **MIPS/RISC-V global state inside their shared Worker:** serialize every Core operation and pin
  Target immediately before Core creation. The Worker isolates analysis from execution but not one
  analysis session from another.
- **M68K WASM lifetime:** copy only structured-cloneable facts and dispose every analysis Program in
  `finally`; add repeated successful and warning-only analysis measurements, not only error cases.
- **M68K column mismatch:** convert character columns to Monaco UTF-16 against the analyzed File
  revision and test invalid astral characters as well as valid Latin-1 source.
- **M68K source/expansion ambiguity:** keep source Locations and include expansion IDs separate;
  deduplicate edits and omit a value/address when expansions disagree.
- **M68K metadata and File-preparation drift:** compare app vocabulary with the pinned Core and share
  one exact-byte `incbin` preparation function between Build and live analysis.
- **Cross-File Monaco navigation:** implement and test the public `registerEditorOpener` route before
  exposing definition results in another File.
- **Implicit source-kind changes:** keep `{ sourceKind, path, buildGeneration }` together. Explorer
  path selection must not turn an immutable Build view into a live view, which currently hides the
  selected instruction and breakpoint decorations.
- **Model-local decoration loss:** derive current-line and breakpoint decorations from stable source
  Locations every time a model becomes active; do not leave them owned only by the model that was
  visible when execution paused.
- **Breakpoint races:** accept gutter changes while source text is read-only, publish them
  immediately, and snapshot the latest set at execution-slice boundaries rather than mutating a Core
  call in flight.
- **Macros and local labels:** prefer Core symbol identities; disable rename for ambiguous tolerant
  matches.
- **Live versus Build confusion:** encode source kind in the URI and never attach Build addresses or
  Build diagnostics to a live URI.
- **Provider latency during checking:** retain the most recent tolerant syntax index separately from
  the authoritative diagnostic pass so completion does not wait for a complete assembly.
- **Markdown injection:** keep provider markdown untrusted and escape source-controlled text before
  embedding it in hover or completion documentation.

## Completion criteria

This plan is complete when all five Target families have:

- Project-aware, non-blocking live diagnostics with correct File identity and ranges;
- the same declared language features on every text File model, not only Entry, with unreachable
  Files explicitly distinguished from successfully analyzed Files;
- context-aware completion, signature help and detailed hover;
- document symbols, go to definition, references, highlights and safe rename for every symbol kind
  the adapter declares supported;
- include links and cross-File navigation;
- semantic tokens and folding;
- conservative formatting and diagnostic-backed code actions;
- no execution-Core mutation from language analysis;
- Build-source current-line and breakpoint decorations that survive cross-File switching, including
  breakpoint edits during an active or paused Run;
- passing provider contracts, architecture fixtures, lifecycle tests, measurements and hosting-surface
  verification;
- no remaining runtime use of the superseded flat provider implementations.
