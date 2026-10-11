The Runtime library provides the C functions used by compiled RISC-V C and C++ programs. Its functions are declared in `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`. For example, `printf` and `scanf` use the Terminal, file functions use the project's Files, and allocation functions manage program memory. The function reference entries below this overview list the supported functions with their declarations and headers. C++ also gets the support needed for global constructors, `new` and `delete`; the full C++ standard library is not included. The Build links only functions the program uses and their dependencies.

## Compiled programs {#compiled-programs}

Compiling a C or C++ file links the Runtime library automatically. Startup runs global constructors, calls `main`, and passes its result to `exit`. Build completes startup before execution begins in your code: the first instruction is in `main`, or in a C++ global constructor that runs before `main`. Undo can reverse steps from that point onward; it does not reverse startup. Streams are unbuffered by default, so stepping over `printf` shows its text at once. Requested output buffering delays output until a flush, a full buffer, or a newline for line buffering.

## From hand-written assembly {#from-assembly}

Hand-written assembly can call the library too. In the Workbench's **Settings** panel, open **Project Settings** and set **Link Runtime library** to **Runtime ABI v1**. For ordinary fixed-argument calls, integer and pointer arguments use `a0` to `a7`, and floating-point arguments use `fa0` to `fa7`; each register sequence is assigned independently. Arguments that do not fit in registers go on the stack. Variadic arguments (the arguments represented by `...`, as in `printf`) use the integer argument registers and then the stack, including floating-point values. Integer or pointer results return in `a0`; floating-point results return in `fa0`. Follow the RISC-V psABI for aggregate arguments and other special cases. The setting is off by default, so an unresolved call can still report an undefined symbol; the diagnostic identifies names supplied by the library.

```riscv
.data
format: .string "%d + %d = %d\n"
.text
main:
    la a0, format
    li a1, 2
    li a2, 3
    li a3, 5
    call printf
    li a7, 10
    ecall
```

A program that calls the library this way keeps its own start and its own addresses: the library's code and data come after the program's. The library needs no initialization, so every function works without the startup code.

## Standard input {#standard-input}

Reading standard input (`scanf`, `fgets`, `getchar`) waits for a line typed in the console and keeps what the program did not read for the next call, as a terminal does. Pressing Ctrl+D, or the console's _End of input_ button, on an empty line ends standard input: the read returns end of file. In a Testcase, standard input ends when its scripted answers run out.

## Reading the library {#reading-the-library}

The **Explorer** is the file list for the current Build. It includes linked library functions as read-only files. From a call such as `call printf`, choose **Go to Definition** to open the function's assembly; choose **Show C source** to open its C implementation with matching source lines.

## Stepping {#stepping}

By default, **Step** over `call printf` runs the whole library call, and one **Undo** reverses that call. A library function that calls back into your program, such as `qsort` calling its comparison function, stops in your code. To inspect library instructions one at a time, turn on **Step into Runtime library code** in **Preferences**. With this enabled, stepping begins in startup code at `_start`.

`main` receives `argc == 0` and a valid `argv` array containing one null pointer. `malloc` follows the compiler's `max_align_t` alignment and returns NULL with ENOMEM on exhaustion. `clock()` counts executed instructions at nominal 100 MHz and excludes waiting time; Undo rewinds that counter. `time()` reports calendar time, with 2000-01-01 UTC as the fixed Testcase epoch. Library calendar conversions use UTC. Input buffering requests fail; default input remains unbuffered.
