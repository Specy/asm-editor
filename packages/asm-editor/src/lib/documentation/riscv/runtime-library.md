The Runtime library provides C functions for RISC-V C and C++ programs compiled in the editor, and for assembly programs that explicitly link it. Its functions are declared in `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`. For example, `printf` and `scanf` use the Terminal, file functions use the project's Files, and allocation functions manage program memory. The function reference entries below this overview list the supported functions with their declarations and headers. C++ also gets the support needed for global constructors, `new` and `delete`; the full C++ standard library is not included. The Build links only functions the program uses and their dependencies.

## Compiled programs {#compiled-programs}

Compiling a C or C++ file links the Runtime library automatically. Startup runs global constructors, calls `main`, and passes its result to `exit`. By default, Build completes Runtime startup before execution begins in your code: the first instruction is in `main`, or in a C++ global constructor that runs before `main`. Undo can reverse steps from that point onward; it does not reverse startup. Streams are unbuffered by default, so stepping over `printf` shows its text at once. Requested output buffering delays output until a flush, a full buffer, or a newline for line buffering.

### Program arguments

Use `int main(int argc, char *argv[])` to receive startup arguments in C or C++. `argc` counts the strings, including the program name. `argv` is an array of pointers to NUL-terminated strings, with a null pointer at `argv[argc]`. `argv[0]` is `./` plus the source File's path without its final extension: `main.c` gives `./main`. The project's **Arguments** follow it. For Arguments `hello "two words"`:

| Value     | Contents       |
| --------- | -------------- |
| `argc`    | `3`            |
| `argv[0]` | `./main`       |
| `argv[1]` | `hello`        |
| `argv[2]` | `two words`    |
| `argv[3]` | A null pointer |

Check `argc > 1` before using `argv[1]`. For example, `if (argc > 1) printf("%s\n", argv[1]);` prints the first user argument when `<stdio.h>` is included. With no Arguments, `argc` is 1. Enter Arguments on the Terminal's **Command line** or in **Settings**, then Build again to apply them. These strings are separate from input read later by `scanf` or `fgets`. See [Program arguments](/documentation/risc-v/syscall#arguments) for quoting, limits, Testcase inheritance, and assembly access.

Programs have no environment variables; `getenv` always returns NULL.

### Memory and allocation

Compiled C and C++ programs reserve 4,128,768 bytes for static data from `0x10010000` through `0x103FFFFF` (exclusive end `0x10400000`). Constants, globals, and a `SIM_SCREEN` grid share this range. The heap moves to the first 4 KiB page after static data when needed. Assembly programs retain the assembler’s memory layout.

The Runtime library’s allocation service 1100 returns -1 on heap exhaustion; the assembly service 9 stops execution with a runtime error. See [`malloc`](#malloc) for allocation results and alignment.

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

A runtime error stops execution. Undo reverses recorded program state and keeps the Terminal transcript visible; Stop or Build ends the run.

By default, **Step** over `call printf` runs the whole library call, and one **Undo** reverses that call. A library function that calls back into your program, such as `qsort` calling its comparison function, stops in your code. To inspect library instructions one at a time, turn on **Step into library code** in **Preferences**. For programs compiled in the editor, enabling this Preference begins execution in Runtime startup at `_start`, so you can step through startup too.
