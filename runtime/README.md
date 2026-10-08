# Runtime library

The C standard library that programs from Source compilation (and, with the *Link Runtime library* Setting, hand-written assembly) link against: stdio on the Terminal and on Project Files, `<stdlib.h>`, `<string.h>`, `<ctype.h>`, `<math.h>`, `<time.h>` and the C++ support behind `new`/`delete`, virtual functions and global objects. It is the editor's own library ([ADR 0029](../docs/adr/0029-hosted-programs-link-an-editor-owned-runtime-library.md)); hard algorithms (formatting and parsing floating point, `qsort`, `strtod`, libm) come from musl 1.2.6. The design is in [docs/design/source-runtime.md](../docs/design/source-runtime.md) and the plan in [source-runtime-plan.md](../docs/design/source-runtime-plan.md).

This directory holds ABI `v1` ([ADR 0031](../docs/adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md)):

- [FUNCTIONS.md](./FUNCTIONS.md): every supported function, where its code comes from, and the limitations.
- [PLATFORM.md](./PLATFORM.md): the system calls each Core must provide and the `crt0` contract.

## Layout

| Path | Contents |
| --- | --- |
| `include/` | The public headers, uploaded with every compilation as `sysroot/include` (about 54 KB). Declarations, macros and typedefs only, a one-line `/** ... */` doc comment before every function declaration, `FILE` opaque, nothing included from outside this directory. Freestanding headers derive their types from GCC's predefined macros, so they serve ILP32 and LP64 alike. |
| `src/<area>/` | The library: one global function per file where practical (musl's grouping elsewhere, e.g. the `strto*` family), so a program using only `strlen` links only `strlen`. 262 members; the C++ ones are the `src/cxx/*.cpp` files. |
| `src/internal/` | Private headers (`aed_sys.h` platform contract, `stdio_impl.h`, `libm.h`, `features.h`, `endian.h`, ...) and the shared scanners `shgetc.c`, `intscan.c`, `floatscan.c`. |
| `arch/<target>/` | `aed_sys_arch.h`, the system calls as inline assembly, and `crt0.s`, for `riscv32`, `riscv64`, `mips`, and the native test layers `host-x86_64` and `host-i386`. |
| `tests/corpus/` | Test programs (C and C++), their standard input (`name.in`), input Files (`name.files/`) and deliberate-difference overrides (`name.expect.*`). |
| `tests/expected/` | The reviewed glibc results of each program: `stdout`, `stderr`, `status` and the `files/` left in its directory. The Cores' corpus runner can compare against them without glibc. |
| `tests/native/` | The compiler-support-routine test and the start files of the no-initialization runs. |
| `scripts/test-native.mjs` | The native test harness (below). |
| `scripts/check-targets.mjs` | The Target build check through Compiler Explorer (below). |
| `third_party/musl/COPYRIGHT` | musl's licence. |
| `LICENSE-EXCEPTION.md` | The linking exception for the code written for this library. |

## Building members

Library members are compiled per Target with the Target's GCC 14.2 (the editor's Compiler Explorer compilers `rv32-cgcc1420`, `rv64-cgcc1420`, `cmipsg1420`):

```
-Os -g1 -std=c17 -ffreestanding -fno-builtin -fno-tree-loop-distribute-patterns -fno-stack-protector -fno-pie
-fno-section-anchors -nostdinc -isystem include -I src/internal -iquote <directory of the source> -I arch/<target>
<Target flags>
```

C++ members (`src/cxx/*.cpp`) add `-std=c++17 -fno-exceptions -fno-rtti -fno-threadsafe-statics -nostdinc++`. The Target flags are `-march=rv32imfd -mabi=ilp32d`, `-march=rv64imfd -mabi=lp64d`, and `-march=mips32 -mabi=32 -mno-abicalls -fno-pic -G0 -fno-delayed-branch -mfp32 -mhard-float -EL`. Every include resolves through those paths: sources include `"aed_sys_arch.h"` (found through `-I arch/<target>`, or `-I arch` when the files of `arch/<target>/` are uploaded as `arch/<file>`), internal headers through `-I src/internal`, and headers next to a source (`getc.h`, `malloc_impl.h`, `exp_data.h`, ...) through `-iquote`. musl's `#include <endian.h>` finds `src/internal/endian.h` through `-I`.

User programs are compiled hosted (no `-ffreestanding`) with `-nostdinc -isystem sysroot/include`, and C++ with `-nostdinc++` too. GCC then also calls functions the program never names, which the library provides: `memcpy`, `memset`, `memmove` and `memcmp` for copies, `puts`/`putchar`/`fwrite`/`fputs` for simple `printf`/`fprintf` calls, `sincos`/`sincosf` for `sin` and `cos` of one argument, and the helper routines of FUNCTIONS.md on 32-bit Targets. Clang also calls `bcmp` for a `memcmp` only compared with zero.

`crt0.s` is one file per Target: `arch/riscv32/crt0.s`, `arch/riscv64/crt0.s` (they differ only in pointer size) and `arch/mips/crt0.s`.

## Linking

The Cores link with `ld` semantics ([ADR 0030](../docs/adr/0030-cores-resolve-runtime-library-members.md)). Things the linker must know:

- **Entry** is `_start` in `crt0.s` for Generated assembly (GNU ld's MIPS default name would be `__start`). The linker provides `__init_array_start`/`__init_array_end`; `exit` also uses `__fini_array_start`/`__fini_array_end` through weak references.
- **`__cxa_pure_virtual` and `__cxa_deleted_virtual` are referenced weakly.** GCC emits `.weak __cxa_pure_virtual` in every unit whose vtable has a pure virtual function (and `.weak __cxa_deleted_virtual` for deleted ones), and under ld semantics a weak reference pulls nothing, so the call would jump to address 0 instead of printing "pure virtual method called". The Core resolves the weak references a library lists in its `resolveWeak` set, which the build fills with both. Each lives in its own member. The native harness applies the same rule with GNU ld's `-u`.
- **`.hidden __dso_handle`**: GCC's C++ output marks its reference to `__dso_handle` hidden; the library defines it as an ordinary global in `src/cxx/dso_handle.c`.
- **User definitions win.** A program may define `malloc`, `free`, `operator new`, `operator delete` and so on. Each replaceable C++ operator is its own member and forwards to `operator new(size_t)` or `operator delete(void *)`, so replacing some of them never links a conflicting definition.
- **Weak definitions** in `exit.c` (`__funcs_on_exit`, overridden by `atexit.c` when a program registers a handler) follow the usual rule: a weak definition satisfies a reference and stops a member being pulled.
- No member uses `long double` or needs a helper routine that the library does not define: `scripts/check-targets.mjs` links every member together and every corpus program against the archive, for each Target, with GCC 14.2.

## Editor assets and the Cores

```
node scripts/runtime/build.mjs [--target riscv32,riscv64,mips] [--offline] [--update-abi]
node scripts/runtime/test-cores.mjs [--target riscv32,riscv64,mips] [--only name,...] [--optimization 0,2]
```

`scripts/runtime/build.mjs` compiles every member through Compiler Explorer (cached under `runtime/.cache/`, so `--offline` rebuilds without network), checks each with the Core that will link it, and writes the editor's assets to `src/lib/sourceRuntime/generated/v1/`. It fails when two members define one strong global, when a documented function has no member, or when an export or a struct layout of `abi/layout.c` differs from the baseline `abi/v1.json`. `scripts/runtime/test-cores.mjs` compiles every corpus program as the editor does, links it with those assets on the RARS and MARS Cores, runs it with tty standard input and an in-memory FileSystem, and compares the result with `tests/expected/`.

## Native tests

```
node runtime/scripts/test-native.mjs [--update-expected] [--only name,...] [--variants x86_64,i386,uchar] [--jobs N] [--keep]
```

Needs Node 24 and a host GCC that can build x86-64 and i386 code (`gcc -m32`; no 32-bit C library is needed, everything links with `-nostdlib`). It takes about 15 seconds and:

1. builds the whole library three times with the library flags plus `-Wall -Wextra` (minus a short list of style warnings musl's code triggers on purpose) and fails on any other warning: **x86_64** (LP64, like RV64), **i386** with SSE math (ILP32 like RV32 and MIPS, `FLT_EVAL_METHOD` 0, and GCC calls the library's 64-bit helper routines), and **uchar** (`-funsigned-char`, as on RISC-V);
2. checks that no object contains x87 extended-precision loads or stores, i.e. no `long double`;
3. runs `tests/native/libgcc_test.c`, comparing the helper routines with the host's native 64-bit arithmetic over edge values and about 11 million random cases;
4. builds every corpus program against host glibc (the oracle) and against the library at `-O0` and `-O2` in each variant (plus, for C programs, a start file that runs no `.init_array` and ends with a raw exit system call), runs each in a fresh directory with the same standard input and input Files and `TZ=UTC`, and compares stdout, stderr, the exit status (a signal counts as 128 + its number) and every File left in the directory;
5. checks that the fresh glibc results still equal `tests/expected/` (`--update-expected` rewrites them after review), and that every function in FUNCTIONS.md is used by the corpus.

### Writing corpus programs

The expected results must hold on every Target, not only on the host:

- No unspecified evaluation order: never two calls with side effects (or a call and a read of what it changes) in one argument list.
- No data-model or `char`-signedness dependence in the output (`long`, pointers, `sizeof(long)`, `CHAR_MIN`), no `%p`, no `rand` values, no computed NaN signs (print `isnan`), no `realloc(p, 0)`, only distinct keys for `qsort`, and transcendental results with at most 10 significant digits.
- Standard input files end with a newline (the Terminal delivers whole lines).
- Optimizations must not change the output (GCC removes unused allocations and folds constant math: use `volatile`).
- A first-line comment `runtime-test: skip-noinit` (or `skip-i386`, `skip-uchar`) excludes a program from a run. Programs stay small enough for a classroom emulator (each corpus program runs in at most about 25 million RISC-V instructions at `-O0`); the few above 10 million carry a `core-instruction-limit: N` comment, which the Cores' corpus runner honours. `name.expect.stdout`, `name.expect.stderr` and `name.expect.status` replace glibc's result where the difference is deliberate: the musl-style `assert` message, the write-through output kept by `_Exit`, the heap-error message, and the pure virtual call.

## Target build check

```
node runtime/scripts/check-targets.mjs [--corpus] [--targets riscv32,riscv64,mips]
```

Uploads the tree to Compiler Explorer's CMake endpoint (network access) and, for each Target, compiles every member with the exact flags (no diagnostics allowed), links all members together with `crt0.s` (any undefined symbol fails), and with `--corpus` compiles every corpus program at `-O0` and `-O2` and links it against the library archive. A corpus that exceeds Compiler Explorer's time limit is split across requests automatically. Programs are not run; running on the Cores is the job of the Cores' corpus runner.

## Licence

Files derived from musl 1.2.6 carry musl's MIT licence (`third_party/musl/COPYRIGHT`); each starts with a comment naming its original musl path and summarising the changes, so a later musl release can be compared file by file. musl's own per-file notices (for example the Sun Microsystems and ARM notices in `src/math/`) are kept. The rest was written for this library and is under the repository's AGPL-3.0 with the linking exception in [LICENSE-EXCEPTION.md](./LICENSE-EXCEPTION.md): a program that links Library members can be distributed under any terms, while changes to the library itself stay under the AGPL.
