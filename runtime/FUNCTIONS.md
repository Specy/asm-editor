# Runtime library: supported functions, ABI v1

This is the function list of Runtime ABI `v1` ([ADR 0031](../docs/adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md)). Every name below is declared in `include/` with a one-line doc comment and is called by at least one program in `tests/corpus/`; `scripts/test-native.mjs` fails if a listed name is missing from the corpus (names starting with `__` are called by the compiler and are exempt).

*Implementation* says where the code comes from: **musl** means derived from musl 1.2.6 (MIT, `third_party/musl/COPYRIGHT`), named by its original path; every derived file starts with a comment naming that path and summarising the changes. **own** means written for this library.

Behaviour is checked byte for byte against host glibc 2.43 by the native tests. Deliberate differences are listed under [Limitations](#limitations).

## `<stdio.h>`

Streams are unbuffered: every output call has issued its `write` before it returns, and `printf` formats into an 80-byte local buffer and writes once per buffer. Input is read one byte per `read` call (whole buffers for `fread`). `FILE` is opaque. `stdin`, `stdout` and `stderr` are statically initialized objects.

| Function | Implementation | Notes |
| --- | --- | --- |
| `fopen` | musl `stdio/fopen.c`, `stdio/__fdopen.c` | Modes `r`, `w`, `a`, optional `b` and `x`; `+` modes are approximated (see Limitations). A failed open sets `errno` to `ENOENT`. |
| `freopen` | own | Commonly `freopen("in.txt", "r", stdin)`. A replaced Terminal descriptor (0–2) stays open; a NULL path fails with `EINVAL`. |
| `fclose` | musl `stdio/fclose.c` | |
| `fflush` | own | Succeeds and does nothing: there is never buffered output. |
| `setvbuf` | own | Accepts `_IOFBF`, `_IOLBF`, `_IONBF` and changes nothing; another mode fails. |
| `setbuf` | musl `stdio/setbuf.c` | Calls `setvbuf`. |
| `printf` | musl `stdio/printf.c` | |
| `fprintf` | musl `stdio/fprintf.c` | |
| `sprintf` | musl `stdio/sprintf.c` | |
| `snprintf` | musl `stdio/snprintf.c` | |
| `vprintf` | musl `stdio/vprintf.c` | |
| `vfprintf` | musl `stdio/vfprintf.c` | All C conversions, flags, widths, precisions, `*`, positional `%n$`, `%n`, `hh h l ll j z t`; floating point formatted exactly in `double`. No `L` (except MIPS), `%lc`, `%ls`, `%m`. |
| `vsprintf` | musl `stdio/vsprintf.c` | |
| `vsnprintf` | musl `stdio/vsnprintf.c` | |
| `scanf` | musl `stdio/scanf.c` | |
| `fscanf` | musl `stdio/fscanf.c` | |
| `sscanf` | musl `stdio/sscanf.c` | |
| `vscanf` | musl `stdio/vscanf.c` | |
| `vfscanf` | musl `stdio/vfscanf.c` | `d i u o x X a e f g c s [ p n %`, widths, `*` suppression, `hh h l ll j z t`; floating point parsed with correct rounding. No `L` (except MIPS), wide conversions or `%m`. |
| `vsscanf` | musl `stdio/vsscanf.c` | |
| `fgetc` | musl `stdio/fgetc.c` | |
| `getc` | musl `stdio/getc.c` | A function, not a macro. |
| `getchar` | musl `stdio/getchar.c` | |
| `fgets` | musl `stdio/fgets.c` | |
| `ungetc` | musl `stdio/ungetc.c` | Up to 8 characters of pushback. |
| `fputc` | musl `stdio/fputc.c` | |
| `putc` | musl `stdio/putc.c` | A function, not a macro. |
| `putchar` | musl `stdio/putchar.c` | |
| `fputs` | musl `stdio/fputs.c` | |
| `puts` | musl `stdio/puts.c` | |
| `fread` | musl `stdio/fread.c` | |
| `fwrite` | musl `stdio/fwrite.c` | |
| `fseek` | musl `stdio/fseek.c` | Needs the platform `lseek`; the Terminal descriptors fail with `ESPIPE`. |
| `ftell` | musl `stdio/ftell.c` | |
| `rewind` | musl `stdio/rewind.c` | |
| `fgetpos` | musl `stdio/fgetpos.c` | `fpos_t` holds the `ftell` position. |
| `fsetpos` | musl `stdio/fsetpos.c` | |
| `feof` | musl `stdio/feof.c` | End of file is sticky until `clearerr`, `fseek` or `rewind`, as in glibc. |
| `ferror` | musl `stdio/ferror.c` | |
| `clearerr` | musl `stdio/clearerr.c` | |
| `perror` | musl `stdio/perror.c` | |

Objects and macros: `stdin`, `stdout`, `stderr` (musl `stdio/stdin.c`, `stdout.c`, `stderr.c`, unbuffered), `EOF`, `BUFSIZ`, `FILENAME_MAX`, `FOPEN_MAX`, `SEEK_SET`, `SEEK_CUR`, `SEEK_END`, `_IOFBF`, `_IOLBF`, `_IONBF`, `NULL`, types `FILE`, `fpos_t`, `size_t`. Internal members shared by these functions: `__stdio_read`, `__stdio_write`, `__stdio_seek`, `__stdio_close`, `__toread`, `__towrite`, `__uflow`, `__overflow`, `__fmodeflags`, `__shgetc`, `__shlim`, `__intscan`, `__floatscan` (musl, adapted to the platform calls of `src/internal/aed_sys.h`).

## `<stdlib.h>`

| Function | Implementation | Notes |
| --- | --- | --- |
| `malloc` | own | First fit over `sbrk`, set up on first use; 8-byte alignment on 32-bit Targets, 16 on 64-bit. |
| `calloc` | own | Overflow of `count * size` returns NULL with `ENOMEM`. |
| `realloc` | own | Grows in place into a free neighbour when possible; `realloc(p, 0)` returns `p` shrunk. |
| `aligned_alloc` | own | Any power-of-two alignment; the result is freed with `free`. |
| `free` | own | An invalid pointer or a double free prints a message on stderr and ends the program with status 134. |
| `atoi` | musl `stdlib/atoi.c` | |
| `atol` | musl `stdlib/atol.c` | |
| `atoll` | musl `stdlib/atoll.c` | |
| `atof` | musl `stdlib/atof.c` | |
| `strtol` | musl `stdlib/strtol.c` | `strtol`, `strtoul`, `strtoll`, `strtoull`, `strtoimax` and `strtoumax` share one member. |
| `strtoul` | musl `stdlib/strtol.c` | |
| `strtoll` | musl `stdlib/strtol.c` | |
| `strtoull` | musl `stdlib/strtol.c` | |
| `strtod` | musl `stdlib/strtod.c` | Correctly rounded, decimal and hexadecimal, `inf`/`infinity`/`nan`. |
| `strtof` | musl `stdlib/strtod.c` | Rounded once, directly to float. |
| `abs` | musl `stdlib/abs.c` | C++ adds `long`, `long long`, `float` and `double` overloads. |
| `labs` | musl `stdlib/labs.c` | |
| `llabs` | musl `stdlib/llabs.c` | |
| `div` | musl `stdlib/div.c` | C++ adds `long` and `long long` overloads. |
| `ldiv` | musl `stdlib/ldiv.c` | |
| `lldiv` | musl `stdlib/lldiv.c` | |
| `qsort` | musl `stdlib/qsort.c`, `stdlib/qsort_nr.c` | Smoothsort; not stable. |
| `bsearch` | musl `stdlib/bsearch.c` | |
| `rand` | musl `prng/rand.c` | 64-bit LCG, `RAND_MAX` 0x7fffffff; no `srand` equals `srand(1)`. |
| `srand` | musl `prng/rand.c` | |
| `exit` | musl `exit/exit.c` | Runs `atexit`/`__cxa_atexit` handlers, then `.fini_array`, then ends the program. |
| `_Exit` | musl `exit/_Exit.c` | |
| `abort` | own | Ends the program with status 134 (no signals). |
| `atexit` | musl `exit/atexit.c` | 32 handlers without allocation, more with `calloc`. |
| `getenv` | own | Always NULL. |

Macros: `EXIT_SUCCESS`, `EXIT_FAILURE`, `RAND_MAX`, `MB_CUR_MAX` (1), `NULL`; types `div_t`, `ldiv_t`, `lldiv_t`, `size_t`.

## `<string.h>`

| Function | Implementation | Notes |
| --- | --- | --- |
| `memcpy` | musl `string/memcpy.c` | Word at a time once aligned; GCC also calls `memcpy`, `memmove`, `memset` and `memcmp` itself. |
| `memmove` | musl `string/memmove.c` | |
| `memset` | musl `string/memset.c` | |
| `memcmp` | musl `string/memcmp.c` | Clang calls `bcmp` (musl `string/bcmp.c`, which forwards here) for a `memcmp` only compared with zero. |
| `memchr` | musl `string/memchr.c` | |
| `strlen` | musl `string/strlen.c` | |
| `strnlen` | musl `string/strnlen.c` | |
| `strcpy` | musl `string/strcpy.c`, `string/stpcpy.c` | |
| `strncpy` | musl `string/strncpy.c`, `string/stpncpy.c` | |
| `strcat` | musl `string/strcat.c` | |
| `strncat` | musl `string/strncat.c` | |
| `strcmp` | musl `string/strcmp.c` | |
| `strncmp` | musl `string/strncmp.c` | |
| `strcoll` | musl `locale/strcoll.c` | "C" locale: compares like `strcmp`. |
| `strxfrm` | musl `locale/strxfrm.c` | "C" locale: copies. |
| `strchr` | musl `string/strchr.c`, `string/strchrnul.c` | |
| `strrchr` | musl `string/strrchr.c`, `string/memrchr.c` | |
| `strstr` | musl `string/strstr.c` | Two-way algorithm for long needles. |
| `strspn` | musl `string/strspn.c` | |
| `strcspn` | musl `string/strcspn.c` | |
| `strpbrk` | musl `string/strpbrk.c` | |
| `strtok` | musl `string/strtok.c` | |
| `strdup` | musl `string/strdup.c` | |
| `strndup` | musl `string/strndup.c` | |
| `strerror` | own | glibc's messages for the `<errno.h>` values, otherwise "Unknown error". |

## `<ctype.h>`

All are functions (no macros), "C" locale: values above 127 belong to no class.

| Function | Implementation | Notes |
| --- | --- | --- |
| `isalnum` | musl `ctype/isalnum.c` | |
| `isalpha` | musl `ctype/isalpha.c` | |
| `isblank` | musl `ctype/isblank.c` | |
| `iscntrl` | musl `ctype/iscntrl.c` | |
| `isdigit` | musl `ctype/isdigit.c` | |
| `isgraph` | musl `ctype/isgraph.c` | |
| `islower` | musl `ctype/islower.c` | |
| `isprint` | musl `ctype/isprint.c` | |
| `ispunct` | musl `ctype/ispunct.c` | |
| `isspace` | musl `ctype/isspace.c` | |
| `isupper` | musl `ctype/isupper.c` | |
| `isxdigit` | musl `ctype/isxdigit.c` | |
| `tolower` | musl `ctype/tolower.c` | |
| `toupper` | musl `ctype/toupper.c` | |

## `<math.h>`

`double` and `float` only. The functions never set `errno` (`math_errhandling` is `MATH_ERREXCEPT`). Results may differ from glibc's in the last bit; the corpus compares 10 significant digits for them and exact bits for exactly specified functions.

| Function | Implementation | Notes |
| --- | --- | --- |
| `fabs` | musl `math/fabs.c` | |
| `floor` | musl `math/floor.c` | |
| `ceil` | musl `math/ceil.c` | |
| `round` | musl `math/round.c` | |
| `trunc` | musl `math/trunc.c` | |
| `fmod` | musl `math/fmod.c` | |
| `sqrt` | musl `math/sqrt.c` | Software, correctly rounded (user code compiled with GCC usually uses the hardware instruction and calls this only for negative arguments). |
| `cbrt` | musl `math/cbrt.c` | |
| `hypot` | musl `math/hypot.c` | |
| `pow` | musl `math/pow.c` | |
| `exp` | musl `math/exp.c` | |
| `expm1` | musl `math/expm1.c` | Used by `sinh`, `cosh` and `tanh`; also declared. |
| `log` | musl `math/log.c` | |
| `log10` | musl `math/log10.c` | |
| `log2` | musl `math/log2.c` | |
| `sin` | musl `math/sin.c` | Full-range argument reduction (`__rem_pio2`, `__rem_pio2_large`). |
| `cos` | musl `math/cos.c` | |
| `tan` | musl `math/tan.c` | |
| `sincos` | musl `math/sincos.c` | GNU extension; GCC turns `sin(x)` and `cos(x)` of the same `x` into one `sincos` call. |
| `asin` | musl `math/asin.c` | |
| `acos` | musl `math/acos.c` | |
| `atan` | musl `math/atan.c` | |
| `atan2` | musl `math/atan2.c` | |
| `sinh` | musl `math/sinh.c` | |
| `cosh` | musl `math/cosh.c` | |
| `tanh` | musl `math/tanh.c` | |
| `frexp` | musl `math/frexp.c` | |
| `ldexp` | musl `math/ldexp.c` | |
| `scalbn` | musl `math/scalbn.c` | |
| `modf` | musl `math/modf.c` | |
| `copysign` | musl `math/copysign.c` | |
| `fmin` | musl `math/fmin.c` | |
| `fmax` | musl `math/fmax.c` | |
| `sqrtf` | musl `math/sqrtf.c` | |
| `fabsf` | musl `math/fabsf.c` | |
| `floorf` | musl `math/floorf.c` | |
| `ceilf` | musl `math/ceilf.c` | |
| `roundf` | musl `math/roundf.c` | |
| `truncf` | musl `math/truncf.c` | |
| `fmodf` | musl `math/fmodf.c` | |
| `sinf` | musl `math/sinf.c` | |
| `cosf` | musl `math/cosf.c` | |
| `tanf` | musl `math/tanf.c` | |
| `sincosf` | musl `math/sincosf.c` | GNU extension, see `sincos`. |
| `expf` | musl `math/expf.c` | |
| `logf` | musl `math/logf.c` | |
| `powf` | musl `math/powf.c` | |

Macros (from GCC builtins, no library code): `fpclassify`, `isfinite`, `isinf`, `isnan`, `isnormal`, `signbit`, `isgreater`, `isgreaterequal`, `isless`, `islessequal`, `islessgreater`, `isunordered`, `HUGE_VAL`, `HUGE_VALF`, `INFINITY`, `NAN`, `FP_NAN`, `FP_INFINITE`, `FP_ZERO`, `FP_SUBNORMAL`, `FP_NORMAL`, `M_E`, `M_LOG2E`, `M_LOG10E`, `M_LN2`, `M_LN10`, `M_PI`, `M_PI_2`, `M_PI_4`, `M_1_PI`, `M_2_PI`, `M_2_SQRTPI`, `M_SQRT2`, `M_SQRT1_2`, `MATH_ERRNO`, `MATH_ERREXCEPT`, `math_errhandling`; types `float_t`, `double_t`. In C++ the classification macros are overloaded functions instead, and float and integer overloads of the functions are added. Internal members: `__sin`, `__cos`, `__tan`, `__sindf`, `__cosdf`, `__tandf`, `__rem_pio2`, `__rem_pio2f`, `__rem_pio2_large`, `__expo2`, `__math_oflow` and the other `__math_*` error helpers, and the `*_data` tables.

## `<time.h>`

| Function | Implementation | Notes |
| --- | --- | --- |
| `time` | own | Seconds from the platform's millisecond clock. |
| `clock` | own | Wall time since the program's first `clock` call; `CLOCKS_PER_SEC` is 1000000, with millisecond resolution. |
| `difftime` | musl `time/difftime.c` | |
| `mktime` | musl `time/mktime.c` | Reads its argument as UTC and normalizes it. |
| `gmtime` | musl `time/gmtime.c`, `time/gmtime_r.c` | 64-bit `time_t`. |
| `localtime` | own | Same as `gmtime` (programs run in UTC), same static result. |
| `asctime` | musl `time/asctime.c`, `time/asctime_r.c` | |
| `ctime` | musl `time/ctime.c` | |

Internal members: `__secs_to_tm`, `__tm_to_secs`, `__year_to_secs`, `__month_to_secs` (musl). Types and macros: `time_t` (`long long`), `clock_t` (`long`), `struct tm` (the nine standard fields), `CLOCKS_PER_SEC`.

## `<inttypes.h>`

| Function | Implementation | Notes |
| --- | --- | --- |
| `strtoimax` | musl `stdlib/strtol.c` | |
| `strtoumax` | musl `stdlib/strtol.c` | |
| `imaxabs` | musl `stdlib/imaxabs.c` | |
| `imaxdiv` | musl `stdlib/imaxdiv.c` | |

Also every `PRI*` and `SCN*` macro for the exact, least, fast, `MAX` and `PTR` types, and `imaxdiv_t`.

## `<errno.h>` and `<assert.h>`

| Name | Implementation | Notes |
| --- | --- | --- |
| `errno` | own | `extern int errno;`, a plain global. Constants: `EPERM`, `ENOENT`, `EIO`, `EBADF`, `EAGAIN`, `ENOMEM`, `EACCES`, `EEXIST`, `EINVAL`, `EMFILE`, `ENOSPC`, `ESPIPE`, `EDOM`, `ERANGE`, `ENOSYS`, `EOVERFLOW`, `EILSEQ`, with Linux's values. |
| `assert` | musl `exit/assert.c` (`__assert_fail`) | Honours `NDEBUG` at each inclusion. A failure prints `Assertion failed: expr (file: function: line)` on stderr and aborts (status 134). Also `static_assert`. |

## Freestanding headers

`<stddef.h>`, `<stdint.h>`, `<stdbool.h>`, `<stdarg.h>`, `<limits.h>`, `<float.h>`, `<iso646.h>` and `<stdnoreturn.h>` contain only types and macros, all derived from GCC's predefined macros (`__SIZE_TYPE__`, `__INT64_TYPE__`, `__INT_MAX__`, `__DBL_MANT_DIG__`, …), so the same file is right for ILP32 (RV32, MIPS) and LP64 (RV64). `va_list` and the `va_*` macros use GCC's builtins. `max_align_t` has 8-byte alignment (the library has no `long double`).

## C++ support

Compiled with `-std=c++17 -fno-exceptions -fno-rtti -fno-threadsafe-statics -nostdinc++`. Global constructors run from `crt0`'s `.init_array` loop; destructors of globals and function-local statics are registered with `__cxa_atexit` and run by `exit` in reverse order, interleaved correctly with `atexit` handlers.

| Symbol | Implementation | Notes |
| --- | --- | --- |
| `operator new(size_t)` | own, `cxx/new.cpp` | Out of memory prints a message and aborts (no exceptions). `new(0)` returns a unique pointer. |
| `operator new[](size_t)` | own, `cxx/new_array.cpp` | Calls `operator new`, so replacing `operator new` also changes arrays. |
| `operator new(size_t, const nothrow_t &)`, `operator new[](…, nothrow)` | own | Return `nullptr` when memory runs out. |
| `operator new(size_t, align_val_t)`, `operator new[](…, align_val_t)` | own | Over-aligned types (`alignas` beyond the default), through `aligned_alloc`. |
| `operator delete(void *)` and the array, sized, nothrow and aligned forms | own, one file each | Each forwards to `operator delete(void *)` or `free`, so a program may replace any subset. |
| placement `operator new`/`delete` | `<new>`, inline | |
| `std::nothrow`, `std::nothrow_t`, `std::align_val_t`, `std::launder` | `<new>` / own `cxx/nothrow.cpp` | |
| `__cxa_atexit`, `__cxa_finalize` | musl `exit/atexit.c` | Same list as `atexit`. |
| `__dso_handle` | own | GCC's C++ output marks its reference `.hidden`. |
| `__cxa_pure_virtual` | own | Prints "pure virtual method called" and aborts. GCC references it *weakly* from vtables: see README.md, Linking. |
| `__cxa_deleted_virtual` | own | Prints "deleted virtual method called" and aborts; also referenced weakly. |

Headers: `<new>`, and `<cstdio>`, `<cstdlib>`, `<cstring>`, `<cctype>`, `<cmath>`, `<ctime>`, `<cerrno>`, `<cassert>`, `<climits>`, `<cfloat>`, `<cstdarg>`, `<cstddef>`, `<cstdint>`, `<cinttypes>`, each including its C header and adding `using ::name;` declarations into `namespace std`. `<cmath>` provides `std::sqrt(2)` (integers become `double`), float overloads returning `float`, mixed-argument promotion for the two-argument functions, and `std::isnan` and the other classification functions.

## Compiler support routines

GCC calls these on 32-bit Targets for 64-bit operations the hardware lacks, and for bit counting on Targets without the B extension; they exist on every Target and are harmless on 64-bit ones. All are own code written on 32-bit halves, so none can call itself, and are checked against native 64-bit arithmetic (about 11 million cases) by the native tests.

| Symbol | Notes |
| --- | --- |
| `__divdi3`, `__moddi3`, `__udivdi3`, `__umoddi3`, `__udivmoddi4`, `__divmoddi4` | 64-bit division and remainder. Unsigned division by zero gives an all-ones quotient and the dividend as remainder, as RISC-V's `divu` does. `__divmoddi4` is used by newer GCCs. |
| `__muldi3` | 64-bit multiplication. |
| `__ashldi3`, `__ashrdi3`, `__lshrdi3` | 64-bit variable shifts; GCC calls them at `-Os`. |
| `__fixdfdi`, `__fixunsdfdi`, `__fixsfdi`, `__fixunssfdi` | Floating point to 64-bit integer, truncating; out-of-range values saturate as RISC-V's `fcvt` does. |
| `__floatdidf`, `__floatundidf`, `__floatdisf`, `__floatundisf` | 64-bit integer to floating point, correctly rounded (one rounding). |
| `__clzsi2`, `__clzdi2`, `__ctzsi2`, `__ctzdi2`, `__popcountsi2`, `__popcountdi2`, `__bswapsi2`, `__bswapdi2` | Bit counts and byte swaps; RV64 uses the `di` forms for 32-bit counts too. |

## Limitations

- **No `long double`.** The library contains no `long double` code (on RISC-V it is 128-bit software floating point and would need helper routines that are not shipped). `printf` rejects the `L` modifier (the call returns -1 with `errno` `EINVAL`) and `scanf` treats `%Lf` and friends as a matching failure, except on MIPS, where `long double` is `double` and `L` works. There is no `strtold` and no `long double` overload in C++.
- **No wide characters or multibyte conversions**: no `<wchar.h>`; `%lc`, `%ls`, `%C`, `%S` are invalid in `printf`, and `%lc`, `%ls`, `%l[` in `scanf`. `MB_CUR_MAX` and `MB_LEN_MAX` are 1.
- **"C" locale only**; no `<locale.h>`. No `%m` in `printf` or `scanf` (GNU extensions).
- **Write-through output** (`docs/design/source-runtime.md`, Stream buffering): `fflush` and `setvbuf` succeed without effect; output appears on the step that produced it and is never lost by `_Exit`, `abort` or a raw exit system call. Only the timing differs from C's buffering, which `tests/corpus/writethrough.c` records.
- **`+` modes**: the Cores open a File for reading or for writing, never both, so `"r+"` reads, `"w+"` truncates and writes, and `"a+"` appends; writing an `"r+"` stream or reading a `"w+"`/`"a+"` stream sets the error indicator. `"x"` checks that the File cannot already be opened for reading.
- **No File removal or renaming**: `remove`, `rename`, `tmpfile` and `tmpnam` are not provided (the platform has no such system call); neither are `fdopen`, `fileno`, `getline` or `gets`.
- **`errno` values chosen by the library**: the platform reports failures as -1 without a reason, so a failed `fopen` sets `ENOENT`, a failed read or write `EIO`, a failed seek `ESPIPE` (Terminal) or `EINVAL`, and reading a write-only stream (or the reverse) `EBADF`. Like glibc, `strtol` and `strtod` leave `errno` unchanged when nothing is converted. Whether underflow to a subnormal result sets `ERANGE` is implementation-defined, and this library's answer (musl's) can differ from glibc's; overflow to infinity and underflow to zero always set it.
- **`errno` after an allocation, with Clang**: from `-O1`, LLVM assumes `malloc`, `calloc` and `realloc` never set `errno` and folds a read of it in the same function right after one, on every platform. Functions that read it themselves, such as `perror`, see `ENOMEM`.
- **No environment, signals or processes**: `getenv` returns NULL; `abort` ends the program with status 134 instead of raising `SIGABRT`; no `system`, `signal` or `raise`.
- **Time**: programs run in UTC (`localtime` is `gmtime`, `mktime` reads UTC, `tm_isdst` is 0); `clock` measures wall time from its first call; there is no `strftime`.
- **Heap**: never returned to the system (the Cores reject a negative `sbrk`); a single request of about 2 GiB or more fails with NULL; on the Cores, running out of heap is reported by the Core's `sbrk` as a runtime error rather than as NULL. Alignment is 8 bytes on RV32 and MIPS (GCC's `__STDCPP_DEFAULT_NEW_ALIGNMENT__` is 16 on RV32, but no RV32IMFD instruction needs more than 8).
- **`printf("%#g")` and glibc**: for a value whose rounding carries into a new digit (999999.5), glibc 2.43 prints `1.e+06`; C requires `1.00000e+06`, which this library prints.
- **C++**: no exceptions (`operator new` aborts on exhaustion), no RTTI, no C++ standard library beyond `<new>` and the C wrappers (no `<iostream>`, `<string>`, `<vector>`, `<initializer_list>`). `<cstring>` keeps C's non-const `strchr` family. `std::nan` is not provided.
- No threads: no locks, no `errno` per thread, no `thrd_*`.
