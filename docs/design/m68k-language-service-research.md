# M68K language-service research

Researched on 2026-09-09 for the assembly language-service implementation plan. This note describes
the current, uncommitted M68K provider work in `asm-editor`, the installed `@specy/s68k` 2.1.0
package, and the adjacent `s68k` repository at commit `9175b95`. It proposes no production change.

## Conclusions

M68K should be in the language-service plan, not left on the legacy-provider path. Its current
provider already uses the Core's tolerant `S68k.parseLine` API, and its Core diagnostics are the
closest of the supported Targets to the proposed neutral diagnostic model. The first M68K service
slice can therefore provide parser-aware completion, hover, formatting, exact multi-File
diagnostics, document symbols, include links, and symbol values without inventing a new parser.

It cannot yet provide safe references or rename for every symbol, complete semantic tokens, or
fully authoritative signature help. The Core internally has most of the necessary syntax,
instruction-form, symbol, and include-expansion information, but its JavaScript API exports only a
flattened one-line parse and an error-free Program's definition-only symbol map. The preferred
long-term implementation is an error-tolerant `S68k.analyze` result plus a versioned language
metadata catalogue, rather than a second M68K parser and instruction table in the app.

M68K needs its own lazy Worker. Assembly is synchronous WASM work and cannot be cancelled once it
starts. Unlike MIPS/RISC-V, the Core has no mutable Target/bitness global to pin, so separate
assemblies do not need architecture-state serialization. Successful live checks do, however,
return a WASM-backed `Program` that must be disposed inside the Worker.

## What the current provider now does

The M68K registration installs a Monarch tokenizer, language configuration, completion, hover, and
document formatting ([`Monaco.ts`](../../src/lib/monaco/Monaco.ts#L46)). This is already one feature
ahead of the other legacy providers because formatting is registered as a first-class Monaco
provider.

### Lexical highlighting and editing configuration

The revised Monarch grammar is case-insensitive, distinguishes implemented and deliberately
refused operations, recognizes the M68K register families and special registers, and gives labels
precedence over mnemonic-looking names when a colon is present
([`M68K-grammar.ts`](../../src/lib/languages/M68K/M68K-grammar.ts#L16)). The language configuration
adds semicolon comments, parentheses, and quote pairs
([`M68K-grammar.ts`](../../src/lib/languages/M68K/M68K-grammar.ts#L84)).

This remains a lexical approximation. In particular:

- The Core has three Comment forms, including markerless EASy68K Comment fields and `*` after a
  Label, while Monarch only recognizes whole-line `*` and unconditional `;` comments. The exact
  Comment rules are context-dependent ([s68k grammar](../../../s68k/docs/grammar.md#L140)).
- Quoted text is always colored as a string, although a one-to-four-character literal is an
  Expression value and longer quoted text is data. This distinction depends on syntactic context.
- Incomplete strings, malformed numbers, and expression-level symbol references cannot be
  represented accurately by the current flat rules.

Monarch should stay as the immediate, no-Worker fallback. Semantic tokens should later correct its
classification from an analysis snapshot instead of making the Monarch state machine duplicate the
Core grammar.

### Completion

Completion now parses the source prefix with `S68k.parseLine`. It finds the operation field after
colon and bare Labels, suppresses operation completion in Comments, preserves the user's operation
case, completes legal size suffixes, and selects operand templates from the documented addressing
modes ([`M68K-language.ts`](../../src/lib/languages/M68K/M68K-language.ts#L40),
[`M68K-language.ts`](../../src/lib/languages/M68K/M68K-language.ts#L164)). Tests cover uppercase
operations, operations after Labels, branch `.s`, PC-relative modes, status registers, and register
lists ([`M68K-language.test.ts`](../../src/lib/languages/M68K/M68K-language.test.ts#L194)).

The remaining gaps are structural:

- Operand suggestions appear only immediately after a space or comma and insert one example such
  as `d0`, `a0`, or `0(a0,d0)`. They do not complete a partially written register, symbol,
  Expression, register list, or nested addressing mode.
- There is no Project symbol, `include`/`incbin` path, `opt` option, or `end` entry-point completion.
- Instruction alternatives are aggregated into one documentation record. Completion and future
  signature help cannot select a concrete overload from the operands already written.
- Every resolved item is marked `preselect`, and most documentation is computed eagerly in the
  initial response ([`M68K-language.ts`](../../src/lib/languages/M68K/M68K-language.ts#L286)).
- The exported factory still spells the API `Completition`; the service migration is a suitable
  compatibility boundary for correcting it.

### Hover and formatting

Hover uses `parseLine` to ensure the cursor is on the operation and presents operand mode groups,
sizes, default size, flags, description, and examples
([`M68K-language.ts`](../../src/lib/languages/M68K/M68K-language.ts#L305)). It currently returns a
range covering columns 1 through 1000 and answers an empty Hover rather than `null` when nothing is
known. It has no register, number, operand, symbol, address, value, or definition Hover.

Formatting parses each line and inserts only structural separator spacing and an operation-leading
tab, preserving separators inside strings and Comments
([`M68K-language.ts`](../../src/lib/languages/M68K/M68K-language.ts#L88)). This is a useful
conservative base, but it always returns a whole-document replacement, normalizes CRLF to LF, has
no range formatting, and does not yet prove idempotence or byte-equivalence across a broad corpus.

### Diagnostics and Project Files

The Emulator already sends the complete M68K source map and Entry path to `S68k.assemble` for both
checking and Build compilation
([`M68KEmulator.svelte.ts`](../../src/lib/languages/M68K/M68KEmulator.svelte.ts#L181)). Before doing
so it converts the editor File representation and rewrites resolved `incbin` operands to private
byte aliases so binary and UTF-8-backed Files preserve their exact bytes
([`M68KEmulator.svelte.ts`](../../src/lib/languages/M68K/M68KEmulator.svelte.ts#L976)). This conversion
must be extracted to a plain shared adapter module; a language Worker must not import a Svelte
Emulator or implement subtly different include semantics.

The Core diagnostic has almost exactly the desired LSP-shaped information: severity, stable code,
message, optional Hint, exact File and half-open range, and related locations
([installed `Diagnostic`](../../node_modules/@specy/s68k/dist/pkg/s68k.d.ts#L326)). The current adapter
retains severity, File, start position, message, and Hint but drops `code`, `endColumn`, and
`related` ([`M68KEmulator.svelte.ts`](../../src/lib/languages/M68K/M68KEmulator.svelte.ts#L963)). The
generic editor then ends every marker at column 100
([`Editor.svelte`](../../src/components/specific/project/Editor.svelte#L318)). The shared diagnostic
publisher can improve M68K immediately without a Core change.

## What `@specy/s68k` 2.1.0 exposes

The installed version is pinned exactly in the app ([`package.json`](../../package.json#L33)). Its
two relevant static calls are synchronous:

- `S68k.parseLine(text)` never throws and returns a tolerant line classification, optional Label,
  operation name and size, flattened operands with addressing-mode names/descriptions, raw text for
  `include`/`incbin`/`fail`, Comment, and half-open spans
  ([installed API](../../node_modules/@specy/s68k/dist/index.d.ts#L173),
  [installed parsed types](../../node_modules/@specy/s68k/dist/pkg/s68k.d.ts#L13)). The implementation
  intentionally discards diagnostics and the Expression tree because it has no File, Symbol, or
  address context ([s68k `lib.rs`](../../../s68k/src/lib.rs#L306)).
- `S68k.assemble({files, entry})` accepts a complete map of text and binary Files. It follows only
  the Entry and reachable `include`/`incbin` paths and returns all diagnostics plus a Program when no
  error exists ([installed API](../../node_modules/@specy/s68k/dist/index.d.ts#L5),
  [s68k wrapper](../../../s68k/ts-lib/src/index.ts#L410)).

The Core continues far enough after recoverable errors to report multiple findings, but it withholds
the Program whenever any diagnostic is an error
([s68k assembler](../../../s68k/src/assembler/mod.rs#L97)). A successful Program exposes summary
information and a Symbol map with full name, kind, value, and definition Location
([installed `Program`](../../node_modules/@specy/s68k/dist/index.d.ts#L66),
[installed `ProgramSymbol`](../../node_modules/@specy/s68k/dist/pkg/s68k.d.ts#L278)). It exposes no
references, per-use resolution, include graph, complete instruction list, or partial symbols after a
failed assembly.

The public `Program` is a handle on WASM memory. `S68k.assemble` frees the internal assembly when no
Program exists, but a successful or warning-only check hands ownership to the caller
([s68k wrapper](../../../s68k/ts-lib/src/index.ts#L428)). A Worker must extract plain diagnostics and
`ProgramInfo`, then call `result.program?.dispose()` in `finally`. The Program handle itself is not a
structured-cloneable Worker response.

### Coordinate conversion

Core Locations and `parseLine` spans are zero-based and half-open. They count Rust Unicode scalar
values after converting internal UTF-8 byte spans to character columns
([s68k `source.rs`](../../../s68k/src/assembler/source.rs#L101),
[s68k `source.rs`](../../../s68k/src/assembler/source.rs#L140)). Monaco/JavaScript positions count
UTF-16 code units. Valid M68K Latin-1 source has the same count under both conventions, but an
invalid astral character before a token occupies one Core column and two Monaco columns. This is
precisely when a diagnostic must still point at the correct text.

The M68K adapter should convert each Core column through that File's line text before producing the
neutral range, with tests for an emoji before and inside the diagnosed span. Alternatively, the
upstream API can expose UTF-16 columns explicitly. A blanket `+1` is insufficient.

## M68K symbol and include semantics

An M68K adapter cannot apply a generic “same spelling means same symbol” rule:

- Mnemonics, directives, sizes, and register names are case-insensitive; ordinary Symbol resolution
  is case-sensitive ([s68k grammar](../../../s68k/docs/grammar.md#L71)). Entry-point selection is the
  one documented exception: exact match wins, followed by an unambiguous ASCII-case-insensitive
  Label match ([s68k dialect ADR](../../../s68k/docs/adr/0001-easy68k-is-the-reference-dialect.md#L24)).
- The four Symbol kinds are Label, `equ` Constant, reassignable `set` Variable, and `reg` Register
  list ([s68k `symbols.rs`](../../../s68k/src/assembler/symbols.rs#L70)).
- A Local Label beginning with `.` is qualified under the preceding Global Label. The same local
  spelling can therefore name different Symbols in different scopes
  ([s68k grammar](../../../s68k/docs/grammar.md#L241)).
- A `set` use resolves to the latest definition above that use in the assembled sequence. Its value
  and effective definition Location are use-site-dependent
  ([s68k `symbols.rs`](../../../s68k/src/assembler/symbols.rs#L115)). The exported Program flattens a
  Variable to only its final value and Location
  ([s68k `program.rs`](../../../s68k/src/assembler/program.rs#L118)).
- `include` is textual: included lines share the current address, section, Symbol namespace,
  Variable state, and Local-label scope with the including source
  ([s68k grammar](../../../s68k/docs/grammar.md#L820)).
- A File may be included more than once. The same physical source Location can then represent
  several expansion occurrences with different addresses, values, or bindings; the Core
  distinguishes these with assembled-sequence position and Include chain
  ([s68k `include.rs`](../../../s68k/src/assembler/include.rs#L1)).

The common analysis model should consequently distinguish a physical source occurrence from an
expansion occurrence. Source edits and rename deduplicate identical physical ranges. Evaluated
Hover, definition, and address data may carry multiple expansion-specific answers. Rename must be
disabled when one physical token has incompatible resolved meanings or when the service has only a
spelling match.

## Information present upstream but not exported

The Rust implementation already has most of the semantic machinery required by the service:

- Tokens, Expressions, registers, addressing forms, and their spans survive in the AST, and parser
  recovery retains partial line structure after malformed input
  ([s68k `ast.rs`](../../../s68k/src/assembler/ast.rs#L381),
  [s68k `parser.rs`](../../../s68k/src/assembler/parser.rs#L23)).
- The instruction table is the Core's source of truth for mnemonic alternatives, supported/refused
  status, overload Forms, operand modes per position, sizes/defaults, and value constraints
  ([s68k instruction table](../../../s68k/src/assembler/instructions/table.rs#L296)).
- The Symbol table retains all `set` redefinitions and can resolve a name at an assembled-sequence
  position ([s68k `symbols.rs`](../../../s68k/src/assembler/symbols.rs#L126)).
- Include expansion already records physical Files, assembled positions, and Include chains
  ([s68k `include.rs`](../../../s68k/src/assembler/include.rs#L13)).

The app currently mirrors the instruction table in its large documentation module. Its addressing
mode group comment explicitly says it follows the Core table
([`M68K-documentation.ts`](../../src/lib/languages/M68K/M68K-documentation.ts#L109)), while its tests
compare that module against another hand-written operation list
([`M68K-language.test.ts`](../../src/lib/languages/M68K/M68K-language.test.ts#L50)). This catches
accidental app changes, not drift from a new Core release.

The preferred upstream additions are:

```ts
S68k.analyze({ files, entry }): {
    diagnostics: Diagnostic[]
    parsedFiles: ParsedSourceFile[]
    symbols: AnalysisSymbol[]
    occurrences: SymbolOccurrence[]
    includeEdges: IncludeEdge[]
    readFiles: string[]
    sourceMap?: SourceMapEntry[]
}

S68k.getLanguageMetadata(): {
    target: 'm68000'
    dialect: 'easy68k'
    instructions: InstructionSpec[]
    directives: DirectiveSpec[]
}
```

`analyze` should return useful parsed Files and Symbols even when errors prevent a runnable Program.
Each occurrence needs a physical source Location, its resolved stable Symbol ID when known, and
optional assembled position/Include chain. Variables need every redefinition and the definition and
value selected at each use. The include result needs resolved edges and the Files actually read for
incremental dependency invalidation. A compact source map or lazy address/source queries should not
require constructing an Interpreter. Diagnostics should optionally carry structured edits for code
actions; the current Hint is human-readable prose, not a safe edit.

The metadata call should serialize the existing instruction table rather than create a second one.
Descriptions and learning examples can remain app-owned, keyed by stable operation/form IDs. Until
that API exists, keep the current checked-in metadata, pin the Core version, and add representative
“generated snippet assembles” tests.

## Worker and lifecycle constraints

Use one lazily loaded, reference-counted M68K Worker family. The `S68k` API is a fixed
EASy68K-flavoured M68000 dialect and has no CPU, bitness, or dialect option
([installed options](../../node_modules/@specy/s68k/dist/index.d.ts#L23)). Source inspection shows
per-call Files, include expansion, layout, diagnostics, and Symbols and no mutable architecture
global; unlike the MARS-family Worker, it needs no mode pinning. Calls are synchronous and expose no
cancellation hook, so the shared latest-revision queue must coalesce before assembly and discard
stale results afterward. Hard cancellation requires terminating the Worker.

The package statically imports its `.wasm` module and starts it at module evaluation
([installed WASM entry](../../node_modules/@specy/s68k/dist/pkg/s68k.js#L1)). The app configures
`vite-plugin-wasm` only in the main Vite plugin list
([`vite.config.ts`](../../vite.config.ts#L17)), while that plugin's own Web Worker instructions say
to configure it under `worker.plugins` too
([plugin README](../../node_modules/vite-plugin-wasm/README.md#L47)). Add that build configuration
before introducing the Worker and verify development, production preview, SSR, and Firefox in a
browser test. Do not instantiate the Worker during SSR.

Worker responses contain only plain analysis types. On every accepted assembly:

1. Assemble the normalized Project with the shared M68K File conversion.
2. Normalize diagnostic ranges, codes, Hints, and related locations.
3. If there is a Program, copy its `ProgramInfo`/Symbols into the snapshot.
4. Dispose the Program in `finally`, including stale and failed-response paths.
5. Publish the result only if its session revision is still current.

No provider request should start whole-Project assembly synchronously on the main thread. The Worker
should update/cache tolerant parses before starting debounced authoritative assembly so completion
does not normally queue behind it. Large-source and include-expansion latency needs a measurement
fixture because an in-flight WASM call cannot yield.

## How M68K fits the shared implementation

M68K can reuse without qualification:

- stable live/Build model URIs and Project language sessions;
- incremental File lifecycle messages and lazy Monaco model creation;
- the zero/one-based Monaco conversion boundary, with the M68K UTF-16 conversion added before it;
- revision IDs, cancellation/stale-result rejection, Worker reference counting, and marker
  publication;
- neutral diagnostic, symbol, occurrence, capability, completion, hover, and edit types;
- editor opening, cross-File model materialization, provider registration/disposal, and contract
  harnesses.

Add `m68k.worker.ts` and `m68kAdapter.ts` beside the existing proposed Worker families. Its tolerant
layer initially caches `parseLine` for every text File, not only reachable Files, so document
structure and local editing still work in an unopened or temporarily unreachable File. Its
authoritative layer assembles from Entry and enriches accepted snapshots with Core diagnostics and
error-free Program Symbols.

Initial capability declarations should be honest:

- **Enable:** exact Project diagnostics, operation/size/operand-context completion, operation Hover,
  conservative formatting, physical document Symbols, include/incbin links and path completion,
  numeric Hover, and resolved Symbol value/definition Hover where the Program map is unambiguous.
- **Incrementally enable:** semantic tokens and definition for source shapes the adapter can prove,
  including Global labels and non-redefined Constants in a successful, single-expansion context.
- **Defer or return no result:** complete references and rename, `set`-aware definition/value,
  expansion-dependent Local labels, and full instruction source maps until the Core exposes
  occurrences and expansion identity.

Build-only address hints must say that they are simulator/Core addresses. S68k currently models
every instruction as four bytes rather than producing real 68000 encodings
([installed README](../../node_modules/@specy/s68k/README.md#L225)), and the app currently reports no
M68K generated code or pseudo-instruction decoration
([`M68KEmulator.svelte.ts`](../../src/lib/languages/M68K/M68KEmulator.svelte.ts#L238)). Opcode-byte
code lenses therefore remain unavailable.

## Concrete test additions

### Phase 0 provider contracts

- Blank, indented, Label-only, colon Label, bare Label plus operation, and operation-looking Label
  (`end:`) lines.
- Upper/lower/mixed-case operation, size, register, and special-register completion while preserving
  typed case; keep Symbol spelling case-sensitive.
- `.b/.w/.l` versus branch `.s`; `d0`/`a0`/`sp`, legal `sr`/`ccr` positions and deliberately
  unsupported `usp`, PC displacement/index, predecrement/postincrement, and `movem` register-list
  positions.
- No semantic suggestions in whole-line, explicit, bare, or post-Label `*` Comments, quoted File
  names, or `fail` message text.
- Exact replacement ranges for a partial operation after either Label spelling, a partial size, a
  partial register, a Local label, and an incomplete parenthesized operand.
- Hover returns the operation token range, not the line, and returns `null` outside a supported
  token.
- Formatting is idempotent; preserves LF/CRLF policy, strings, Comments, Symbol case, and numeric
  bases; and leaves assembled diagnostics/Program memory unchanged for valid fixtures.
- Monarch fixtures for bare Labels, `end:`, refused operations, Comment forms, malformed numbers,
  Local labels, and quoted values.

### Diagnostics and Worker contracts

- Preserve every Core field: exact end column, stable code, severity, Hint, duplicate-definition
  related Location, and nested-include related chain.
- Convert an astral character before/inside an error range to the correct Monaco UTF-16 columns.
- Missing Entry, missing include, include of a binary File, missing incbin, relative/root fallback,
  backslash paths, `.`/`..`, include cycle, repeated include, and included-file diagnostics.
- Successful, warning-only, error-only, stale, superseded, and disposed-session requests; instrument
  Program disposal in every path.
- Rapid edits admit at most one active and one latest pending assembly. Revision N never publishes
  over N+1; closing the Project terminates an idle Worker.
- Production Vite build/preview loads the M68K WASM in a Worker in Chromium and Firefox; SSR imports
  create no Worker.

### Symbols and later semantic features

- All four Symbol kinds and their document-symbol kinds; duplicate names and reserved register
  names.
- Case-distinct `Count` and `count`; case-insensitive operation/register matching.
- Reused `.loop` under two Global labels, a Local label before any Global label, and same-File
  navigation.
- Several `set` definitions with uses before, between, and after them; definition and Hover choose
  the correct prior definition/value.
- A File included once, twice under different Global scopes, and transitively. Distinguish physical
  source occurrence from expansion occurrences and refuse ambiguous rename.
- Cross-File `equ`, branch, data, and `reg` references; exclude comments, quoted strings, and raw
  directive text from rename.
- Include/incbin document links and completion never escape the Project root and never link a
  guessed missing File.
- Every representative instruction-form snippet and addressing-mode completion assembles under the
  pinned Core; a Core metadata version change fails a drift test deliberately.

## Upstream backlog relevant to the plan

In addition to the analysis and metadata APIs above:

- Expose structured diagnostic fixes where a correction is deterministic.
- Expose resolved include edges/read Files and compact source mappings independently of Interpreter
  execution.
- Add UTF-16 position encoding or declare/parameterize the public encoding.
- Preserve partial semantic results when an unrelated error prevents a Program.
- Expose real instruction sizes/encodings before offering opcode-byte presentation. Real sizes,
  macros/conditional assembly, and a disassembler remain documented future work
  ([s68k README](../../../s68k/README.md#L35)).
- Keep adapters capability-gated for macros: the current dialect recognizes and deliberately
  refuses macro, conditional-assembly, and structured-control directives
  ([`M68K-documentation.ts`](../../src/lib/languages/M68K/M68K-documentation.ts#L1843)).
