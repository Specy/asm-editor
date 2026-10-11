The Runtime library provides the C functions used by compiled MIPS C and C++ programs. Its functions are declared in `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`. For example, `printf` and `scanf` use the Terminal, file functions use the project's Files, and allocation functions manage program memory. The function reference entries below this overview list the supported functions with their declarations and headers. C++ also gets the support needed for global constructors, `new` and `delete`; the full C++ standard library is not included. The Build links only functions the program uses and their dependencies.

## Compiled programs {#compiled-programs}

Compiling a C or C++ file links the Runtime library automatically. Startup aligns the stack, runs global constructors, calls `main`, and passes its result to `exit`. Build completes startup before execution begins in your code: the first instruction is in `main`, or in a C++ global constructor that runs before `main`. Undo can reverse steps from that point onward; it does not reverse startup. Streams are unbuffered by default, so stepping over `printf` shows its text at once. Requested output buffering delays output until a flush, a full buffer, or a newline for line buffering.

## From hand-written assembly {#from-assembly}

Hand-written assembly can call the library too. In the Workbench's **Settings** panel, open **Project Settings** and set **Link Runtime library** to **Runtime ABI v1**. Then call a function with `jal` using the MIPS O32 calling convention:

- Argument words are 32-bit slots. The first four slots use `$a0` to `$a3`; a 64-bit value such as a `double` uses an even-numbered pair, for example `$a2` and `$a3`. Leading floating-point arguments use `$f12` and `$f14` under O32. Arguments that do not fit in the registers go on the stack.
- Reserve 16 bytes at the top of the caller's stack frame for the four argument slots, even when all arguments fit in registers. The callee may use this area to save those registers.
- Keep `$sp` a multiple of 8 at the call. The program starts with `$sp` at `0x7fffeffc`, so align it before calling. Misaligned stack access to a `double` can fault.
- Integer results return in `$v0` (a 64-bit result uses `$v0` and `$v1`); floating-point results return in `$f0`.

The setting is off by default, so a call to a function you have not written yet still reports an undefined symbol; that message says when the function is in the library.

```mips
.data
format: .asciiz "%d + %d = %d\n"
.text
main:
    li $t0, -8
    and $sp, $sp, $t0      # align the stack to 8 bytes
    addiu $sp, $sp, -16    # the argument area printf may use
    la $a0, format
    li $a1, 2
    li $a2, 3
    li $a3, 5
    jal printf
    addiu $sp, $sp, 16
    li $v0, 10
    syscall
```

A program that calls the library this way keeps its own start and its own addresses: the library's code and data come after the program's. The library needs no initialization, so every function works without the startup code.

## Standard input {#standard-input}

Reading standard input (`scanf`, `fgets`, `getchar`) waits for a line typed in the console and keeps what the program did not read for the next call, as a terminal does. Pressing Ctrl+D, or the console's _End of input_ button, on an empty line ends standard input: the read returns end of file. In a Testcase, standard input ends when its scripted answers run out.

## Reading the library {#reading-the-library}

The **Explorer** is the file list for the current Build. It includes linked library functions as read-only files. From a call such as `jal printf`, choose **Go to Definition** to open the function's assembly; choose **Show C source** to open its C implementation with matching source lines.

## Stepping {#stepping}

By default, **Step** over `jal printf` runs the whole library call, and one **Undo** reverses that call. A library function that calls back into your program, such as `qsort` calling its comparison function, stops in your code. To inspect library instructions one at a time, turn on **Step into Runtime library code** in **Preferences**. With this enabled, stepping begins in startup code at `_start`.

`main` receives `argc == 0` and a valid `argv` array containing one null pointer. `malloc` follows the compiler's `max_align_t` alignment and returns NULL with ENOMEM on exhaustion. `clock()` counts executed instructions at nominal 100 MHz and excludes waiting time; Undo rewinds that counter. `time()` reports calendar time, with 2000-01-01 UTC as the fixed Testcase epoch. Library calendar conversions use UTC. Input buffering requests fail; default input remains unbuffered.
