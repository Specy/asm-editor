# MIPS and RISC-V JavaScript library v3 handoff

This document describes only the JavaScript-visible changes released between `v2.1.0` and `v3.0.0` of:

- `@specy/mips`
- `@specy/risc-v`

The two packages now expose the same source-set model and source-location behavior. Architecture-specific names are listed where they differ.

## Terminology used by v3

- **Source Set**: all source files supplied for one assembly, represented as a read-only record from path to source text.
- **Source Path**: the canonical virtual path used as a key in the Source Set.
- **Entry File**: the Source Set file where include expansion begins.
- **Execution Entry Label**: the label used when `initialize(true)` starts execution, commonly `main`. It is independent of the Entry File.
- **Include Directive**: `.include`, which performs textual inclusion. It is not a module import and does not create a separate compilation unit.

## Package and factory changes

Both packages were released as `3.0.0` because construction is a breaking change.

| Package         | Removed v2 factory                  | v3 factory                             | Static alias                                 |
| --------------- | ----------------------------------- | -------------------------------------- | -------------------------------------------- |
| `@specy/mips`   | `MIPS.makeMipsFromSource(source)`   | `makeMipsFromFiles(files, entryFile)`  | `MIPS.makeMipsFromFiles(files, entryFile)`   |
| `@specy/risc-v` | `RISCV.makeRiscVFromSource(source)` | `makeRiscVFromFiles(files, entryFile)` | `RISCV.makeRiscVFromFiles(files, entryFile)` |

There is no single-source compatibility overload. A one-file program uses a one-entry Source Set:

```ts
import { makeMipsFromFiles } from '@specy/mips'

const mips = makeMipsFromFiles({ 'main.asm': '.text\n.globl main\nmain:\n  nop' }, 'main.asm')
```

```ts
import { makeRiscVFromFiles } from '@specy/risc-v'

const riscv = makeRiscVFromFiles({ 'main.asm': '.text\n.globl main\nmain:\n  nop' }, 'main.asm')
```

The named functions and static aliases have identical behavior. They initialize the underlying simulator environment themselves.

The new public types are:

```ts
type MIPSSourceSet = Readonly<Record<string, string>>
type RISCVSourceSet = Readonly<Record<string, string>>

type MIPSSourceLocation = {
    sourcePath: string
    sourceLine: number
}

type RISCVSourceLocation = {
    sourcePath: string
    sourceLine: number
}
```

At runtime, the factory reads own enumerable string-keyed entries through `Object.entries`. The caller's object is snapshotted during construction. Adding, deleting, or replacing properties after construction does not change later assembly attempts.

## Source Set validation

Construction performs structural validation synchronously, before `assemble()`:

- `files` must be a non-null object and must not be an array.
- `entryFile` must be a string.
- Every enumerated source value must be a string, including unused files.
- Every source key must be a canonical Source Path, including unused files.
- `entryFile` must itself be canonical and must exactly match a Source Set key.

Relevant error messages include:

- `Source set must be an object`
- `Entry file must be a string`
- `Source content must be a string: <path>`
- `Entry file is not present in the source set: <entryFile>`

Source syntax, `.include` resolution, missing includes, include cycles, tokenization, and assembly are deferred until `assemble()`. Those failures are returned through the assembly result rather than being raised by the factory.

## Canonical Source Paths

Source Set keys and `entryFile` use a platform-independent virtual POSIX namespace. They do not refer to the browser or Node host filesystem.

A canonical Source Path:

- is non-empty;
- is root-relative, so it has no leading `/`;
- has no trailing `/`;
- uses `/`, never `\`, as the separator;
- contains no NUL;
- contains no empty segment;
- contains no `.` or `..` segment;
- is case-sensitive.

Examples:

| Path                                  | Result                                              |
| ------------------------------------- | --------------------------------------------------- |
| `main.asm`                            | valid                                               |
| `src/main.asm`                        | valid                                               |
| `directory with spaces/π.library.asm` | valid; segment contents are otherwise opaque        |
| `/src/main.asm`                       | invalid Source Set key                              |
| `./src/main.asm`                      | invalid                                             |
| `src/../main.asm`                     | invalid as a key even though it could be normalized |
| `src//main.asm`                       | invalid                                             |
| `src/main.asm/`                       | invalid                                             |
| `src\main.asm`                        | invalid                                             |

The same canonical-path validation applies to `getStatementsAtSourceLocation`.

## `.include` behavior

`.include` already existed in v2. Version 3 connects it to the public multi-file Source Set and fixes its path, repetition, and cycle behavior.

Only the Entry File and its transitive include closure are assembled. A supplied file that is never included is ignored even if its source contains invalid assembly. Its key and value still have to pass construction-time structural validation.

Include resolution uses the file containing the directive:

| Including file | Directive path         | Resolved Source Path |
| -------------- | ---------------------- | -------------------- |
| `src/main.asm` | `./helper.asm`         | `src/helper.asm`     |
| `src/main.asm` | `../shared/macros.asm` | `shared/macros.asm`  |
| `src/main.asm` | `/shared/macros.asm`   | `shared/macros.asm`  |

Include paths may contain `.` and `..`; they are normalized during resolution. A leading `/` means the virtual Source Set root and is stripped from the resolved key. Traversal above the virtual root is an assembly error.

Include paths reject:

- an empty path;
- NUL or backslashes;
- `//` empty segments;
- a trailing `/`;
- a path that resolves to the virtual root;
- any `..` traversal above the virtual root.

The resolved path must exactly match a Source Set key. Case mismatches are missing files.

Inclusion is textual:

- The `.include` line is omitted from the flattened tokenized stream and replaced by the included file's lines.
- Declarations, labels, directives, and macros from an included file participate at the position of the directive.
- Source Set property order does not determine assembly order. Entry-file order and include occurrence order do.
- Every include occurrence expands independently. Including the same file twice produces two copies.
- Reusing a file after its previous expansion has completed is valid. Only a path already active in the current recursive include chain is a cycle.
- Diamond-shaped includes are not deduplicated.
- Repeating a file can naturally cause duplicate-label or duplicate-address assembly errors if its contents define them.

A cycle diagnostic contains the complete canonical chain starting at the Entry File, for example:

```text
Include cycle: entry.asm -> a.asm -> dir/b.asm -> a.asm
```

A missing include reports the location of the `.include` directive and a message of the form:

```text
Error reading include file <resolved-path>
```

## Assembly lifecycle

Program construction no longer tokenizes or assembles. The observable lifecycle is:

1. Call the v3 factory. Structural validation and the Source Set snapshot happen synchronously.
2. Call `assemble()`. Include expansion, tokenization, parsing, pseudo-instruction expansion, and machine-code generation happen here.
3. Inspect the result. A successful assembly, including a warnings-only assembly, enables statement and simulation methods.
4. Call `initialize(...)` before simulation as before.

`assemble()` still returns the architecture-specific result:

```ts
type MIPSAssembleResult = {
    report: string
    errors: MIPSAssembleError[]
    hasErrors: boolean
    hasWarnings: boolean
}

type RISCVAssembleResult = {
    report: string
    errors: RISCVAssembleError[]
    hasErrors: boolean
    hasWarnings: boolean
}
```

Warnings do not make the program unusable: a warnings-only result has `hasErrors === false`, `hasWarnings === true`, and can be initialized and run.

Each `assemble()` starts again from the construction-time Source Set snapshot and clears the previous assembled state. If a later assembly attempt fails, an earlier successful compiled program is invalidated. Statement access, initialization, stepping, and simulation then reject with `Program has not been assembled successfully` until a later assembly succeeds.

`getTokenizedLines()` has a deliberately different lifecycle because tokenization can finish before a later assembler stage fails:

- Before the first `assemble()`, it throws `Program has not been assembled`.
- After successful tokenization, it remains available even if parsing or machine-code assembly later reports errors.
- If tokenization itself did not complete, including a missing include or include cycle, it throws `Program tokenization did not complete`.

## Tokenized-line shape

The v2 tokenized-line shape contained only `line` and `tokens`. Version 3 replaces it with source-aware line objects:

```ts
type MipsTokenizedLine = {
    sourcePath: string
    sourceLine: number
    source: string
    processedSource: string
    tokens: JsInstructionToken[]
}

type RiscvTokenizedLine = {
    sourcePath: string
    sourceLine: number
    source: string
    processedSource: string
    tokens: JsInstructionToken[]
}
```

Field semantics:

- `sourcePath` is the canonical path of the original file.
- `sourceLine` is one-based within that original file, not within the flattened include expansion.
- `source` is the exact original line supplied in the Source Set.
- `processedSource` is the line after assembler substitutions such as `.eqv`.
- `tokens` describe `processedSource`.

The old `line` property is absent.

Source splitting now preserves a final empty line. A source ending in `\n` can therefore produce a trailing tokenized line with an empty source and token list. Empty and comment-only non-include lines can also be present with empty or comment-only token arrays.

## Token shape

`JsInstructionToken` changed from:

```ts
{
    sourceLine: number
    sourceColumn: number
    originalSourceLine: number
    value: string
    type: string
}
```

to:

```ts
{
    sourceColumn: number
    value: string
    type: string
}
```

Line ownership moved to the containing tokenized-line object. `sourceLine` and `originalSourceLine` are absent from tokens. `sourceColumn` is one-based and refers to the processed source line, which matters when `.eqv` changes the text.

## Program statements and generated instructions

`JsProgramStatement` gained `sourcePath`:

```ts
interface JsProgramStatement {
    readonly sourcePath: string
    readonly sourceLine: number
    readonly address: number
    readonly binaryStatement: number
    readonly source: string
    readonly machineStatement: string
    readonly assemblyStatement: string
}
```

`sourcePath`, `sourceLine`, and `source` now consistently describe the original source line responsible for the statement.

Pseudo-instruction and macro mapping changed materially:

- Every machine statement emitted by one pseudo-instruction carries the same original `sourcePath`, `sourceLine`, and full `source`. In v2, only the first generated instruction reliably carried the source text.
- Every machine statement emitted by a macro call maps to the original macro invocation line.
- A pseudo-instruction inside a macro follows the same rule, so all resulting machine statements map back to the outer source invocation represented by the parsed statement.
- Generated statement source text no longer uses synthetic `<line>` prefixes to encode macro history.

`getCompiledStatements()` remains available and returns every machine statement after pseudo-instruction and macro expansion. Results use the source mapping above.

`getParsedStatements()` returns parsed `JsProgramStatement[]`. Its v2 TypeScript declaration incorrectly said `JsInstructionToken[]`; v3 corrects the declaration to match the runtime statement objects. Parsed statements are before pseudo-instruction expansion, while macro expansion occurs during parsing.

Both methods require a successful assembly.

## Source-location statement lookup

The following v2 methods were removed from both packages:

- `getStatementAtSourceLine(line)`
- `getCurrentStatementIndex()`

`getStatementAtSourceLine` was ambiguous once several files could contain the same line number, and returning only one statement hid pseudo-instruction and macro expansion.

The replacement is:

```ts
getStatementsAtSourceLocation(
  sourcePath: string,
  sourceLine: number,
): JsProgramStatement[]
```

Behavior:

- It searches the compiled machine statements, not the parsed statements.
- It returns every machine statement generated by that original location.
- Results preserve the same assembler address order as `getCompiledStatements()`.
- A basic instruction normally returns one item.
- A pseudo-instruction or macro invocation can return several items.
- A label-only, directive-only, data-only, empty, or comment-only line returns an empty array.
- A canonical path that is absent from the Source Set, unused, or has no matching machine statement returns an empty array.
- If a source file was included more than once, lookup by its original path and line returns statements from every occurrence.
- A noncanonical `sourcePath` throws.
- `sourceLine` must be a finite positive integer no larger than `2_147_483_647`. Zero, negatives, fractions, `NaN`, `Infinity`, and larger values throw `Source line must be a positive integer`.
- It requires a successful assembly.

`getNextStatement()` and `getStatementAtAddress()` remain statement-based APIs and their returned statements now include `sourcePath`.

## Diagnostic shape

The v2 diagnostic fields were removed:

```ts
macroExpansionHistory: string
filename: string
lineNumber: number
columnNumber: number
```

Version 3 exposes structured source identity:

```ts
type MIPSAssembleError = {
    isWarning: boolean
    message: string
    macroExpansionTrace: MIPSSourceLocation[]
    sourcePath: string
    sourceLine: number
    sourceColumn: number
}

type RISCVAssembleError = {
    isWarning: boolean
    message: string
    macroExpansionTrace: RISCVSourceLocation[]
    sourcePath: string
    sourceLine: number
    sourceColumn: number
}
```

There are no compatibility aliases: for example, `filename` is absent rather than duplicated alongside `sourcePath`.

Location rules:

- `sourcePath` is canonical when the diagnostic belongs to supplied source.
- `sourceLine` and `sourceColumn` are one-based for source-backed diagnostics.
- A diagnostic without a source location may use an empty path and zero line/column.
- Include-resolution diagnostics point at the including file and directive.
- Ordinary diagnostics in included files point at the included file's original path and line.

Macro diagnostics deliberately differ from generated-statement mapping:

- An error in a macro body points to the macro definition's `sourcePath` and `sourceLine`.
- `macroExpansionTrace` separately contains the call sites that led to that body, ordered outermost to innermost.
- Each trace item contains `sourcePath` and one-based `sourceLine`; trace columns are not included.
- A diagnostic outside macro expansion has an empty trace.

Example: if `main.asm:5` calls `bad()` and the invalid instruction is in `macros.asm:2`, the diagnostic location is `macros.asm:2` and the trace is:

```ts
;[{ sourcePath: 'main.asm', sourceLine: 5 }]
```

The assembly result's `report` remains a human-readable aggregate. Its text now uses canonical source paths and can render structured macro-expansion locations; the individual `errors` objects carry the stable structured data described above.

## Architecture-specific naming

The behavior is intentionally parallel, but names are not interchangeable:

| MIPS                                       | RISC-V                                       |
| ------------------------------------------ | -------------------------------------------- |
| package `@specy/mips`                      | package `@specy/risc-v`                      |
| class `MIPS`                               | class `RISCV`                                |
| `makeMipsFromFiles`                        | `makeRiscVFromFiles`                         |
| `MIPSSourceSet`                            | `RISCVSourceSet`                             |
| `MIPSSourceLocation`                       | `RISCVSourceLocation`                        |
| `MipsTokenizedLine`                        | `RiscvTokenizedLine`                         |
| `MIPSAssembleError` / `MIPSAssembleResult` | `RISCVAssembleError` / `RISCVAssembleResult` |

All path, include, lifecycle, token, statement, and diagnostic rules in this document apply to both packages.

## Behavior covered by the v3 release tests

The published packages were checked for the following v3 contracts:

- named and static multi-file factories exist;
- old single-source factories are absent;
- one-file Source Sets still assemble and run;
- relative, root-relative, and transitive includes resolve correctly;
- repeated includes expand repeatedly;
- include directives disappear from tokenized output;
- unused source content is not assembled;
- construction snapshots the Source Set;
- valid opaque path segments support spaces and Unicode;
- noncanonical paths and missing Entry Files fail construction;
- missing includes, virtual-root escape, and full-chain cycles report errors;
- original and `.eqv`-processed lines remain distinct;
- token fields and one-based columns match the v3 shape;
- pseudo-instruction and macro calls map to every generated machine statement;
- repeated includes are all returned by source-location lookup;
- unknown canonical source locations return an empty array;
- invalid lookup paths and lines throw;
- `getCompiledStatements()` returns the complete machine program;
- `getParsedStatements()` returns statement objects;
- macro diagnostics expose definition locations and structured expansion traces;
- tokens remain available after assembler-stage failure but not after tokenization failure;
- failed assembly blocks compiled-statement access and initialization;
- warnings-only programs remain runnable.
