# Runtime library: platform contract v1

The Runtime library reaches the system only through eight functions declared in `src/internal/aed_sys.h`. Each Target implements them as `static inline` functions with GCC inline assembly in `arch/<target>/aed_sys_arch.h`, so a library member contains its system calls directly and needs nothing else. This file is the contract each Core's syscalls must honour; gaps are fixed in the Cores rather than worked around in the library ([source-runtime.md](../docs/design/source-runtime.md)).

## The functions

| Function | Meaning | Result |
| --- | --- | --- |
| `long __aed_read(int fd, void *buf, unsigned long n)` | Read up to `n` bytes. | Count; 0 at end of input; -1 on error. |
| `long __aed_write(int fd, const void *buf, unsigned long n)` | Write `n` bytes. | Count; -1 on error. |
| `int __aed_open(const char *path, int mode)` | Open a File. `mode` 0 reads, 1 writes (creating or truncating), 9 appends (creating). | Descriptor; -1 on error. |
| `int __aed_close(int fd)` | Close a descriptor. | 0 (the Cores report nothing). |
| `long __aed_lseek(int fd, long offset, int whence)` | Move the position; `whence` 0 start, 1 current, 2 end. | New position; -1 on error. |
| `void *__aed_sbrk(long increment)` | Grow the heap by `increment` bytes, never negative. `sbrk(0)` reports the break. | Previous break; `(void *)-1` on error. |
| `_Noreturn void __aed_exit(int code)` | End the program with `code`. | |
| `long long __aed_time_ms(void)` | The current time. | Milliseconds since 1970-01-01 UTC. |

The platform reports failures as -1 without a reason; the library chooses `errno` (see FUNCTIONS.md, Limitations).

Descriptors 0, 1 and 2 are the Terminal. Writes to 1 and 2 print. Reads from 0 have tty semantics owned by the adapter and the Terminal: a read first returns bytes left over from the current line; otherwise it asks the Input Source for one line, appends `\n`, returns up to `n` bytes and keeps the rest. End of input (Ctrl+D, the End of input button, or a Testcase's exhausted answers) makes one read return 0. The library reads standard input one byte per call, so it never holds input the Core has delivered: a program can mix `scanf`, `getchar` and raw read system calls. Seeking descriptors 0–2 fails.

## RISC-V (RARS), RV32 and RV64

`ecall`, service number in `a7`, arguments in `a0`–`a2`, result in `a0`. `arch/riscv32/aed_sys_arch.h` and `arch/riscv64/aed_sys_arch.h` are identical, width-independent copies.

| Function | Service | Arguments | Result |
| --- | --- | --- | --- |
| read | 63 | `a0` fd, `a1` buffer, `a2` length | `a0` count, 0 at end, -1 error |
| write | 64 | `a0` fd, `a1` buffer, `a2` length | `a0` count or -1 |
| open | 1024 | `a0` path (NUL-terminated), `a1` mode 0/1/9 | `a0` descriptor or -1 |
| close | 57 | `a0` fd | none (`a0` is ignored) |
| lseek | 62 | `a0` fd, `a1` offset, `a2` whence | `a0` position or -1 |
| sbrk | 9 | `a0` increment | `a0` start of the new block (the previous break) |
| exit | 93 | `a0` code | does not return |
| time | 30 | none | `a0` low 32 bits, `a1` high 32 bits of the milliseconds |

## MIPS (MARS), little-endian o32

`syscall`, service number in `$v0` (`$2`), arguments in `$a0`–`$a2` (`$4`–`$6`), result in `$v0`. Compiled with `-march=mips32 -mabi=32 -mno-abicalls -fno-pic -G0 -fno-delayed-branch -mfp32 -mhard-float -EL`.

| Function | Service | Arguments | Result |
| --- | --- | --- | --- |
| read | 14 | `$a0` fd, `$a1` buffer, `$a2` length | `$v0` count, 0 at end, -1 error |
| write | 15 | `$a0` fd, `$a1` buffer, `$a2` length | `$v0` count or -1 |
| open | 13 | `$a0` path, `$a1` mode 0/1/9, `$a2` 0 (ignored) | `$v0` descriptor or -1 |
| close | 16 | `$a0` fd | none (`$v0` is ignored) |
| lseek | 62 | `$a0` fd, `$a1` offset, `$a2` whence | `$v0` position or -1 |
| sbrk | 9 | `$a0` increment | `$v0` previous break |
| exit | 17 (exit2) | `$a0` code | does not return |
| time | 30 | none | `$a0` low 32 bits, `$a1` high 32 bits |

## Notes for the Cores

- **sbrk.** Both Cores round the break up to a multiple of 4 and throw (ending the program) for a negative increment or when the heap is exhausted, instead of returning -1. The library never passes a negative increment, aligns its blocks itself (8 bytes on 32-bit Targets, 16 on 64-bit), and refuses single requests of about 2 GiB or more, because the Cores read the increment as a signed 32-bit value. Other code may call sbrk between `malloc` calls: the allocator handles a heap that is not contiguous.
- **open.** Only the modes 0, 1 and 9 exist, so `"r+"`, `"w+"` and `"a+"` open one direction (FUNCTIONS.md, Limitations). `"x"` probes with a read-only open first.
- **close** returns nothing in either Core; the library reports success.
- **time** may be a virtual clock in a scripted run; `time` divides it by 1000 and `clock` measures from its first call.
- **lseek** is needed by `fseek`, `ftell`, `rewind`, `fgetpos` and `fsetpos` only.
- **Symbols named like registers.** C's `time` is also the name of a RISC-V CSR. The GNU profile must treat an identifier in a symbol position (`call time`, `%hi(time)`, `.word time`, a label `time:`) as a symbol; as of 2026-10-04 RARS does not count `call time` as a reference, so a program calling `time()` fails with "Unresolved symbol: time". The same holds for any user function named `cycle`, `instret`, `fcsr` and so on.

## Program start: `crt0.s`

`arch/riscv32/crt0.s`, `arch/riscv64/crt0.s` and `arch/mips/crt0.s` (one file per Target; RV32 and RV64 differ only in the pointer size, so there are two files rather than a width-independent one) define `_start`, the entry symbol of a Build whose Entry is Generated assembly. They are plain GNU assembly, written exactly in the shape GCC 14.2 emits for the same code (`%hi`/`%lo` addresses, `.L`/`$L` local labels, `call`; on MIPS `.set noreorder` with an explicit `nop` in every delay slot, so they run the same with or without delayed branching), using only `.text`, `.align`, `.globl`, `.type`, `.size` and, on MIPS, the `.set`, `.ent` and `.end` directives GCC also emits. `_start`:

1. aligns `sp` down to 16 bytes (on MIPS it then reserves the 16-byte argument area o32 callers provide);
2. calls every function pointer from `__init_array_start` up to `__init_array_end` (4 bytes each on RV32 and MIPS, 8 on RV64), in order; the linker provides both symbols;
3. calls `main(0, NULL)`;
4. passes `main`'s result to `exit`, which runs the `atexit` and `__cxa_atexit` handlers (C++ static destructors), then `.fini_array` from its end down to `__fini_array_start` (weak references, 0 when absent), then the exit service.

Programs that never run `crt0` (hand-written assembly calling `printf`) work unchanged: no library function needs initialization. The standard streams are statically initialized, the heap is set up by the first `malloc`, `errno` and all other state start as zero, and every output call has written its bytes before it returns, so even ending with a raw exit system call loses nothing. Such programs only miss what `crt0` adds: `.init_array` constructors and the `exit` call after `main`. The native tests run every C corpus program a second time with a start file that does exactly that (no `.init_array`, raw exit) to keep this true.

## Native test layers (not Targets)

`arch/host-x86_64/` and `arch/host-i386/` implement the same contract with Linux system calls (read 0/3, write 1/4, open 2/5 with `O_RDONLY`, `O_WRONLY|O_CREAT|O_TRUNC` or `O_WRONLY|O_CREAT|O_APPEND` and mode 0644, close 3/6, lseek 8/19, sbrk emulated on brk 12/45, exit_group 231/252, clock_gettime 228/clock_gettime64 403) and an AT&T `crt0.s` with the same steps. They exist only for `scripts/test-native.mjs`.
