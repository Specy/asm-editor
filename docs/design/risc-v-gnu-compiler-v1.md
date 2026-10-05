# RISC-V GNU compiler assembly v1

Implemented on 2026-10-04 under the [compatibility plan](./risc-v-compiler-assembly-compatibility-plan.md). This is a bounded static assembler profile for the existing little-endian RV32/RV64 Core. Rust Source compilation and runtime integration remain follow-on work.

## Selection and persistence

The package factory accepts `RISCV.makeRiscVFromFiles(files, entry, { assemblerProfile: 'gnu-compiler-v1' })`. Omission selects `rars`; every present invalid profile throws. Java retains its old factory and adds an overload taking `AssemblerProfile`. Profile state belongs to each program, while the Core's existing width and memory globals still require sequential instances.

New RISC-V C/C++ Compilation records require GNU v1. That requirement applies to the whole reachable include unit and survives source-map invalidation, manual edits, saving, sharing and archives. Otherwise the manual RISC-V Project Setting applies; otherwise RARS applies. Old records are unchanged. Conflicting reachable requirements produce Diagnostics and block Build. Present invalid settings/records are format errors, even when another requirement would take precedence.

Build snapshots capture the resolved profile. Profile changes revise worker analysis; old analysis and failures cannot replace the new revision. Completions and directive hover follow the live or captured profile. An older Core that lacks the profile explicitly rejects a required GNU Build.

## Supported subset

| Area         | GNU v1 behavior                                                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layout       | Independent named `.text*`, `.rodata*`/`.srodata*`/`.rdata*`, `.data*`/`.sdata*`, `.bss*`/`.sbss*`, then common storage. First appearance within each family; maximum section alignment; append on revisit. Validated `a/w/x/M/S` flags and progbits/nobits. Mergeable bytes retained without deduplication. |
| Data         | Byte, half/short/2byte, word/long/4byte, quad/dword/8byte, float/double; no implicit alignment. Integer fixups emit little-endian bytes; eight-byte addresses zero-extend the checked Core address. Oversized literals warn on truncation; symbol overflow errors.                                           |
| Strings      | ASCII, asciz/string, multiple strings, UTF-8 literal text, byte-valued octal and hex escapes. Invalid or oversized escapes error.                                                                                                                                                                            |
| Padding      | Zero/space/skip; align/p2align/balign with byte fill and maximum skip, including omitted fill. Default code padding is executable NOPs with directive provenance; explicit fill and section gaps remain image words that trap on execution.                                                                  |
| Symbols      | Single-definition set/equ and LLVM `name = expression` aliases, forward constants, numeric local labels across includes, declared visibility, singly defined weak symbols, checked common allocations.                                                                                                       |
| Expressions  | Exact integers, parentheses, unary signs, addition/subtraction, symbol plus addend, same-section differences and current location. Counts/alignment must be absolute.                                                                                                                                        |
| Instructions | Existing basic instructions and fixed pseudo expansions; audited li, la/lla, call/tail and address load/store forms. Calls preserve t1; stores/floating address pseudos require explicit scratch registers.                                                                                                  |
| Fixups       | Absolute hi/lo and PC-relative hi/lo, including separated pairs and multiple low users. PC-relative lows name a same-section high anchor with zero addend. Range, sign-extension and branch alignment checks precede encoding.                                                                               |
| Options      | Push/pop, nopic, norvc, norelax and relax permission; output is always unrelaxed. Validate ISA width, supported attributes and 16-byte ABI stack alignment. Zmmul metadata is accepted when M is also declared.                                                                                              |

Emission is bounded to 16 MiB, alignment exponents to 24, include/alias/expression nesting to 64 and expression text to 4096 characters. One statement per line is supported; semicolon-separated statements error. Executable data directives, compressed/vector/atomic architecture declarations, GOT/PLT, TLS, COMDAT, initialization arrays, arbitrary instructions and unresolved runtime helpers error. Audited nonallocatable debug metadata is discarded; runtime references into discarded sections error. RARS retains its existing alignment, macros and educational behavior.

The C/C++ startup aligns SP to 16 bytes before calling the generated entry. Educational Core register defaults are unchanged. Rust fixtures use compatible integer entry functions; RV32 Rust's ILP32 integer calls are tested against this harness, without claiming floating-point ABI interoperability.

## Evidence and local artifact

The [package suite](../../emulators/risc-v/rarsjs/ts/test/gnu-compiler.mjs) contains 16 GCC 14.2/Clang 21.1 C/C++ fixtures and four rustc r1990 helper-free fixtures, spanning both widths and O0/O2, plus two Rust helper-dependent negatives. Fixtures store source, compiler ID/flags and raw response. Every positive checks independent GNU Binutils 2.46 bytes and symbol addresses, execution, aligned/restored SP and nonzero callee-saved register preservation. Additional tests cover layout, escaped bytes, fixup failures, profiles, source identities, NOP padding and instruction Undo.

Reference preparation uses the same startup and section ordering, no compression/relaxation, and removes file/loc/CFI metadata. GNU requires architecture attributes before instructions, so reference preparation hoists them before startup. Stored linker scripts match Core bases; objcopy clears merge flags to prevent reference deduplication. Each oracle records these transformations, tool version, arguments and section bytes. CI tests consume stored fixtures without network access. The separate layout fixture also stores the reference section and symbol tables.

The editor suite covers real GCC/Clang source mapping and execution, lifecycle/persistence, invalid requirements, profile-only revisions and immutable Build snapshots. Browser verification exercised manual profile selection, Build and Run without page errors.

The implementation is published as `@specy/risc-v` 3.7.0 at Core revision `5273375d7654dd9dabd053985d0f848641973226`. The v3.7.0 tag's CI/CD passed, npm reports that revision, and the editor pins the published package.

The verified `rarsjs/ts/dist/index.mjs` artifact has SHA-256 `46843342645a004d1d4e3593cb089a5cdfb9d01bd43e4e46d5912c0cc6248e25`. Rebuilding after further changes may produce another artifact. Build and link before testing this checkout:

```sh
npm run emulators:build:risc-v
node scripts/local-emulators.mjs link risc-v
npm --prefix emulators/risc-v/rarsjs/ts test
npm test -- src/lib/sourceCompilation src/lib/languages/service src/lib/languages/RISC-V
npm run check
npm run build
```

The release prerequisite for the GNU compilation default is satisfied. The registry dependency and deployment workflow use the published 3.7.0 package; local links are optional for Core development.
