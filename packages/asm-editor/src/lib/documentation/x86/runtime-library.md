The Runtime library provides C functions for x86 C and C++ programs compiled in the editor, and for assembly programs that explicitly link it. Its functions are declared in `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`. For example, `printf` and `scanf` use the Terminal, file functions use the project's Files, and allocation functions manage program memory. The function reference entries below this overview list the supported functions with their declarations and headers. C++ also gets the support needed for global constructors, `new` and `delete`; the full C++ standard library is not included. The Build links only functions the program uses and their dependencies.

Imported [Executables](/documentation/x86/executables#libraries) use the libraries inside their file or the bundled Linux shared libraries, including glibc. Their supported functions and C++ features are separate from this Runtime reference. Programs compiled in the editor do not acquire glibc or the full C++ standard library from those bundles.

## Compiled programs {#compiled-programs}

Compiling a C or C++ file links the Runtime library automatically. Startup aligns the stack, runs global constructors, calls `main` with the loader's arguments, and passes its result to `exit`. `exit` runs functions registered with `atexit` and C++ global destructors, flushes streams, and ends the program with that status. By default, Build completes Runtime startup before execution begins in your code: the first instruction is in `main`, or in a C++ global constructor that runs before `main`. Undo can reverse steps from that point onward; it does not reverse startup.

Streams are unbuffered by default, so stepping over `printf` shows its text at once. Requested output buffering delays output until a flush, a full buffer, or a newline for line buffering. `exit` and returning from `main` flush it; ending the program with the exit system call directly does not.

The library supports `float` and `double`. Extended `long double` formatting and scanning, wide characters, locales and threads are unavailable. Editor C/C++ compilation does not support constructors or destructors with explicit priorities, or destructors stored in `.fini_array`; these constructs cause a compilation error. Ordinary C++ global destructors registered for `exit` are supported. These compilation restrictions do not apply to imported Executables. Assembly programs with their own startup must arrange any custom constructor or destructor tables themselves.

### Program arguments

Use `int main(int argc, char *argv[])` to receive startup arguments in C or C++. `argc` counts the strings, including the program name. `argv` is an array of pointers to NUL-terminated strings, with a null pointer at `argv[argc]`. `argv[0]` is `./` plus the source File's path without its final extension: `main.c` gives `./main`. The project's **Arguments** follow it. For Arguments `hello "two words"`:

| Value     | Contents       |
| --------- | -------------- |
| `argc`    | `3`            |
| `argv[0]` | `./main`       |
| `argv[1]` | `hello`        |
| `argv[2]` | `two words`    |
| `argv[3]` | A null pointer |

Check `argc > 1` before using `argv[1]`. For example, `if (argc > 1) printf("%s\n", argv[1]);` prints the first user argument when `<stdio.h>` is included. With no Arguments, `argc` is 1. Enter Arguments on the Terminal's **Command line** or in **Settings**, then Build again to apply them. These strings are separate from input read later by `scanf` or `fgets`. See [Program arguments](/documentation/x86/syscall#arguments) for quoting, limits, Testcase inheritance, and assembly access.

The loader also supplies a fixed environment, but the editor Runtime library does not expose it through `getenv`: that function always returns NULL. Imported Executables using glibc have a different environment-function implementation.

## From hand-written assembly {#from-assembly}

Hand-written assembly can call the library too. In the Workbench's **Settings** panel, open **Project Settings** and set **Link Runtime library** to **Runtime ABI v1**. Declare each function with `extern` and follow the x86-64 System V calling convention:

- Integer and pointer arguments use `rdi`, `rsi`, `rdx`, `rcx`, `r8` and `r9`, then the stack. Floating-point arguments use `xmm0` to `xmm7`.
- `rsp` must be a multiple of 16 at each `call`. A function called from C preserves `rbx`, `rbp` and `r12` to `r15`.
- For a variadic call such as `printf`, put the number of vector registers holding arguments in `al`: `xor eax, eax` when there are none.
- Integer and pointer results return in `rax`; floating-point results return in `xmm0`.

The setting is off by default, so an unresolved call can still report an undefined symbol; the diagnostic identifies names supplied by the library.

```x86
default rel
global _start
extern printf
extern exit
section .text
_start:
    and rsp, -16
    lea rdi, [format]
    mov esi, 42
    xor eax, eax
    call printf
    xor edi, edi
    call exit
section .rodata
format: db "answer = %d", 10, 0
```

A program that calls the library this way keeps its own `_start`, and the library's code and data are linked after the program's. The library needs no initialization, so every function works without the startup code. Calling `exit` rather than the exit system call flushes any output buffering the program requested.

## Standard input {#standard-input}

Reading standard input (`scanf`, `fgets`, `getchar`) waits for a line typed in the Terminal and keeps what the program did not read for the next call, as a terminal does. Pressing Ctrl+D, or the Terminal's _End of input_ button, on an empty line ends standard input: the read returns end of file. In a Testcase, standard input ends when its scripted answers run out.

## Reading the library {#reading-the-library}

The **Explorer** is the file list for the current Build. It includes linked library functions as read-only files under `@runtime/`. From a call such as `call printf`, choose **Go to Definition** to open the function's assembly; choose **Show C source** to open its C implementation with matching source lines.

## Stepping {#stepping}

By default, **Step** over `call printf` runs the whole library call. If the call is reversible, one **Undo** reverses it. A library function that calls back into your program, such as `qsort` calling its comparison function, stops in your code. To inspect library instructions one at a time, turn on **Step into library code** in **Preferences**. For programs compiled in the editor, enabling this Preference begins execution in Runtime startup at `_start`, so you can step through startup too. For an imported Executable, Build still advances toward detected `main` or its executable entry point; the Preference controls subsequent Steps into its shared libraries, such as `libc.so.6`. See [Building and stepping](/documentation/x86/executables#stepping).

Consuming standard input or changing Files is an Undo barrier, as it is for the system calls themselves, including inside a grouped library call: Undo stops before that call. Printed output stays in the Terminal after Undo.
