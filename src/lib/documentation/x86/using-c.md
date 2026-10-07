Create `main.c` for C, or `main.cpp` for C++, in an x86 project. Replace its starting text with this complete program, which works in either language:

```c
#include <sim.h>

int main(void) {
    const char text[] = "Hello from x86\n";
    sim_write(1, text, sizeof(text) - 1);
    return 0;
}
```

Select the source file and choose **Compile**. The generated assembly opens beside it. Choose **Build** in the assembly pane, then **Run**. Open the **Terminal** to see `Hello from x86`. The program starts in `main`; `return 0` finishes successfully.

## Help while editing {#editing-help}

Type `sim_` to see the simulator functions for this project, or press **Ctrl+Space** to open suggestions. Small snippets help you write loops, functions and structures; press **Tab** to move through their editable fields. Suggestions inside an `#include` path offer available headers.

Hover over a known function such as `sim_write` to see its declaration, required header and a documentation link. Parameter hints highlight the current argument while you write a call. Selecting a function inserts its name; add the indicated header yourself.

Names you declare in the current file also appear in suggestions, with variable types or function declarations. Ordinary functions get parameter hints, and nearer block declarations take priority. Complex declarations may be missed.

Editing help works locally, before Compile. It covers known language and library names; Compile checks your program and reports errors.

## Compiling a source file {#compiling}

The Compile controls use GCC and let you choose an optimization level. Start with **-O0** to follow your statements easily. Higher levels can combine statements, move instructions or remove work whose result is unused.

Compile creates an assembly file and makes it the project's entry file, which Build uses. Compile handles one C or C++ source file at a time; other `.c` or `.cpp` files are not compiled or linked automatically. Compilation needs an internet connection: your selected source and the project's local headers are sent to Compiler Explorer.

To use a local header, create `helpers.h` beside your source file in the same project:

```c
#define GREETING "Hello from a header\n"
```

Include it with quotes, as in this complete replacement for `main.c`:

```c
#include <sim.h>
#include "helpers.h"

int main(void) {
    const char text[] = GREETING;
    sim_write(1, text, sizeof(text) - 1);
    return 0;
}
```

After changing the source or a local header, **Compile** again, then **Build** to run the updated program.

## Libraries and simulator services {#libraries}

x86 programs use `<sim.h>` for input and output. The C standard library is unavailable on this target: you cannot use `printf`, `scanf`, `malloc` or standard file functions such as `fopen`. Basic headers such as `<stddef.h>` and `<stdint.h>` are provided.

C uses C17 and C++ uses C++17. C++ can use basic headers such as `<cstddef>` and `<cstdint>`, together with `<sim.h>`. The full C++ standard library is not provided: `<cstdio>`, `<iostream>` and containers such as `std::vector` are unavailable. Exceptions and runtime type information (RTTI) are disabled, including `typeid` and casts that require RTTI. Ordinary dynamic allocation with `new` and `delete` is not provided on this target. Use fixed arrays and objects stored locally or globally.

Find the simulator functions' signatures and results under **From C** in [Syscalls](/documentation/x86/syscall), also available in the editor's Documentation panel. In the first program, `sim_write` uses descriptor `1` for Terminal output. Its final argument is the number of bytes to print; `sizeof(text) - 1` excludes the string's terminating zero.

For Terminal input, `sim_read(0, buffer, size)` reads bytes into a character array and returns how many it read. Type your input and press **Enter**. On an empty input line, press **Ctrl+D** or **End of input** to finish standard input; `sim_read` then returns `0`. It does not add a string terminator. A failed simulator call returns a negative error number; check the result before using it.

## Following execution {#following-execution}

Matching colors connect source lines with their generated assembly. Select a line to highlight its instructions. Use **Step** to follow those instructions, or place a breakpoint beside a source line and choose **Run** to stop at the start of its mapped assembly blocks. One source line can require several steps, especially with optimization. Use **Undo** to move back through recorded execution steps.

Compile again after reopening a saved project to restore source highlights and breakpoints. Editing generated assembly removes that connection; recompilation asks before replacing your manual assembly edits.
