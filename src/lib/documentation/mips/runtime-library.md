The Runtime library is the C standard library that programs compiled from C and C++ use: `printf` and `scanf` on the Terminal, `fopen` and `fprintf` on the Project's Files, `malloc`, `<string.h>`, `<ctype.h>`, `<math.h>` and the support C++ needs for constructors, `new` and `delete`. Its functions are ordinary MIPS code that the Build links into the program: only the functions the program uses, and the ones those need in turn.

## Compiled programs {#compiled-programs}

Compiling a C or C++ File links the Runtime library automatically. The program starts at the library's `_start`, which aligns the stack, runs global constructors, calls `main`, and passes its result to `exit`. A Build runs `_start` up to the program's own code, so it stops at the first line of `main`, or of a C++ global constructor, which runs before `main`; Undo never goes back into `_start`. Output appears as soon as each call returns, so stepping over a `printf` shows its text on the Terminal at once.

## From hand-written assembly {#from-assembly}

Hand-written assembly can call the library too. Turn on _Link Runtime library_ in the Project Settings, then call a function with `jal` as the O32 convention the library is compiled for expects:

- the first four argument words go in `$a0` to `$a3`, a `double` in an even and odd pair such as `$a2` and `$a3`, and the rest on the stack after a 16-byte area the caller reserves, even when every argument fits in registers;
- `$sp` must be a multiple of 8 at the call: the library stores doubles on the stack, and MIPS faults on a misaligned one, while the program starts with `$sp` at `0x7fffeffc`;
- the result comes back in `$v0`, or `$f0` for floating point.

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

The library's code is MIPS assembly like any other, compiled from C. The Explorer lists, read-only, the functions the current Build linked; go to definition on a `jal printf` opens `printf`'s code, and _Show C source_ opens the C it was compiled from beside it, with the lines of the two matched as in a compiled program.

## Stepping {#stepping}

Step does not stop inside the library: stepping over `jal printf` runs the whole call, and one Undo takes it back. A library function that calls back into the program, such as the comparison function `qsort` receives, stops there. Turn on _Step into Runtime library code_ in the Preferences to step through the library instruction by instruction, starting at `_start`.
