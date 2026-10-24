The Runtime library provides C functions for MIPS C and C++ programs compiled in the editor, and for assembly programs that explicitly link it. Its functions are declared in `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`. For example, `printf` and `scanf` use the Terminal, file functions use the project's Files, and allocation functions manage program memory. The function reference entries below this overview list the supported functions with their declarations and headers. C++ also gets the support needed for global constructors, `new` and `delete`; the full C++ standard library is not included. The Build links only functions the program uses and their dependencies.

## Compiled programs {#compiled-programs}

Compiling a C or C++ file links the Runtime library automatically. Startup aligns the stack, runs global constructors, calls `main`, and passes its result to `exit`. By default, Build completes Runtime startup before execution begins in your code: the first instruction is in `main`, or in a C++ global constructor that runs before `main`. Undo can reverse steps from that point onward; it does not reverse startup. Streams are unbuffered by default, so stepping over `printf` shows its text at once. Requested output buffering delays output until a flush, a full buffer, or a newline for line buffering.

### Program arguments

Use `int main(int argc, char *argv[])` to receive startup arguments in C or C++. `argc` counts the strings, including the program name. `argv` is an array of pointers to NUL-terminated strings, with a null pointer at `argv[argc]`. `argv[0]` is `./` plus the source File's path without its final extension: `main.c` gives `./main`. The project's **Arguments** follow it. For Arguments `hello "two words"`:

| Value     | Contents       |
| --------- | -------------- |
| `argc`    | `3`            |
| `argv[0]` | `./main`       |
| `argv[1]` | `hello`        |
| `argv[2]` | `two words`    |
| `argv[3]` | A null pointer |

Check `argc > 1` before using `argv[1]`. For example, `if (argc > 1) printf("%s\n", argv[1]);` prints the first user argument when `<stdio.h>` is included. With no Arguments, `argc` is 1. Enter Arguments on the Terminal's **Command line** or in **Settings**, then Build again to apply them. These strings are separate from input read later by `scanf` or `fgets`. See [Program arguments](/documentation/mips/syscall#arguments) for quoting, limits, Testcase inheritance, and assembly access.

Programs have no environment variables; `getenv` always returns NULL.

### Memory and allocation

Compiled C and C++ programs reserve 4,128,768 bytes for static data from `0x10010000` through `0x103FFFFF` (exclusive end `0x10400000`). Constants, globals, and a `SIM_SCREEN` grid share this range. The heap moves after static data when needed. Assembly programs retain the assembler’s memory layout.

The Runtime library’s allocation service 1100 returns -1 on heap exhaustion; the assembly service 9 stops execution with a runtime error. See [`malloc`](#malloc) for allocation results and alignment.

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

A runtime error stops execution. Undo reverses recorded program state, what the program printed included; Stop or Build ends the run.

By default, **Step** over `jal printf` runs the whole library call, and one **Undo** reverses that call. A library function that calls back into your program, such as `qsort` calling its comparison function, stops in your code. To inspect library instructions one at a time, turn on **Step into library code** in **Preferences**. For programs compiled in the editor, enabling this Preference begins execution in Runtime startup at `_start`, so you can step through startup too.
