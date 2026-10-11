The Runtime library provides the C functions used by compiled x86 C and C++ programs. Its functions are declared in `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`. For example, `printf` and `scanf` use the Terminal, file functions use the project's Files, and allocation functions manage program memory. The function reference entries below this overview list the supported functions with their declarations and headers. C++ also gets the support needed for global constructors, `new` and `delete`; the full C++ standard library is not included. The Build links only functions the program uses and their dependencies.

## Compiled programs {#compiled-programs}

Compiling a C or C++ file links the Runtime library automatically. Startup aligns the stack, runs global constructors, calls `main` with the loader's arguments, and passes its result to `exit`. `exit` runs functions registered with `atexit` and C++ global destructors, flushes streams, and ends the program with that status. Build completes startup before execution begins in your code: the first instruction is in `main`, or in a C++ global constructor that runs before `main`. Undo can reverse steps from that point onward; it does not reverse startup.

Streams are unbuffered by default, so stepping over `printf` shows its text at once. Requested output buffering delays output until a flush, a full buffer, or a newline for line buffering. `exit` and returning from `main` flush it; ending the program with the exit system call directly does not.

The library supports `float` and `double`. Extended `long double` formatting and scanning, wide characters, locales and threads are unavailable. Constructors and destructors with explicit priorities, and `.fini_array` entries, are outside the compiler output x86 translates.

## From hand-written assembly {#from-assembly}

Hand-written assembly can call the library too. In the Workbench's **Settings** panel, open **Project Settings** and set **Link Runtime library** to **Runtime ABI v1**. Declare each function with `extern` and follow the x86-64 System V calling convention:

- Integer and pointer arguments use `rdi`, `rsi`, `rdx`, `rcx`, `r8` and `r9`, then the stack. Floating-point arguments use `xmm0` to `xmm7`.
- `rsp` must be a multiple of 16 at each `call`. A function called from C preserves `rbx`, `rbp` and `r12` to `r15`.
- For a variadic call such as `printf`, put the number of vector registers holding arguments in `al`: `xor eax, eax` when there are none.
- Integer and pointer results return in `rax`; floating-point results return in `xmm0`.

The setting is off by default, so an unresolved call can still report an undefined symbol; the diagnostic identifies names supplied by the library.

```asm
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

By default, **Step** over `call printf` runs the whole library call, and one **Undo** reverses that call. A library function that calls back into your program, such as `qsort` calling its comparison function, stops in your code. To inspect library instructions one at a time, turn on **Step into Runtime library code** in **Preferences**. With this enabled, stepping begins in startup code at `_start`.

Consuming standard input or changing Files is an Undo barrier, as it is for the system calls themselves, including inside a grouped library call: Undo stops before that call. Printed output stays in the Terminal after Undo.

`main` receives the loader's arguments: `argc` is 1 and `argv[0]` is `/program`. `malloc` follows the compiler's `max_align_t` alignment and returns NULL with ENOMEM when the heap cannot grow. `clock()` counts executed instructions at nominal 100 MHz and excludes waiting time; Undo rewinds that counter. `time()` reports calendar time, with 2000-01-01 UTC as the fixed Testcase epoch. Library calendar conversions use UTC.
