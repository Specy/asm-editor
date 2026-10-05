# RISC-V compiler assembly compatibility: implementation plan

Proposed on 2026-10-03 for the RARS **Core** and its editor integration; implementation authorized and completed locally on 2026-10-04. See the [implemented GNU v1 contract and verification](./risc-v-gnu-compiler-v1.md), including the package-release gate. Rust integration remains a follow-on gate. Vocabulary and existing compilation constraints come from [CONTEXT.md](../../CONTEXT.md), [Source compilation](./source-compilation.md), [ADR 0027](../adr/0027-source-compilation-starts-with-self-contained-programs.md), and [ADR 0028](../adr/0028-persist-compilation-records-with-transient-source-maps.md).

## Goal and boundary

Assemble a useful, documented subset of ordinary GCC and LLVM output for self-contained RV32 and RV64 programs, with correct instructions, bytes, addresses, Diagnostics, Step, Undo, and source correspondence. Acceptance alone is insufficient: silently ignoring `.quad` or corrupting string bytes can produce a runnable, wrong program.

Start with little-endian, statically resolved assembly using the Core's supported instructions. The current C/C++ presets use `rv32imfd/ilp32d` and `rv64imfd/lp64d`; keep those audited limits initially. Capture compatible `no_std` Rust assembly as Core fixtures without enabling Rust Source compilation. Programs may use local includes, functions, globals, constants, and compiler-generated sections. Unresolved symbols remain errors, including compiler runtime helpers.

Full ELF loading/linking, multiple compiled translation units, GOT/PLT, dynamic libraries, TLS, compressed/vector execution, constructors/destructors, exceptions/unwinding, COMDAT selection, and a Rust runtime are outside this pass. The [Source runtime plan](./source-runtime-plan.md) (2026-10-04) later brings multiple units, `.init_array` constructors, weak symbols and COMDAT selection into the GNU profile for C++ support; its decisions supersede this boundary where they differ. Unsupported runtime-affecting forms must fail explicitly. A recorded checkpoint may change this boundary; a compiler's availability does not establish runtime support.

## Verified baseline

Session probes used installed `@specy/risc-v` 3.6.2 on both widths. Local source is separately available and built; these results do not establish that its generated artifact is identical.

| Input                                                          | Observed result                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `.p2align 2,0x0`                                               | Error: requires one operand.                                                                                       |
| `.quad 42`                                                     | Warning; directive ignored.                                                                                        |
| `auipc a0,%pcrel_hi(value)` / `addi a0,a0,%pcrel_lo(.Lanchor)` | Rejected.                                                                                                          |
| `.ascii "\017\000\377"`                                        | No Diagnostic; bytes `[0,49,55,0,48,48,51,55,55]`, expected `[15,0,255]`. Hex escapes store literal `x0f/x00/xff`. |
| Forward `.dword value`, followed by `value: .word 42`          | No Diagnostic; address `0x10010008` becomes `[8,0,1,16,8,0,1,16]`, expected `[8,0,1,16,0,0,0,0]`.                  |
| `.word value+4`; numeric labels `j 1f` / `1:`                  | Rejected.                                                                                                          |

Source inspection explains further audit targets. [Directives.java](../../emulators/risc-v/rars/src/main/java/app/specy/rars/assembler/Directives.java) aliases `.p2align` to `.align`. [Assembler.java](../../emulators/risc-v/rars/src/main/java/app/specy/rars/assembler/Assembler.java) writes data during its first pass, automatically aligns numeric data, switches named sections through shared text/data counters, and treats `.option`, `.attribute`, `.local`, and `.weak` as metadata. These mechanisms need semantic tests; inspection alone does not prove every form wrong. Existing `%hi/%lo` support uses [token types](../../emulators/risc-v/rars/src/main/java/app/specy/rars/assembler/TokenTypes.java) and [pseudo templates](../../emulators/risc-v/rars/src/main/java/app/specy/rars/riscv/PseudoOps.java).

Live Compiler Explorer `rustc r1990` probes compiled an exported `no_std` function returning `6*7` at O0 for `riscv32im-unknown-none-elf` and `riscv64gc-unknown-none-elf`, with mappings. Their output also contained overflow-panic helper calls and rejected assembler forms. Resolving those helpers is separate work.

## Proposed compatibility contract

Introduce a versioned `gnu-compiler-v1` profile; preserve `rars` as the default and retain its educational syntax, implicit data alignment, syscalls, macros, and debugging behavior. GNU mode places data exactly at the current location unless an explicit alignment directive intervenes. In particular, `.byte` followed by `.word` gains no implicit padding. GNU RISC-V data directives emit at the current position. [GNU RISC-V directives](https://sourceware.org/binutils/docs/as/RISC_002dV_002dDirectives.html)

The initial GNU subset includes integer/string/floating data directives; `.quad/.dword/.8byte`; `.zero/.space` with optional byte fill; `.align/.p2align/.balign` with fill and maximum skip; supported named sections and section-stack operations; numeric local labels; bounded expressions and aliases; absolute and PC-relative address modifiers; and audited compiler pseudos. Unknown directives become errors in this profile.

Use independent logical sections, appending when a section is revisited. Place `.text` and `.text.*` at the configured Core text base. Place read-only families (`.rodata/.srodata/.rdata`), writable families (`.data/.sdata`), then zeroed families (`.bss/.sbss`), then common allocations at the Core data base. Order sections by first appearance within each family and honor their maximum required alignment. Read-only classification supplies layout, without promising new memory protection. Support validated `a/w/x/M/S` flags and `@progbits/@nobits`; retain mergeable bytes without deduplication. Reject conflicting attributes, TLS, groups/COMDAT, initialization arrays, and unknown allocatable sections. GNU section flags/types carry meaning and cannot be discarded indiscriminately. [GNU sections](https://sourceware.org/binutils/docs/as/Section.html)

Allow single-definition `.set/.equ` constants or aliases; reject reassignment and cycles explicitly. This is a bounded subset of GNU `.set`, which permits changing values. Keep `.eqv` substitution in the RARS path. [GNU `.set`](https://sourceware.org/binutils/docs/as/Set.html)

## Architecture and profile ownership

Keep assembly profile state on the program/assembler, separate from the Core's existing process-global RV32/RV64 state. Add immutable options through [RARS.java](../../emulators/risc-v/rars/src/main/java/app/specy/rars/RARS.java), [RISCVprogram.java](../../emulators/risc-v/rars/src/main/java/app/specy/rars/RISCVprogram.java), tokenizer, and assembler. Preserve the existing Java factory; add a distinct profile-aware export in [JsRiscV.java](../../emulators/risc-v/rarsjs/src/main/java/app/specy/rarsjs/JsRiscV.java) and an optional third options argument to the [TypeScript factory](../../emulators/risc-v/rarsjs/ts/src/index.ts). Existing calls select RARS.

For GNU mode, introduce explicit parsed statements, section fragments, expressions, symbols, and typed fixups. Parse and choose fixed pseudo expansions, lay out fragments, bind final addresses, resolve fixups, then emit memory and executable [ProgramStatements](../../emulators/risc-v/rars/src/main/java/app/specy/rars/ProgramStatement.java). Avoid writing provisional data or moving already-bound labels to repair implicit alignment. Labels before and after padding retain their actual section offsets.

Preserve original File path, line, token span, macro trace, and expansion provenance throughout. Padding also needs provenance: executable NOPs identify their alignment directive; data/raw padding contributes bytes without fabricated instructions. Keep the Core's assembly-to-instruction mapping distinct from the transient higher-level Source map.

Proposed persistence and precedence:

1. A new Compilation record's optional required `assemblerProfile` selects the profile for its Generated assembly Entry file and whole include unit.
2. Otherwise use an explicit RISC-V Project Setting for manual assembly.
3. Otherwise use `rars`, including old Compilation records and old saved Projects.

Validate every present profile before applying precedence. Only omission permits the legacy fallback: a malformed value or unsupported version in factory options, a required Compilation profile, or a manual Setting is an explicit error. Factory validation throws; Project/record normalization rejects invalid stored profiles with a format error. Do not let the existing Setting cleaner drop them into the default. Live checking and Build must also block on invalid profiles that reach them; no boundary substitutes RARS.

Do not infer mode from source text, extension, compiler ID, or a surviving Source map. Manual edits and map invalidation retain recorded provenance; removing the record restores the manual default. Diagnose conflicting required profiles within one include unit. Profile changes affect the next Build; a running Build snapshot retains its captured profile.

## Dependency-ordered milestones

### 0. Establish the corpus and build identity

Before changes, record submodule revision, package version, resolved import path, toolchain versions, profile, width, bases, and flags. Capture bounded offline GCC and Clang C/C++ output at O0/O2, plus compatible Rust assembly and the helper-dependent negative case. Include constants, functions, branches, pointers, strings, floating data, section revisits, and alignment. Preserve raw compiler output and Source map records beside any prepared output.

Check Node 24+, Maven, and a JDK capable of the actual POM source levels; the POMs currently mix source 16 and 15 despite `java.version=11`. Build the complete Java → TeaVM → TypeScript chain. Reproduce baseline probes against both installed and freshly built local artifacts. Exit when each corpus case has an intended success/error and unsupported ordinary output has been discussed instead of silently stripped.

### 1. Parse expressions, classify directives, and select sizes

Touch tokenizer, `TokenTypes`, [OperandFormat](../../emulators/risc-v/rars/src/main/java/app/specy/rars/assembler/OperandFormat.java), `Directives`, and [SymbolTable](../../emulators/risc-v/rars/src/main/java/app/specy/rars/assembler/SymbolTable.java); add focused helpers rather than more string substitutions.

Support integer literals, unary signs, parentheses, `+/-`, symbol-plus-addend, same-section symbol differences, and `.` at the statement's location. Preserve commas and empty optional operands. Resolve repeated numeric `N:` labels and nearest `Nb/Nf` references within the expanded assembly unit. Use exact integer arithmetic, initially Java `BigInteger`, with bounds before allocation or narrowing; verify TeaVM behavior.

Implement local/global visibility and singly defined weak symbols. Reject undefined weak symbols and competing definitions; allocate supported `.comm/.lcomm` with checked size/alignment, rejecting ambiguous duplicate commons initially. Validate `.type/.size` and visibility declarations. Explicitly classify debug-only metadata and discarded nonallocatable sections; references from runtime code/data into discarded material are errors. Unknown attributes/options and constructs requiring linker/runtime semantics remain errors.

Before milestone 2, choose fixed instruction sizes and GNU pseudo expansions from the width and resolvable operands. All operands determining fragment size or alignment, including reservation counts and alignment limits, must resolve without final layout. Reject unsupported layout-dependent counts or expansion sizes; introduce no iterative layout. Final symbol-valued payloads remain fixups. Exit with positive and negative parsing, binding, location, overflow, cyclic-alias, and size-selection fixtures, including alignment after a pseudo and a forward `.quad function`.

### 2. Build correct data and section layout

Emit integer payloads byte by byte in little-endian order, including unaligned directive placement. `.quad` emits eight bytes in both widths; repair symbol fixups before sharing `.dword` implementation. Validate literal, forward/backward symbol, addend, and difference cases, especially upper bytes. Apply explicit bounded truncation warnings to oversized integer literals; symbol/address overflow blocks Build. [GNU `.quad`](https://sourceware.org/binutils/docs/as/Quad.html)

Decode octal and hexadecimal escapes into raw bytes, including `0x80–0xff`; do not UTF-8 encode escaped numeric values. Unescaped text retains the repository's UTF-8 contract. Test embedded NUL, quote/backslash parity, multiple strings, terminators, malformed escapes, and exact following-label addresses. [GNU strings](https://sourceware.org/binutils/docs/as/Strings.html)

Align the current section, apply explicit fill, and suppress padding when required skip exceeds the third operand. Omitted data fill is zero; omitted code fill is four-byte NOPs. Support omitted fill with `,,max`. Bound exponents, counts, and memory growth. [GNU `.p2align`](https://sourceware.org/binutils/docs/as/P2align.html)

Separate text image bytes from executable statements for explicit code fill. NOP padding gets normal Step/Undo statements; reaching noninstruction padding errors explicitly. Audit the narrow emission/readback touchpoint in [Memory.java](../../emulators/risc-v/rars/src/main/java/app/specy/rars/riscv/hardware/Memory.java). Arbitrary executable-section data and `.insn` remain rejected. Stop if correct padding requires broader instruction-fetch/debug redesign.

Distinguish 64-bit values from addresses: mapped memory remains the Core's checked 32-bit address domain in RV64 too. Zero-extend mapped symbol addresses into eight-byte data; reject unsupported addresses before conversion. Exit only after byte, symbol, section-resumption, BSS, and boundary tests pass on both widths.

### 3. Resolve instructions, relocations, and options

Use the expansions selected in milestone 1; fixup resolution and encoding must not change their sizes. Audit GNU `li`, `la/lla`, `call/tail`, and address load/store pseudos for width, scratch-register clobbers, and range; preserve RARS templates in RARS mode.

Implement `%hi/%lo` and `%pcrel_hi/%pcrel_lo` as typed fixups for U, I, and S operands. A low PC-relative modifier names the label anchored at the matching high instruction, not the target or low instruction's PC; support separated pairs and multiple low users, rejecting missing/wrong anchors. [GNU modifiers](https://sourceware.org/binutils/docs/as/RISC_002dV_002dModifiers.html)

Require the paired high and low instructions to belong to the same logical section and the low relocation addend to be zero. Reject cross-section pairs and `%pcrel_lo(anchor+4)` explicitly; add negative fixtures for both. General symbol-plus-addend support does not relax these restrictions. [RISC-V psABI relocations](https://riscv-non-isa.github.io/riscv-elf-psabi-doc/#_relocations)

For `X=S+A` or `S+A-P_high`, calculate `high=(X+0x800)>>12` and signed `low=X-(high<<12)`. Check representability after splitting, RV64 sign-extension effects, branch/JAL ranges, and executable alignment before encoding. Test carry boundaries, negative distances, and both load/store forms. [RISC-V psABI relocations](https://riscv-non-isa.github.io/riscv-elf-psabi-doc/#_relocations)

Use fixed, unrelaxed output initially. Implement `.option push/pop`, `nopic`, `norvc`, and `norelax`; accept `relax` as permission that this profile does not exercise. Reject `pic`, `rvc`, unsupported `arch` changes, stack underflow, and incompatible architecture/stack attributes. GNU options affect generated code, so they need policy and validation. [GNU RISC-V directives](https://sourceware.org/binutils/docs/as/RISC_002dV_002dDirectives.html)

### 4. Carry the profile through the editor

Add strictly validated optional fields in [records.ts](../../src/lib/sourceCompilation/records.ts), [Project](../../src/lib/Project.svelte.ts), and [projectSettings.ts](../../src/lib/projectSettings.ts), including an enum-capable Setting with the explicit-error policy above. Add the resolved profile to [BuildSources](../../src/lib/projectFiles.ts) and preserve it through normalization, Entry-text probes, Testcases, snapshot creation, and [GenericEmulator](../../src/lib/languages/GenericEmulator.svelte.ts) equality checks. [WorkbenchSession](../../src/lib/workbench/WorkbenchSession.svelte.ts) must resolve it alongside Files and Entry.

Update [RISC-VEmulator](../../src/lib/languages/RISC-V/RISC-VEmulator.svelte.ts), including live checking and screen-label probes. Carry profile through [ProjectLanguageSession](../../src/lib/languages/service/ProjectLanguageSession.ts), worker [protocol](../../src/lib/languages/service/protocol.ts), [server](../../src/lib/languages/service/workers/projectWorkerServer.ts), and [MARS adapter](../../src/lib/languages/service/adapters/marsAdapter.ts). Profile-only changes increment revisions and invalidate analysis; stale responses cannot replace current Diagnostics.

In [compilerExplorer.ts](../../src/lib/sourceCompilation/compilerExplorer.ts), preserve supported RISC-V section syntax instead of flattening it to `.data/.text`; keep bounded debug removal, startup, and mapping composition. [compileProjectSource.ts](../../src/lib/sourceCompilation/compileProjectSource.ts) commits the profile with output/provenance transactionally. Keep MIPS preparation unchanged. Audit RISC-V [completion](../../src/lib/languages/RISC-V/RISC-V-language.ts), [grammar](../../src/lib/languages/RISC-V/RISC-V-grammar.ts), [Documentation](../../src/lib/languages/RISC-V/RISC-V-documentation.ts), and [assembly insights](../../src/lib/monaco/assemblyInsights.ts) for profile-aware promises and snapshot behavior.

Audit the supplied startup/test harness for the selected ABI's stack alignment, calls, saved registers, and return/exit behavior before claiming compiler execution support. This is a compilation-integration gate; assembly acceptance alone establishes no arbitrary ABI/runtime promise. Preserve educational RARS register defaults.

### 5. Validate and roll out

Keep manual/legacy defaults at RARS. Enable the GNU requirement for new RISC-V compilations only after the matrix passes; do not migrate existing Generated assembly automatically. Verify save/reload, sharing, archives, manual edits, stale inputs, and missing records without serializing Source maps. Publish packages only on separate user instruction.

## Verification and acceptance

Reference comparisons must use the same section bases/order, no relaxation/compression, and equivalent no-merge policy. Record GNU/LLVM versions, exact commands, and a fixture linker script matching Core placement. Compare bytes, symbols, relocation arithmetic, and observable execution; document legitimate pseudo encoding differences. CI consumes stored fixtures/oracles and requires no Compiler Explorer connection.

| Coverage                                                | Required outcome                                                                                                                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GCC and Clang C/C++ × RV32/RV64 × O0/O2                 | Assemble bounded fixtures; verify globals, pointer/string bytes, nested calls/stack frames, preserved registers and restored SP, return value, final PC/registers, and map locations using an audited startup/harness.      |
| Compatible `no_std` Rust assembly × both widths × O0/O2 | Positive helper-free fixtures assemble/run through a test harness; helper-dependent fixtures produce named unresolved-symbol errors.                                                                                        |
| Layout/relocations                                      | Exact bytes/addresses for mixed-width data, `.quad` pointers, padding/fill/max-skip, repeated sections, numeric labels, aliases, separated high/low pairs, and range boundaries.                                            |
| Unsupported/runtime cases                               | Errors for GOT/PLT, TLS, COMDAT, initialization arrays, compressed/vector forms, unsupported options, invalid anchors, undefined symbols, and unmapped/overflowing addresses.                                               |
| Profile validation                                      | Omission retains RARS; malformed/unsupported factory profiles error. Save/reload, sharing/archive import, live checking, and Build cover unsupported manual and required profiles, with no dropped requirement or fallback. |
| Existing educational programs                           | Default and explicit RARS preserve bytes, addresses, warnings, includes/macros, expansions, breakpoints, Step, Undo, and source identities.                                                                                 |
| Editor/debugger                                         | Build/live Diagnostics agree; profile-only changes reanalyze; snapshots remain fixed; expansions and padding retain provenance; Step/Undo restore PC, registers, memory, and mapped highlighting.                           |

Run widths sequentially within each Core process; its memory/register/width globals preclude concurrent instances. Extend the existing [package tests](../../emulators/risc-v/rarsjs/ts/test/) and [offline compilation tests](../../src/lib/sourceCompilation/compilerExplorer.test.ts). Planned commands from repository root:

```sh
node scripts/local-emulators.mjs status risc-v
npm run emulators:build:risc-v
npm --prefix emulators/risc-v/rarsjs/ts test
node scripts/local-emulators.mjs link risc-v
node scripts/local-emulators.mjs status risc-v
npm test -- src/lib/sourceCompilation src/lib/languages/service src/lib/projectSettings.test.ts
npm run check
npm run build
```

Use targeted lint/format checks and browser verification for affected integration paths. Linking changes local dependencies and clears Vite cache; preserve unrelated work and record the resolved artifact after linking. The root build has its search-model prerequisite. These are implementation checks to run, not claimed planning results.

## Discussion gates and completion

Discuss scope after corpus classification and before enabling new compilation defaults. Stop if ordinary required output needs excluded linker/runtime behavior, if reference placement cannot match the proposed layout, if TeaVM breaks exact arithmetic, or if padding requires broad execution changes. Adopt a bounded extension or explicit error; never convert such failures into ignored warnings. Treat weak/common merging and COMDAT as separate recorded extensions.

The earlier informal estimate of one to three focused weeks is tentative. Re-estimate after corpus and layout checkpoints; acceptance criteria determine completion. Finish this pass with a versioned supported-subset description, passing matrix, identified local artifact, and rollout evidence.

Then revisit Rust Source compilation: choose compatible Target features/ABI, entry/startup and panic policy, compiler presets, provenance, and source mapping. Inventory missing `core`/compiler-builtins helpers separately. A helper-dependent fixture must continue to fail clearly until explicit runtime work supplies it.
