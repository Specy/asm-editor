# x86 compiler assembly translation: implementation plan

Proposed on 2026-10-04; milestones 0–2 were implemented locally the same day and published in the Core's 3.0.0 release on 2026-10-05, as recorded in [x86 GCC Intel translation v1](./x86-gcc-intel-v1.md). The plan covers a translator from GCC's `-masm=intel` x86-64 output to NASM in `@specy/x86`, the package of the x86 **Core** (the [emulators/x86](../../emulators/x86/) submodule, package [blink-js](../../emulators/x86/blink-js/)), and x86 **Source compilation** built on it. The owner decided on 2026-10-04 that x86 keeps NASM, so no user's Build runs GNU as, and that the translator lives in the Core's package for other consumers, the editor included. It is the x86 counterpart of the GNU assembler profiles in [Source runtime](./source-runtime.md), a sibling of the [RISC-V plan](./risc-v-compiler-assembly-compatibility-plan.md), and the record of the x86 research of 2026-10-04 that the [runtime plan](./source-runtime-plan.md) cites. Milestones 0–2, the translator, are released; milestone 3, the editor, follows the Runtime library's x86 phase, and an [interim milestone 3](#3a-interim-compile-before-the-runtime-library) decided on 2026-10-05 ships it before then for self-contained programs. Vocabulary comes from [CONTEXT.md](../../CONTEXT.md); the decisions relied on are [ADR 0028](../adr/0028-persist-compilation-records-with-transient-source-maps.md), [ADR 0029](../adr/0029-hosted-programs-link-an-editor-owned-runtime-library.md), [ADR 0030](../adr/0030-cores-resolve-runtime-library-members.md), [ADR 0031](../adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md) and [Source compilation](./source-compilation.md).

## Goal and boundary

Translate GCC 14.2's x86-64 output into NASM that the Core assembles and links like hand-written Files, keeping the instructions, data bytes, symbols, sections and constructors the compiler intended, with provenance for every line, so the **Source map**, Step, Undo and **Diagnostics** work on x86 **Generated assembly**. Assembling cleanly is not the bar: a dropped `.init_array` entry or a misread x87 operand order yields a program that runs and returns the wrong value.

Version 1 translates one compiler output at a time: code, data, read-only data, zeroed and common storage, weak and alias symbols, C++ COMDAT flattened into ordinary sections, and `.init_array` kept as a section, with locations from `.file` and `.loc` (proposed; the spike used Compiler Explorer's `source` field). It never emits startup code. Outside version 1: GNU as in users' Builds; Clang, other GCC versions, Rust and AT&T syntax; inline assembly; position-independent code, thread-local storage, stack protection, exceptions, COMDAT selection, `.fini_array` and prioritized constructors; several translation units per compilation, which Source compilation defers; and the **Runtime library**'s content, ABI and linking. Blink computes `long double` at `double` precision ([libblink README](../../emulators/x86/libblink/README.md)).

## Verified baseline

A spike on 2026-10-04 used `@specy/x86` 2.7.0 from the registry (`node_modules`) in two modes of [assemblers.ts](../../emulators/x86/blink-js/src/assemblers.ts): `NASM_trunk` (NASM 3.00 as WebAssembly, GNU `ld` 2.43.50 in Blink) and `GNU_trunk` (GNU as and `ld` 2.43.50 in Blink). Compiler Explorer's GCC 14.2 (`cg142` for C, `g142` for C++) compiled the 25 programs of the [corpus manifest](#appendix-corpus-manifest) at O0 and O2 with the editor's raw-output filters and no `-Dmain` rename; the x86-64 Linux host also ran each linked ELF natively. A JavaScript prototype of about 300 lines, not a deliverable, produced the numbers; the rules and the unsupported list below are the specification.

| Check                      | Observed                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NASM_trunk`, untranslated | The fixture program at O0, prepared for GNU as: 25 errors, the first ``instruction expected, found `.intel_syntax noprefix'``. GCC's Intel output keeps GNU directives, `DWORD PTR`, `sym[rip]`, `OFFSET FLAT:` and `.L` labels.                                                                                                                                             |
| `GNU_trunk`                | C and C++ at O0 and O2, and AT&T syntax in an earlier capture, ran with debug material removed and `_start` prepended, at about 2 ms per line: 0.6–0.8 s per small program, 7.1 s to Build and 6.5 s to check the 2,832-line program. The editor would also need a per-Build assembler choice.                                                                               |
| Translated corpus          | The 44 runnable compilations return their expected values in Blink and natively (Blink 4755, native status 147). The 6 link failures stop with `ld` Diagnostics on Generated assembly lines naming `printf`, `__divti3`/`__modti3` and `operator delete(void*, unsigned long)`.                                                                                              |
| Against GNU as             | 38 of the 44 match a GNU as build. GNU as rejects the 2 `keywords` builds (a global `si`), which translate correctly (284); the 4 mixed C and NASM builds have no reference, since `GNU_trunk` assembles only the Entry file; link failures name the same symbols.                                                                                                           |
| NASM Diagnostics           | 100 translations, with and without a generated `_start`: no warnings; the only errors are "no `_start` to start from." where it is missing.                                                                                                                                                                                                                                  |
| Speed                      | Translating all 100 took 325 ms in Node. Builds take 0.4–0.9 s; the 2,667-line large program builds in 676 ms and checks in 156 ms.                                                                                                                                                                                                                                          |
| Debugging, fixture at O0   | NASM's DWARF maps each instruction to its translated line; 27 of 31 reach C lines through provenance and Compiler Explorer's `source` (4 belong to the prototype's `_start`). Breakpoints, Step ×3 and Undo ×3 work; the call stack names `main`.                                                                                                                            |
| Startup                    | With `.init_array` kept and a separate NASM unit calling each entry from `__init_array_start` to `__init_array_end`, then `main`, and exiting with its result, all 50 behave as expected (constructors: 42); without that loop a constructed global stayed 0, silently. A misaligned start ran in Blink but crashed natively: Blink does not fault on a misaligned `movaps`. |

x86 starts at `_start`, so it needs no `-Dmain=__asm_editor_main` rename ([compilerExplorer.ts](../../src/lib/sourceCompilation/compilerExplorer.ts)), which the entry-symbol work retires anyway. The spike found the rename harmful: it removes the implicit `return 0` of `main`, so a C++ `int main() { value++; }` hit `ud2` at O0 and crashed at O2 on the GNU route, and C at O0 returned 8.

Not verified: Clang and GCC versions other than 14.2 (deferred, gate 6); inline assembly (rejected in version 1, gate 4); and, scheduled in milestones 0 and 1, `-Os` and Runtime-library-style code, locations read from `.loc`, archive linking in Blink's `ld`, and comparisons beyond exit values.

## Proposed translation contract

### Input profile

`gcc-intel-v1` is GCC 14.2's x86-64 output under the flag groups below, given as lines of text; the groups are what the corpus is compiled with and what the profile constant lists. Other flags belong to the **Compiler driver** or the Runtime library, and one of those that changes generated code joins the corpus before the driver uses it. A missing `.ident`, or one naming anything but GCC 14.2 (the corpus reads `GCC: (Compiler-Explorer-Build-gcc--binutils-2.42) 14.2.0`), adds a warning that the compiler is unverified.

| Group       | Flags                                  | Reason                                                                                                                             |
| ----------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Translation | `-masm=intel`                          | The dialect the rules read.                                                                                                        |
| Translation | `-fno-pie`                             | Avoids `@PLT` and `@GOTPCREL`, which version 1 rejects; the Core links statically.                                                 |
| Translation | `-fno-stack-protector`                 | Avoids an `fs:` canary load and `__stack_chk_fail`.                                                                                |
| Translation | `-fcf-protection=none`                 | Some GCC builds enable control-flow protection by default, adding `endbr64` and a `.note.gnu.property` section.                    |
| Translation | `-fno-verbose-asm`                     | Version 1 reads no trailing comments.                                                                                              |
| Locations   | `-g1`                                  | Supplies `.file` and `.loc`; the corpus always used it.                                                                            |
| Target      | `-march=x86-64 -mtune=generic`         | Stays within Blink's ISA, which lists no AVX or SSE4.                                                                              |
| C           | `-std=c17`                             | Language level.                                                                                                                    |
| C++         | `-std=c++17 -fno-exceptions -fno-rtti` | Exceptions need unwind tables, and the translator drops call-frame information; the runtime's C++ support has no type information. |

The corpus covers O0 and O2; milestone 0 adds O1, O3 and Os, the editor's other levels, and `optimizations` lists those that pass. Outside the profile the driver passes `-O<level>`, `-fdiagnostics-color=never`, `-fno-section-anchors`, `-ffreestanding`, `-iquote <dir>` and `-I .`, and the runtime plan adds `-nostdinc -isystem sysroot/include`, plus `-nostdinc++ -fno-threadsafe-statics` for C++; of these, `-ffreestanding` and `-fno-threadsafe-statics` change generated code, so milestone 0 captures with both (the spike used only `-ffreestanding`).

### Output contract

- NASM 3.00 source for one ELF64 object, assembled with exactly the Core's arguments (`-g -F dwarf -felf64` in [wasm-assembler.ts](../../emulators/x86/blink-js/src/wasm-assembler.ts)), with no macros, `%include` or options.
- The header, in order: `default rel`, avoiding NASM 3.00's "implicit DEFAULT ABS is deprecated" warning (`asm/parser.c`); `[dollarhex off]` when a name is `$`-escaped, before any symbol directive, since `global`, `extern`, `common`, `static` and `required` share a parser that rejects escaped names under `$` hexadecimal (`asm/directiv.c`), which the prototype's `extern`-first order would trip; then an `extern` per symbol referenced or declared `.globl` but not defined, in order of first appearance, `:weak` if `.weak`. These NASM 3.00 sources are the ones [compile_wasm_nasm.sh](../../emulators/x86/compile_wasm_nasm.sh) downloads. If gate 8 adopts it, `CPU X64` precedes all of these lines.
- Every kept statement has one statement line carrying its input line, in input order, except that an alias label follows its target's label. Synthesized lines, such as the `section .bss`, `alignb` and section re-entry around a local common, carry the input line that required them; header lines carry none. Labels start at column 0, and everything else is indented four spaces.
- A pure function of the input lines and the profile id. All errors are collected in one pass and sorted by input line; any error means no output.
- The corpus output assembles with no NASM warnings.
- Within a profile version, the output changes only to fix a breach of this contract; new rules, constructs or compilers make a new version.

### Translation rules

Status: corpus (needed and verified by it), pass-through (NASM 3.00 accepts GCC's spelling, which the prototype rewrote; milestone 1 re-verifies), unexercised (absent from the corpus) or proposed (never run).

| GCC writes                                                                                          | NASM output                                                  | Status                                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| `BYTE`, `WORD`, `DWORD`, `QWORD`, `TBYTE`, `XMMWORD PTR`                                            | `byte`, `word`, `dword`, `qword`, `tword`, `oword`           | corpus                                 |
| `sym[rip+8]`; `values[0+rax*4]`                                                                     | `[rel sym+8]`; `[values+rax*4]`                              | corpus                                 |
| `OFFSET FLAT:sym+8`; `call [QWORD PTR [rbx]]`                                                       | `sym+8`; `call qword [rbx]`                                  | corpus                                 |
| `si[rip]`                                                                                           | `[rel $si]`                                                  | corpus (1)                             |
| `sar edx`; `st(1)`                                                                                  | `sar edx, 1`; `st1`                                          | corpus                                 |
| `fadd st, st(1)`; `fmulp st(1), st`; `fadd st(1), st`                                               | `fadd st1`; `fmulp st1`; `fadd to st1`                       | corpus (2)                             |
| `movabs`; `movsx r64, r32`; `rep movsq`                                                             | unchanged                                                    | pass-through; `rep` corpus             |
| `.L4`, `.LC0`                                                                                       | `L4`, `LC0`                                                  | corpus (3)                             |
| `.LFB*`, `.LFE*`, `.LBB*`, `.LBE*`, `.LVL*`, `.Ltext0`, `.Letext0`, `.Ldebug*`                      | dropped                                                      | corpus                                 |
| C names `add`, `div`, `abs`, `byte`, `rel`, `si`                                                    | `$add` and so on                                             | corpus (4)                             |
| `.file`, `.loc`, `.ident`                                                                           | dropped after giving locations and the warning               | corpus; locations and warning proposed |
| `.cfi_*`, `.intel_syntax`, `.size`, `.type` `@function` or `@object`, `.note.GNU-stack`, `.debug_*` | dropped                                                      | corpus                                 |
| `.hidden`; `.note.gnu.property`                                                                     | dropped                                                      | unexercised                            |
| `.text*`, `.rodata*`, `.data*`, `.bss*`; `.data.rel.ro*`                                            | `section .text`, `.rodata`, `.data`, `.bss`; `.rodata`       | corpus (5); unexercised                |
| `.section .init_array` then `.quad ctor`                                                            | `section .init_array` then `dq ctor`                         | corpus (6)                             |
| The largest alignment in a section                                                                  | `align=` on its first declaration                            | corpus                                 |
| `.byte`, `.long`, `.quad`; `.value`, `.short`, `.word`, `.int`                                      | `db`, `dd`, `dq`; `dw`, `dw`, `dw`, `dd`                     | corpus; unexercised                    |
| `.zero N`                                                                                           | `resb N` in `.bss`, otherwise `times N db 0`                 | corpus in `.bss` only                  |
| `.string`; `.asciz`, `.ascii`                                                                       | backquote strings (7)                                        | corpus; unexercised                    |
| `.align N`; `.p2align N`, meaning 2^N bytes                                                         | `align` in data, `alignb` in `.bss`; in code see (8)         | corpus, except `.p2align` outside code |
| `.local x` then `.comm x,4,4`; `.comm x,4,4`                                                        | `alignb 4` and `x: resb 4` in `.bss`; `common x 4:4`         | corpus; unexercised                    |
| `.globl x`; `.weak x`                                                                               | `global x`; `global x:weak`, or `extern x:weak` if undefined | corpus                                 |
| `.globl x` with `x` undefined                                                                       | `extern x` in the header                                     | proposed (9)                           |
| `.set A,B`                                                                                          | `A:` after `B:`                                              | corpus                                 |
| A symbol used but not defined                                                                       | `extern` in the header                                       | corpus                                 |

1. A token before `[` or after `OFFSET FLAT:` is a symbol, whatever its spelling.
2. NASM 3.00 rejected every two-register spelling tried (`fadd st0, st1`, `fadd st1, st0`, `faddp st1, st0`, `fmulp st1, st0`, `fsub st0, st1`, `fsubr st1, st0`, `fcomip st0, st1`, `fucomi st0, st1`, `fxch st1, st0`): `x86/insns.pl` turns their `fpu0` operand into a register-or-memory zero no x87 register matches. So `fop st, st(i)` becomes `fop sti`, `fopp st(i), st` becomes `fopp sti`, and a non-popping `fop st(i), st` becomes `fop to sti`; GCC's order matched NASM's meaning on the corpus, and the translator accepts exactly the forms milestone 1's x87 matrix verifies.
3. NASM scopes a `.`-prefixed label to the previous ordinary label, and GCC uses `.LC0` across functions. `.Lname` becomes `Lname`, with `_` prepended until it differs from every name the unit defines or references.
4. `$` escapes names NASM reads as an instruction, register, keyword, directive or standard macro, from a table generated like the editor's (`scripts/x86-docs/sources.mjs`): the expanded mnemonics in `x86/insnsn.c`, `asm/tokens.dat` and `x86/regs.dat`, which are NASM's own token sources, plus `asm/directiv.dat` and `macros/standard.mac`.
5. NASM's ELF output has no section groups (`output/outelf.c`), so COMDAT flattens; the corpus's COMDAT definitions are `.weak`.
6. NASM types `.init_array` as `SHT_INIT_ARRAY`, and in the spike's static link `ld` provided `__init_array_start` and `__init_array_end`.
7. GNU and NASM strings share C escapes; a literal backquote is escaped, and `.string` and `.asciz` add `, 0`.
8. In code, an `.align N` or a `.p2align N` without a maximum skip is kept as `align` when a label other than a `.L` label comes before the next instruction, section switches included (GCC's hot and cold function parts): C++ pointers to member functions use the low bit of the address (GCC writes `.align 2` before member functions), and `aligned(N)` functions promise their alignment, while the padding follows a `ret` or `jmp` and never runs. Loop alignment, with a maximum skip or followed by an instruction first, only affects speed and is dropped, which keeps Step free of NOP runs. The first version of this rule dropped all code alignment; review found it broke pointer-to-member calls.
9. Symbol directives apply wherever they appear, even inside a dropped debug section, where GCC writes `.globl __divti3` in `int128` and the prototype dropped it. `.weak __cxa_pure_virtual` appeared only in a link-failure program, which never ran.

### Unsupported constructs

Everything outside the rules is an error at its input line, never a silent drop or a guess: inline assembly between `#APP` and `#NO_APP` (gate 4); other directives (`.rept`, `.org`, `.symver`, `.uleb128` outside a dropped section) and sections (`.tdata`, `.tbss`, `.fini_array`, `.preinit_array`, `.init_array.N`, `.ctors`, `.dtors`); relocation operators (`@PLT`, `@GOTPCREL`, `@TPOFF`) and `fs:` or `gs:` operands; a `.type` other than `@function` or `@object`, since dropping `@gnu_indirect_function` would call the resolver (`@gnu_unique_object` awaits gate 7), and visibility other than `.hidden`; a `.set` that is not an alias of a label in the same output; expressions beyond an integer, a symbol, or a symbol plus or minus an integer; operand shapes the corpus did not show and x87 forms outside milestone 1's matrix; numeric labels; several statements on one line; maximum-skip alignment outside code; an executable-stack request (`.note.GNU-stack` with the `x` flag); a control character other than tab inside a line (`unreadable-line`); trailing comments; and a bare operand spelled like a register when the unit has a symbol of that name (`call si`), which GCC's Intel output leaves ambiguous and GNU as rejects too.

## Architecture and package ownership

### Module and subpath export

The translator is a new directory of the Core's package, `blink-js/src/compiler-output/` (proposed), in TypeScript that imports nothing from the wasm modules, [blink-runtime.ts](../../emulators/x86/blink-js/src/blink-runtime.ts) or `wasm-assembler.ts`, so it runs in Node, browsers and workers without instantiating anything. It ships as the subpath `@specy/x86/compiler-output` (proposed). [tsdown.config.ts](../../emulators/x86/blink-js/tsdown.config.ts) has one entry, [index.ts](../../emulators/x86/blink-js/src/index.ts), and one custom export, `.`, whose bundle inlines `blinkenlib.wasm`; a second named entry and a `./compiler-output` key keep the Compiler driver and the offline runtime build free of the emulator, and the root export stays as it is. The package README that npm shows ([blink-js/README.md](../../emulators/x86/blink-js/README.md)) and the [repository README](../../emulators/x86/README.md) document it. Releases are minor versions through the existing tag-triggered [cd.yml](../../emulators/x86/.github/workflows/cd.yml) on the default branch `libblink`, on the owner's instruction only. The workflow's header comment that publishing awaits trusted-publisher registration is out of date: the package has been released through it since 2.4.0.

### API sketch

Names are proposals (gate 2).

```ts
// @specy/x86/compiler-output

export type TranslationProfileId = 'gcc-intel-v1'

export type TranslationProfile = {
    readonly id: TranslationProfileId
    /** A missing or different `.ident` adds a warning, never an error. */
    readonly compiler: { readonly name: 'GCC'; readonly version: '14.2'; readonly target: 'x86-64' }
    /** The groups of the profile table; driver and runtime flags are not part of it. */
    readonly flags: {
        readonly translation: readonly string[]
        readonly locations: readonly string[]
        readonly target: readonly string[]
        readonly language: { readonly c: readonly string[]; readonly cpp: readonly string[] }
    }
    readonly optimizations: readonly ('0' | '1' | '2' | '3' | 's')[]
}

export declare const GCC_INTEL_V1: TranslationProfile

/** From the compiler's own `.file` and `.loc`. */
export type CompilerLocation = {
    /** The `.file` name as written, such as `src/main.c` or `/app/values.h`. */
    readonly file: string
    readonly line: number
    readonly column: number
}

export type TranslatedLine = {
    readonly text: string
    /** Zero-based input line; null in the header. */
    readonly inputLine: number | null
    readonly synthesized: boolean
    /** Instructions only. */
    readonly location: CompilerLocation | null
}

export type TranslationDiagnostic = {
    readonly severity: 'error' | 'warning'
    readonly code:
        | 'unsupported-directive'
        | 'unsupported-section'
        | 'unsupported-operand'
        | 'unsupported-symbol'
        | 'unsupported-instruction'
        | 'inline-assembly'
        | 'ambiguous-register-name'
        | 'unverified-compiler'
        | 'unreadable-location'
        | 'unreadable-line'
    readonly message: string
    /** Zero-based. */
    readonly inputLine: number
    /** One-based, when a token can be pointed at. */
    readonly column?: number
    readonly location: CompilerLocation | null
}

/** `name` as the compiler wrote it; `nasmName` as the output spells it, `$`-escaped if reserved. */
export type TranslatedSymbol = { readonly name: string; readonly nasmName: string }

export type SymbolSummary = {
    readonly defined: readonly (TranslatedSymbol & { readonly binding: 'global' | 'weak' })[]
    readonly common: readonly TranslatedSymbol[]
    readonly external: readonly (TranslatedSymbol & { readonly weak: boolean })[]
    /** `.init_array` entries, in order. */
    readonly constructors: readonly TranslatedSymbol[]
}

export type TranslationResult =
    | {
          readonly ok: true
          readonly text: string
          readonly lines: readonly TranslatedLine[]
          readonly symbols: SymbolSummary
          readonly diagnostics: readonly TranslationDiagnostic[]
      }
    | { readonly ok: false; readonly diagnostics: readonly TranslationDiagnostic[] }

/** Throws only for an unknown profile id; everything about the input is a Diagnostic. */
export declare function translateCompilerOutput(
    input: readonly string[],
    options: { readonly profile: TranslationProfileId }
): TranslationResult
```

The profile is passed by id, so two installed copies of the package agree. A location comes from the last `.loc` in the current section, its file number resolved through `.file N "name"`, the form the corpus uses for every file `.loc` references (such as `.file 1 "src/main.c"` and `.file 2 "/app/values.h"`); the two-string form, seen only as the unreferenced `.file 0 "/app" "/app/example.c"`, resolves to its second string. `discriminator`, `is_stmt` and `view` options are ignored. Instructions carry the current location; labels, data and synthesized lines carry none; a section directive or `.cfi_endproc` clears it. A `.loc` with an undeclared file or an unknown option is a warning and leaves no location. A Diagnostic without a location, such as one for a `__thread` variable in `.tbss`, is shown on the source File's first line.

### What stays in the editor

The Compiler driver stays in the editor: the Compiler Explorer transport and request (`cg142`, `g142`, the profile's flag groups and the driver's and runtime's flags), header upload, mapping compiler file names to Project paths (`projectPath` in `compilerExplorer.ts`), and composing the Source map from `location`. So do the **Compilation record** and the Workbench UI. The package's published API names no compiler service, as CONTEXT.md's Compiler driver rule requires; only its fixtures, capture script and tests refer to Compiler Explorer.

## Requirements handed to the Runtime library's x86 phase

Linking **Hosted programs** on x86 belongs to the x86 phase plan that the runtime plan announces: the syscall layer, `crt0`, member packaging and the Core changes below. This plan supplies the translator and these requirements, in that plan's terms.

1. `libraries: [{ members, index }]` and `BuildSources.libraries`. An x86 **Library member** needs its NASM text, shown read-only and named in DWARF, and an object assembled by NASM 3.00 with the Core's arguments, which the existing `ld` step links as an archive ("Targets and order" in Source runtime). Today `ld` gets only the Project's objects (`/linker <objects> -o /program` in `assemblers.ts`), and `x86ProjectSourcePath` in [project.ts](../../emulators/x86/blink-js/src/project.ts) maps unknown DWARF paths to the Entry file. Recommendation: the offline build writes the archive with its own `ar`, so the Core needs no archive writer; member DWARF paths map to member identities; milestone 0 probes Blink's `ld`.
2. `entrySymbol`. x86 starts at `ld`'s default entry, `_start`, so `entrySymbol: '_start'` for Generated assembly must mean linking `crt0` and starting there, and `entryPointDiagnostics` in `blink-runtime.ts`, which counts only Project units, must count `crt0`'s `_start`. Recommendation: link `crt0` as an ordinary object, so a user `_start` is a duplicate-definition error rather than, under archive semantics, a silent winner. Pass the Project's objects first, then `crt0`, then the archive, so user units come first in every section, as Source runtime's "Program start and layout" requires.
3. The Core's build-time index API reads a NASM unit's defined and referenced globals from its object, through milestone 1's symbol-table reader. ADR 0030 builds the index with `nm`, while the runtime plan has this API report it. Either way the translator's symbol summary must equal it, as milestone 1 tests; the runtime owners decide which governs.
4. The offline build: Source runtime uses a pinned cross toolchain, the runtime plan the Compiler driver. Either way the translator needs GCC 14.2 under the profile, with the `.ident` warning flagging anything else, and reads `.loc` (gate 3); the runtime owners decide.
5. Live checking with the same libraries as Build (Source runtime's "Language service"; ADR 0030's single path). x86 `checkProject` skips linking, which costs about 450 ms by the Core's own comment. Recommendation: measure linking during checks on the corpus before adding an index-based resolution that must agree with `ld`.
6. Syscalls. Version 1 rejects `#APP` blocks (gate 4), and the runtime plan's RISC-V layer uses inline-assembly wrappers. Recommendation: hand-written NASM members for x86's syscall wrappers; a bounded Intel-syntax inline-assembly subset can follow as a profile version if needed.
7. Every source File links: each `.asm`, `.s` or `.nasm` File is a unit (`x86TranslationUnitCandidates` in [translation-units.ts](../../emulators/x86/blink-js/src/translation-units.ts)) unless another `%include`s it (`scanIncludedFiles` in `wasm-assembler.ts`), and Generated assembly is `<source>.asm`, so it joins every Build of its Project, unlike CONTEXT.md's Entry file definition:
    - The default Project's `main.asm` defines `_start`, so with Generated assembly as the **Entry file** a Build passes today's entry check and starts in `main.asm`, never calling `main`; requirement 2 makes this a duplicate-definition error (gate 9).
    - Two compiled sources give two `main`s: a duplicate-definition error.
    - A hand-written `_start` calling compiled C++ runs no constructors, as the spike saw. Recommendation: warn when a Build without `crt0` links a non-empty `.init_array`.
    - Generated assembly needs the library in every Build of its Project, while the runtime plan enforces a record's `runtimeAbi` "over the Setting for that Entry". Recommendation: enforce it for every Build of a Project holding that Generated assembly.

    Superseded on 2026-10-05 by [ADR 0033](../adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md): x86 links the Entry's unit and takes the other Files from an archive only as the program needs them, so the first two cases arise only when a File is linked for another symbol it defines. The last two stand.

## Dependency-ordered milestones

### 0. Re-capture the corpus and probe the unknowns

A capture script, the package's only contact with Compiler Explorer, compiles the [corpus manifest](#appendix-corpus-manifest) with `cg142` and `g142` at O0, O1, O2, O3 and Os, storing per case the source, headers, compiler id, flags, raw response lines, date and intended outcome (for example in `tests/fixtures/gcc-intel-v1/`), with the package version, submodule revision and NASM and `ld` versions. New cases: inline assembly; a `__thread` variable; an ifunc; a prioritized constructor; a function named like a register and called directly; C++ template static data and inline-function statics (`@gnu_unique_object`, gate 7); C++ function-local statics, which `-fno-threadsafe-statics` compiles without guard calls; `-fcf-protection=full`; and Runtime-library-style code at O2 and Os (a quicksort, a `strtol`, a variadic formatter), written for the corpus rather than copied from musl, so no third-party licence is needed. Probes: whether Blink's `ld` extracts only the needed member of an archive that the host's `ar` builds from two NASM objects, and whether `-u _start` forces one in, through a test assembler mode whose `link` command adds the archive (for the runtime's x86 phase); whether `CPU X64` rejects SSE4.1 and AVX samples while the corpus assembles (gate 8); and whether NASM and Blink accept `endbr64`. Exit when every case has an intended outcome and every directive, section, operand shape and mnemonic in the captures is classified as translated, dropped for a stated reason, or rejected; an ordinary construct that fits none is a discussion point.

### 1. Implement the translator and its oracles

Implement the rules in `src/compiler-output/`: a statement and operand parser, a pass collecting definitions, globals, weak symbols, aliases, local commons, constructors and section alignment, and an emitting pass with provenance, plus locations, the `.ident` warning, the symbol summary and the generated reserved-name table. Add an ELF symbol-table reader (every symbol's name, value, size, binding, type and section) beyond `readDefinedGlobalSymbols` in [elf-symbols.ts](../../emulators/x86/blink-js/src/elf-symbols.ts); the oracles need it, and the runtime's index API can reuse it. The oracles run in CI on stored data:

- Each corpus case reaches its intended outcome in Blink and natively, with no NASM warnings.
- Locations equal Compiler Explorer's `source` on every kept instruction line once its `/app/` directory is stripped as `projectPath` does; lines it leaves unmapped have none.
- The symbol summary equals the object's global, weak, common and undefined symbols; translation is byte-identical across runs; each negative case reports its code at its line, with no output.
- GNU as comparison (gate 1). At capture time, a test assembler mode prepares GCC's output for GNU as with an equivalent start, keeps local labels (`-L`) and clears merge flags from section directives, so `.LC*` literals, constants and jump tables keep their bytes and symbols and no string is merged away. The capture stores that reference executable with a table from each instruction address to its input line (read through `getCompiledInstructions`), so CI loads it with `loadElf` and never runs GNU as. Data symbols, local labels included, must match byte for byte, a label without a size spanning to the next symbol in its section, with `.Lx` matched to `Lx` through the translator's renaming; a differing pointer-sized word passes when both builds resolve it to the same symbol plus offset. Stepping both builds in Blink must visit the same input lines, skipping the start and the reference's alignment padding, with equal registers and flags, comparing data addresses as symbol plus offset and code addresses, the instruction pointer included, as input lines.
- The x87 matrix: `fadd`, `fsub`, `fsubr`, `fmul`, `fdiv` and `fdivr`, popping and non-popping, with `st(0)` as destination and as source, each a small GNU-syntax input whose operands (10 and 4, say) give a different result in each order, checked natively and against a reference build captured and stored like the corpus's. Assemblers have historically disagreed about non-commutative forms with an `st(i)` destination, so no form is inferred from the corpus.

Exit when every oracle passes, or all but the GNU comparisons if gate 1 rules GNU as out.

### 2. Package, document and release

Add the subpath entry, the export and the README sections. [dist-smoke.mjs](../../emulators/x86/blink-js/tests/dist-smoke.mjs) imports the built subpath with `WebAssembly` replaced by a stub that throws, translates a fixture, and compares the root module's export names with a list recorded from the 2.7.0 build. The corpus runs in the existing [CI](../../emulators/x86/.github/workflows/ci.yml), whose `ubuntu-24.04` x86-64 runner executes each linked ELF natively; native tests skip visibly elsewhere. Exit with CI passing on the version to be released.

### 3. Integrate x86 Source compilation in the editor

Written against the `CompilerDriver` interface that the runtime plan's milestone 4 extracts from `compilerExplorer.ts` (deleting the wrapper and `-Dmain` for every Target), and enabled after the Runtime library's x86 phase; development can start on the local package (`npm run emulators:build:x86`, `npm run emulators:local -- x86`) with a test-only start unit.

- [records.ts](../../src/lib/sourceCompilation/records.ts): `'X86'` joins `CompilationTarget` and the Targets `cleanCompilationRecords` accepts, and `generatedAssemblyPath` already gives `<source>.asm`. x86 records carry no `assemblerProfile`, so `compileSource`'s tagging of every non-MIPS Target becomes RISC-V-only; no translation-profile field, since recompilation uses the current profile; and `runtimeAbi` once the runtime adds it.
- The driver's x86 preset combines `cg142`, `g142`, the profile's flag groups and the driver's and runtime's flags. Its output preparation calls the translator, builds the Source map from `location` through `projectPath`, places translation Diagnostics on the mapped source line, and requires `main` in the symbol summary instead of today's label search.
- Build, live checking and the language worker keep `NASM_trunk` in [X86Emulator.svelte.ts](../../src/lib/languages/X86/X86Emulator.svelte.ts) and [x86Adapter.ts](../../src/lib/languages/service/adapters/x86Adapter.ts), gaining `BuildSources.libraries` and `entrySymbol` from the x86 phase; [compileProjectSource.ts](../../src/lib/sourceCompilation/compileProjectSource.ts) names x86 in its message; the optimization selector offers the profile's `optimizations`.
- Tests: x86 fixtures beside the MIPS and RISC-V ones in [fixtures](../../src/lib/sourceCompilation/fixtures/) (the same program in C and C++ at O0 and O2) run in [compilerExplorer.test.ts](../../src/lib/sourceCompilation/compilerExplorer.test.ts) through the real Core: Compile from the stored response, Build, Step onto a mapped line, Run to exit 20, Undo. The package corpus is imported from the submodule with an asserted minimum count, since `import.meta.glob` finds nothing without submodules, and records without `assemblerProfile`, persistence, sharing, archives and stale and manual-edit invalidation are covered.

Rollout: editor CI and deployments use registry packages ([local-emulators.md](../local-emulators.md)), and 2.7.0 has no subpath, so this work merges with the Core release and the dependency update. Keeping `'X86'` out of `isCompilationTarget`, which gates [ExecutionControls.svelte](../../src/components/specific/workbench/ExecutionControls.svelte), [EditorGroup.svelte.ts](../../src/lib/workbench/EditorGroup.svelte.ts) and `compileProjectSource`, keeps x86 Compile unavailable until the x86 phase lands. Existing x86 Projects have no Compilation records and are unaffected. Exit when the suite passes against the released package and Compile, Build, Step, Undo and source highlighting work in the browser. Milestone 3a below supersedes the rollout: `'X86'` is a Compilation target before the x86 phase.

### 3a. Interim: Compile before the Runtime library

Decided on 2026-10-05: x86 Compile ships before the Runtime library's x86 phase, for self-contained programs, with a start unit of the editor's own standing in for `crt0`. Milestone 3 above is built as described, so the x86 phase adds to it rather than replacing it; only the start unit is temporary. Two departures: `'X86'` joins `isCompilationTarget` now, and the editor's x86 tests are four stored compilations (the same program in C and C++ at `-O0` and `-O2`) rather than the package corpus, which the Core's own suite runs.

- **Programs.** Self-contained C and C++: no library calls, so no input or output except through hand-written NASM Files the program calls. They compile exactly under the corpus's flags: the profile's groups, `-ffreestanding`, `-fno-section-anchors`, `-fno-threadsafe-statics` for C++, and the driver's `-nostdinc -isystem sysroot/include`. GCC 14.2 keeps `main`'s implicit `return 0` under `-ffreestanding`, in C and C++ (checked on Compiler Explorer). GCC only: x86 offers no Clang (gate 6).
- **Headers.** Runtime ABI v1's freestanding headers only: `stddef.h`, `stdint.h`, `stdbool.h`, `stdarg.h`, `limits.h`, `float.h`, `iso646.h`, `stdnoreturn.h`, and C++'s `cstddef`, `cstdint`, `climits`, `cfloat`, `cstdarg` and `new`. They are written on GCC's predefined macros, so they describe x86-64 as they are. Including any other standard header is a compile error that says what x86 provides, rather than a link failure later. The x86 phase uploads the whole set, a superset.
- **Start unit.** Two NASM Files written for the editor, `@runtime/start.asm` with `_start` and `@runtime/support.asm` with the rest, offered to every x86 Build of a Project that holds Generated assembly whose record requires no Runtime ABI. The linker takes `start.asm` only for a program without a `_start` of its own, so it starts a Build whose Entry is Generated assembly, and `support.asm` for what the program uses of it, `start.asm`'s call to its `__aed_run_destructors` included ([ADR 0033](../adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md)). Two Files, because a linker takes a unit whole: a hand-written `_start` that calls compiled code needing `memcpy` must not get a second `_start` with it. `start.asm` follows the `crt0` steps of the [platform contract](../../runtime/PLATFORM.md): `rsp` aligned to 16 bytes, `.init_array` in order, `main(0, NULL)`, the `__cxa_atexit` destructors newest first, then `exit_group` with `main`'s result. It also defines, weak, what GCC's output calls without the program asking: `memcpy`, `memmove`, `memset` and `memcmp`, which GCC requires of a freestanding environment (`b = a` on a 16 KiB struct calls `memcpy` at `-O0` and `-O2`), and the C++ ABI's `__cxa_atexit` (64 static destructors; any beyond do not run), `__dso_handle`, `__cxa_pure_virtual` and `__cxa_deleted_virtual`, which print the Runtime library's messages and exit with 134 as its `abort` does, and `operator delete` in its plain, sized and aligned forms (`_ZdlPv`, `_ZdlPvm`, `_ZdlPvSt11align_val_t`, `_ZdlPvmSt11align_val_t`), which do nothing because nothing allocates; a class with a virtual destructor refers to one whether or not anything is deleted, and at `-O0` an aligned class or a deleted virtual function brings in the others. The string functions use `rep movsb` and `rep stosb`, which Blink records as one undoable write of up to 64 KiB. The path is under `@runtime/`, so the debugger shows the unit read-only and Just My Code steps through it like a Library member, and a Project File under `@runtime/` blocks the Build, as it does when the Runtime library links.
- **Build sources.** `entrySymbol: '_start'` without a `runtimeAbi` asks the x86 adapter for the start unit, which the Build, live checking and the language worker hand the Core as library units, or as Files to a 3.x Core, which links every File. With a Runtime ABI, the x86 phase links its `crt0` instead.
- **Records.** `target: 'X86'`, with no `assemblerProfile` and no `runtimeAbi`. An x86 record that names a Runtime ABI, as a later editor will write, blocks the Build until the source is compiled again.
- **Starting in user code.** As for compiled MIPS and RISC-V programs, a Build runs the start code outside the Undo history up to `main` or the first constructor, and a Step through library code is undone whole. That needs two Core methods, named as in RARS, `setUndoEnabled` and `getUndoDepth`, and a third, `getRecordedEntryCount`, which counts what the history has recorded, so that a Run slice reports the instructions it ran however it ended and even when the history is full. `@specy/x86` 4.0.0 has them. The editor detects them; on a Core without them it records the start code and keeps it behind a floor of its Undo ledger, so a Build still stops in `main`, though a Step through start-unit code cannot be undone there, since a Step undone whole needs `getUndoDepth`. Turning undo off keeps the wasm recording, since its history is also what tracks the call stack, and turning it back on sets an undo floor at the newest entry: nothing at or below it can be undone, counted or listed. `main` therefore stays on the call stack, as RARS keeps it for RISC-V, and the start code never appears in the History panel.
- **Undo of compiled code.** GCC's output reached two limits of Blink's Undo capture that hand-written programs rarely did, and either made a step irreversible, so Undo stopped there. The first store into a page the program had not yet touched, such as a `.bss` array or a newly grown stack page, captured no old bytes. A string instruction over 16 elements (`rep stosq` for `int a[100] = {0}` at `-O0`, struct copies) needed more write records than the 16 a step keeps. The Core now pages a reserved page in before capturing its old bytes, and merges the contiguous writes of one instruction, upward or downward, into one record of up to the 64 KiB a step can capture. Bigger captures made a loop of large clears able to fill the wasm heap, so the history keeps 256 MiB of captured bytes at most: past that, its oldest entries keep only their header and can no longer be undone, while the history still counts one entry per step.
- **The `_start` clash (gate 9).** Settled by [ADR 0033](../adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md): the Entry's unit links, and the other Files only as the program needs them, so a default Project's `main.asm` stays out of a Build whose Entry is Generated assembly, and setting it as the Entry runs it instead. A second `_start` or `main` arises only when a File that defines one is linked for another symbol the program uses. The link error lands in that File, once the Core reads `ld`'s `file:line: multiple definition` form, on the instruction after the label, since `ld` locates a symbol by its address, and it carries a Hint. On a 3.x Core, which links every File, a default Project's first compiled Build still fails that way, with the error on the Entry's first line in `ld`'s raw text. Because x86 live checking does not link, a failed Build's diagnostics now stay in Problems until the Files change, for every Target; before, a link error appeared only in a toast. For the other Targets a Build's assembler errors duplicate live checking's and are dropped.
- **Not breaking later.** A record without a Runtime ABI keeps the start unit after the x86 phase lands, and the start unit does what `crt0` will for a program that calls no library function. Compiling such a source again moves it to the x86 phase's hosted flags and full headers, a superset. Only then does the _Link Runtime library_ Setting apply to x86, and new records carry `runtimeAbi`. A Project holding records of both kinds must link the Runtime library and its `crt0` and no start unit, a requirement on the x86 phase: both define `_start`, and the start unit's weak string functions would keep the library's members out.

## Verification and acceptance

Acceptance is the exit criteria of milestones 0–3; CI uses stored captures and never contacts Compiler Explorer.

| Concern                                                         | Checked in                      |
| --------------------------------------------------------------- | ------------------------------- |
| Corpus outcomes in Blink and natively; no NASM warnings         | Milestone 1                     |
| Locations, symbol summary, determinism, negative cases          | Milestone 1                     |
| Data bytes, instruction traces and x87 forms against GNU as     | Milestone 1, under gate 1       |
| Archive extraction, `CPU X64`, `endbr64`                        | Milestone 0 probes              |
| Subpath without WebAssembly; root export unchanged              | Milestone 2                     |
| Editor compilation, records, Source map, persistence, debugging | Milestone 3                     |
| Linking, start, constructors, live-check parity                 | The Runtime library's x86 phase |

Timings are measurements recorded per release, not CI assertions: translation of the largest corpus file against NASM's check of it, and Builds against the spike's 0.4–0.9 s. Planned commands from the repository root; linking swaps in a symlink and clears Vite's cache, and `npm run emulators:registry` restores the registry packages:

```sh
npm --prefix emulators/x86/blink-js ci
npm --prefix emulators/x86/blink-js run type-check && npm --prefix emulators/x86/blink-js test
npm --prefix emulators/x86/blink-js run build && npm --prefix emulators/x86/blink-js run test:dist
npm run emulators:local -- x86 && npm run emulators:status -- x86
npm test -- src/lib/sourceCompilation src/lib/languages/X86 && npm run check && npm run build
```

## Discussion gates and completion

Open decisions, each with a recommendation; the requirements above carry their own. Proposed rather than open: the `.ident` warning, records without a translation-profile field, the selector following the profile, the trace comparison and the `isCompilationTarget` switch.

1. GNU as as an oracle, which the owner prefers not to run: in CI, at capture time with stored results, or never, losing milestone 1's byte, trace and x87 comparisons. Recommendation: capture time only, through `GNU_trunk`'s binaries in Blink, whose `ld` is the one Builds use.
2. Names. Recommendation: `@specy/x86/compiler-output`, `translateCompilerOutput` taking a profile id, and `GCC_INTEL_V1`, none re-exported from the root.
3. Locations: `.loc`, or Compiler Explorer's `source` through provenance, as in the prototype. Recommendation: `.loc`, because a distributed package's consumers only have the compiler's directives and CONTEXT.md's Compiler driver rule keeps everything outside the driver independent of the compiler service; Compiler Explorer's field stays a test oracle.
4. Inline assembly: reject it, translate it by the same rules, or accept a subset. Recommendation: reject it in version 1, since it may hold any GNU construct while the rules are verified only on compiler output; requirement 6 keeps the runtime off it.
5. Standalone startup. Recommendation: a README example of the spike's start unit, on the 16-byte-aligned stack Linux provides, not exported code.
6. Clang and other GCC versions. Recommendation: later profile versions after their own corpus runs; Clang is untried.
7. `@gnu_unique_object`: translate it as `@object`, keeping its weak binding, which is equivalent in a static link, or add `-fno-gnu-unique`. Recommendation: the rule if milestone 0 shows GCC always pairs it with `.weak`, otherwise the flag.
8. The instruction set: SSE4 or AVX from intrinsics or target attributes would translate and fail only when Blink runs them. Options: `CPU X64` in the header (NASM documents its `CPU` checks as incomplete), generated `unsupported-instruction` errors for mnemonics whose every form needs an extension Blink lacks, or nothing. Recommendation: `CPU X64` if milestone 0's probe passes, otherwise the generated check.
9. Generated assembly always links (requirement 7). Options: keep the rule, which lets C and NASM call each other (`callsasm`, `asmcallsc`), with a Hint naming the File behind a second `_start` or `main` and a warning at Compile when another unit defines `_start`; or exclude non-Entry Generated assembly, which needs a Core option and stops NASM calling compiled C. Either way a default x86 Project's first Compile fails to Build until `main.asm` goes or its `_start` is renamed, since `crt0` defines `_start`. Recommendation: keep the rule, with the Hint and the warning. Decided on 2026-10-05 as recommended, for the [interim milestone 3](#3a-interim-compile-before-the-runtime-library), then superseded the same day by [ADR 0033](../adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md), which links the Entry's unit and takes the other Files as needed, as a third option the owner chose over a default Project's failing first Build.

Stop and discuss if ordinary output within the profile needs behavior NASM 3.00 cannot express without changing meaning; if a translated build disagrees with its expected value, a native run or the GNU reference beyond documented differences; if `.loc` cannot reproduce Compiler Explorer's mapping, which reopens gate 3; or if Blink's `ld` does not extract archive members, as "Targets and order" assumes. Adopt a bounded rule or an explicit error, never a dropped line or an ignored warning.

The translator is complete with a documented `gcc-intel-v1` profile, milestone 1's oracles passing in the Core's CI with native runs, and a released minor version; x86 Source compilation is complete when milestone 3 ships after the runtime's x86 phase, with its verification recorded beside this plan, as for RISC-V's [v1 contract](./risc-v-gnu-compiler-v1.md).

Follow-ups on acceptance:

- In Source compilation, replace the paragraph naming the GNU assembler as the x86 candidate with this decision and a link here.
- ADR 0032 (proposed; the next free number at writing time): x86 Source compilation translates compiler output to NASM in the Core's package, with GNU as in users' Builds considered and rejected.
- CONTEXT.md: the Entry file definition says other Files "are reached from it through includes or are not built at all", which x86 does not follow; amend it or record the exception.
- Later profile versions for Clang, other GCC versions and inline assembly; `.type` and `.size` as `global sym:function` or `:data` with sizes, for symbol metadata only.

## Appendix: corpus manifest

The spike's 25 programs. Each is compiled as `src/main.c` or `src/main.cpp`, named by the driver's `#line 1`, with the headers and NASM Files shown, at O0 and O2. Headers were sent at the request's root (`values.h`, found through `-iquote .`); NASM Files sit beside the source in the Project (`src/math.asm`, `src/glue.asm`). The spike's flags were the profile's without `-fcf-protection=none`, which Compiler Explorer's GCC did not need (no `endbr64` appeared), plus `-ffreestanding -fno-section-anchors -fdiagnostics-color=never -iquote . -I .`. A runnable program must return the value shown at both levels in Blink, and its low byte natively; a link-failure program must fail naming the symbols shown.

| Program          | Exercises                                                                              | Expected                                            |
| ---------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| fixture          | The editor's fixture: local header, global array, loop                                 | 20                                                  |
| broad            | Struct copy, switch, recursion, function pointer, 64-bit division, SSE doubles, string | 239                                                 |
| noreturn (C++)   | `main` without `return`                                                                | 0                                                   |
| memset           | Clear and copy loops                                                                   | 5                                                   |
| bigcopy          | 8 KB struct copies                                                                     | 210                                                 |
| varargs          | Variadic doubles                                                                       | 50                                                  |
| keywords         | C names NASM reserves or reads as registers                                            | 284                                                 |
| x87              | `long double`, unsigned to double                                                      | 103                                                 |
| strings          | String escapes, a backquote                                                            | 141                                                 |
| statics          | Static locals (`.local`, `.comm`), constant 2-D table                                  | 18                                                  |
| jumptable        | Dense switches                                                                         | 140                                                 |
| cppclasses (C++) | Function template, member function                                                     | 25                                                  |
| cppfull (C++)    | Namespace, operator overloading, class template, lambda                                | 39                                                  |
| cppalias (C++)   | Constructor aliases (`.set`), weak COMDAT                                              | 12                                                  |
| ctor (C++)       | Global object built by a constructor (`.init_array`)                                   | 42                                                  |
| callsasm         | C calling a NASM function                                                              | 42                                                  |
| asmcallsc        | NASM calling a C function                                                              | 30                                                  |
| large            | 80 generated functions                                                                 | 35                                                  |
| x87ops           | Non-commutative x87 operations, comparisons                                            | 4755 (147 natively)                                 |
| bitops           | Rotate, byte swap, bit scans, 64-bit multiply, division by constants                   | 77                                                  |
| aligned          | A 64-byte-aligned global                                                               | 18                                                  |
| fptable          | Read-only function-pointer table, struct by value, float, stack array                  | 32                                                  |
| printf           | An undefined library function                                                          | Link error: `printf`                                |
| int128           | `__int128` division                                                                    | Link error: `__divti3`; `__modti3` at O0 and Os     |
| cppvirtual (C++) | Virtual destructor                                                                     | Link error: `operator delete(void*, unsigned long)` |

```c
// values.h, used by fixture
static inline int twice(int value) { return value * 2; }

// fixture
#include "values.h"
int total;
int values[4] = {1, 2, 3, 4};
int main(void) {
    int sum = 0;
    for (int i = 0; i < 4; i++) sum += twice(values[i]);
    total = sum;
    return total;
}
```

```c
// broad
typedef struct { int x, y; } point;
static const char message[] = "hello";
long long big = 1234567890123LL;
double scale = 1.5;
int counter;
static int fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
static int classify(int v) {
    switch (v) { case 0: return 10; case 1: return 20; case 2: return 30; case 3: return 40; case 4: return 50; default: return -1; }
}
static int apply(int (*f)(int), int v) { return f(v); }
static int length(const char *s) { int n = 0; while (s[n]) n++; return n; }
int main(void) {
    point a = {3, 4}, b = a;
    int arr[64] = {0};
    for (int i = 0; i < 64; i++) arr[i] = i;
    long long q = big / 7;
    double d = scale * a.x + b.y;
    counter += (int)d;
    int r = fib(10) + classify(counter % 5) + apply(classify, 2) + length(message) + arr[63] + (int)(q % 100);
    return r;
}
```

```cpp
// noreturn
int value = 7;
int main() { value++; }
```

```c
// memset
int buffer[256];
void clear(int *p, int n) { for (int i = 0; i < n; i++) p[i] = 0; }
void copy(int *d, const int *s, int n) { for (int i = 0; i < n; i++) d[i] = s[i]; }
int other[256];
int main(void) { buffer[3] = 9; clear(buffer, 256); other[3] = 5; copy(buffer, other, 256); return buffer[3]; }
```

```c
// bigcopy
typedef struct { int cells[2000]; } grid;
grid a, b;
static grid make(int seed) { grid g; for (int i = 0; i < 2000; i++) g.cells[i] = seed + i; return g; }
int main(void) { a = make(3); b = a; grid c = b; return c.cells[1999] % 256; }
```

```c
// varargs
#include <stdarg.h>
static double total(int count, ...) {
    va_list ap; va_start(ap, count); double s = 0;
    for (int i = 0; i < count; i++) s += va_arg(ap, double);
    va_end(ap); return s;
}
int main(void) { return (int)(total(3, 1.5, 2.5, 6.0) * 5); }
```

```c
// keywords
int si = 3, count = 4;
int add(int a, int b) { return a + b; }
int div(int a, int b) { return a / b; }
int abs(int v) { return v < 0 ? -v : v; }
int byte(int v) { return v & 0xff; }
int rel = 5;
int main(void) { return add(si, count) + div(100, 10) + abs(-7) + byte(0x1ff) + rel; }
```

```c
// x87
long double third = 1.0L / 3.0L;
unsigned long big = 3000000000UL;
int main(void) { long double x = third * 3.0L; double y = (double)x; double z = (double)big / 1e9; return (int)(y * 100.0 + 0.5) + (int)z; }
```

```c
// strings
static const char text[] = "tab\there\nquote\"back\\slash`tick\x01\377";
int main(void) { int s = 0; for (const char *p = text; *p; p++) s += (unsigned char)*p; return s % 251; }
```

```c
// statics
static int calls;
static int counter(void) { static int n; return ++n + calls++; }
const int table[3][3] = {{1,2,3},{4,5,6},{7,8,9}};
int grid[4][4];
int main(void) {
    for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) grid[i][j] = table[i % 3][j % 3];
    int s = 0; for (int k = 0; k < 3; k++) s += counter();
    return s + grid[3][3] + grid[2][1];
}
```

```c
// jumptable
int classify(int v) { switch (v) { case 0: return 11; case 1: return 22; case 2: return 33; case 3: return 44; case 4: return 55; case 5: return 66; case 6: return 77; case 7: return 88; default: return 0; } }
int pick(int v) { switch (v) { case 0: return v + 1; case 1: return v * 3; case 2: return v - 7; case 3: return v << 2; case 4: return v ^ 5; case 5: return 9; case 6: return v * v; default: return 1; } }
int main(void) { int s = 0; for (int i = 0; i < 10; i++) s += classify(i) + pick(i); return (s - 1 - 3 + 5 - 12 - 1 - 9 - 36 - 3) % 256; }
```

```cpp
// cppclasses
template <typename T> T maxOf(T a, T b) { return a > b ? a : b; }
struct Point { int x, y; int dot(const Point &o) const { return x * o.x + y * o.y; } };
int main() {
    Point p{3, 4};
    return maxOf(p.dot(p), 5);
}
```

```cpp
// cppfull
namespace geo { struct Vec { int x, y; Vec operator+(const Vec &o) const { return {x + o.x, y + o.y}; } }; }
template <typename T, int N> struct Array { T data[N]; T &operator[](int i) { return data[i]; } int size() const { return N; } };
static int apply(int (*f)(int), int v) { return f(v); }
int main() {
    geo::Vec a{1, 2}, b{3, 4}; geo::Vec c = a + b;
    Array<int, 5> arr{}; for (int i = 0; i < arr.size(); i++) arr[i] = i * i;
    auto square = [](int v) { return v * v; };
    return c.x + c.y + arr[4] + apply(square, 3) + square(2);
}
```

```cpp
// cppalias
struct Counter { int n; Counter(int start) : n(start) {} int next() { return ++n; } };
int main() { Counter c(10); c.next(); return c.next(); }
```

```cpp
// ctor
static int compute(int x) { return x * 6; }
struct Config { int value; explicit Config(int x) : value(compute(x)) {} };
int seven = 7;
Config config(seven);
int main() { return config.value; }
```

```c
// callsasm, with src/math.asm below
extern int asm_add(int a, int b);
int main(void) { return asm_add(40, 2); }
```

```nasm
; src/math.asm
global asm_add
section .text
asm_add:
    lea eax, [rdi+rsi]
    ret
```

```c
// asmcallsc, with src/glue.asm below
int triple(int v) { return v * 3; }
extern int call_triple(int v);
int main(void) { return call_triple(10); }
```

```nasm
; src/glue.asm
extern triple
global call_triple
section .text
call_triple:
    sub rsp, 8
    call triple
    add rsp, 8
    ret
```

```c
// large: f0 to f79 follow this pattern, with N and N + 1 written out as numbers
static int fN(int n) { int s = N; for (int j = 0; j < n; j++) { if ((j ^ s) & 1) s += j * (N + 1); else s -= j; } return s; }
int main(void) { int s = 0;
    s += f0(3);
    s += f1(4);
    /* one line per function, s += fN(N % 7 + 3), through: */
    s += f79(5);
    return s & 255; }
```

```c
// x87ops
long double a = 10.0L, b = 4.0L, c = 2.0L;
int main(void) {
    long double r1 = a - b, r2 = b - a, r3 = a / b, r4 = b / a;
    long double r5 = (a - b) / (c - a), r6 = c / (a - b * c), r7 = a * b - c * a;
    int cmp = (a > b) + (b > a) * 2 + (c < b) * 4 + (a == a) * 8;
    return (int)(r1 * 1000 + r2 * 100 + r3 * 10 + r4 * 100 + r5 * 1000 + r6 * 7 + r7) + cmp;
}
```

```c
// bitops
unsigned int seed = 0x12345678u;
static unsigned rotl(unsigned x, int k) { return (x << k) | (x >> (32 - k)); }
int main(void) {
    unsigned x = seed;
    unsigned r = rotl(x, 3);
    unsigned b = __builtin_bswap32(x);
    int lz = __builtin_clz(x), tz = __builtin_ctz(x << 4);
    long long m = (long long)x * -7;
    unsigned long long big = 0xFFFFFFFFFFFFull * 3;
    int s = (int)(x % 1000) + (int)(-1234567 / 10) % 97 + (int)(big >> 40) + (int)(m % 1000);
    return (int)((r ^ 0x91a2b3c0u) + (b ^ 0x78563412u) + (lz - 3) + (tz - 7) + (s - 1319)) + 77;
}
```

```c
// aligned
int big_aligned[8] __attribute__((aligned(64))) = {1, 2, 3, 4, 5, 6, 7, 8};
char pad = 1;
int main(void) { return ((unsigned long)big_aligned % 64 == 0) * 10 + big_aligned[7] + pad - 1; }
```

```c
// fptable
typedef int (*op)(int, int);
static int add2(int a, int b) { return a + b; }
static int sub2(int a, int b) { return a - b; }
static int mul2(int a, int b) { return a * b; }
static const op ops[] = { add2, sub2, mul2 };
struct pair { int a; int b; };
static struct pair swap(struct pair p) { struct pair q = { p.b, p.a }; return q; }
static float halve(float f) { return f * 0.5f; }
int main(void) {
    int s = 0;
    for (int i = 0; i < 3; i++) s += ops[i](5, 3);
    struct pair p = swap((struct pair){1, 2});
    char buf[] = "hello world";
    return s + p.a * 10 - p.b + (int)halve(4.0f) + (buf[6] == 'w') - 15 + 1 + 6 - 8 + 1;
}
```

```c
// printf
#include <stdio.h>
int main(void) { printf("hi %d\n", 42); return 0; }
```

```c
// int128
__int128 a = 1000000000000000000;
long long b = 7;
int main(void) { return (int)(a / b % 100); }
```

```cpp
// cppvirtual
struct Shape { virtual int area() const = 0; virtual ~Shape() {} };
struct Rect : Shape { int w, h; Rect(int w, int h) : w(w), h(h) {} int area() const override { return w * h; } };
int main() { Rect r(3, 4); const Shape &s = r; return s.area(); }
```
