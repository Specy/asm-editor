Create `main.c` for C, or `main.cpp` for C++, in an x86 project. Replace its starting text with this complete program, which works in either language:

```c
#include <stdio.h>

int main(void) {
    printf("Hello from x86\n");
    return 0;
}
```

Select the source file and choose **Compile**. The generated assembly opens beside it. Choose **Build** in the assembly pane, then **Run**. Open the **Terminal** to see `Hello from x86`. The program starts in `main`; `return 0` finishes successfully.

## Help while editing {#editing-help}

Type `sim_` to see the simulator functions for this project, or press **Ctrl+Space** to open suggestions. Small snippets help you write loops, functions and structures; press **Tab** to move through their editable fields. Suggestions inside an `#include` path offer available headers.

Hover over a known function such as `printf` to see its declaration, required header and a documentation link. Parameter hints highlight the current argument while you write a call. Selecting a function inserts its name; add the indicated header yourself.

Names you declare in the current file also appear in suggestions, with variable types or function declarations. Ordinary functions get parameter hints, and nearer block declarations take priority. Complex declarations may be missed.

Editing help works locally, before Compile. It covers known language and library names; Compile checks your program and reports errors.

## Compiling a source file {#compiling}

The Compile controls use GCC and let you choose an optimization level. Start with **-O0** to follow your statements easily. Higher levels can combine statements, move instructions or remove work whose result is unused.

Compile creates an assembly file and makes it the project's entry file, which Build uses. Compile handles one C or C++ source file at a time; other `.c` or `.cpp` files are not compiled or linked automatically. Compilation needs an internet connection: your selected source and the project's local headers are sent to Compiler Explorer.

To use a local header, create `helpers.h` beside your source file in the same project:

```c
#define ANSWER 42
```

Include it with quotes, as in this complete replacement for `main.c`:

```c
#include <stdio.h>
#include "helpers.h"

int main(void) {
    printf("The answer is %d\n", ANSWER);
    return 0;
}
```

After changing the source or a local header, **Compile** again, then **Build** to run the updated program.

## Libraries and simulator services {#libraries}

Runtime support is supplied automatically. The library provides functions declared by `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`. For example, `printf` and `scanf` use the Terminal, `fopen` and `fprintf` use the project's files, and `malloc` and `free` manage dynamic memory. The [Runtime library](/documentation/x86/runtime-library) page lists its supported functions with declarations and headers, and explains calling and debugging.

C uses C17 and C++ uses C++17. C++ supports constructors, `new` and `delete`, and the provided compatibility headers `<cassert>`, `<cctype>`, `<cerrno>`, `<cfloat>`, `<cinttypes>`, `<climits>`, `<cmath>`, `<cstdarg>`, `<cstddef>`, `<cstdint>`, `<cstdio>`, `<cstdlib>`, `<cstring>`, `<ctime>` and `<new>`. For example, include `<cstdio>` and use `std::printf("Hello from x86\n");`. The full C++ standard library is not provided: `<iostream>` and containers such as `std::vector` are unavailable. Exceptions and runtime type information (RTTI) are disabled, including `typeid` and casts that require RTTI.

When a standard input function waits, type in the Terminal and press **Enter**. Unread characters remain available to later calls. Press **Ctrl+D** or **End of input** to release pending text without a newline. On an empty input line, this signals end of file for that read.

For example, this reads one integer and prints it only when the input is valid:

```c
#include <stdio.h>

int main(void) {
    int value;
    if (scanf("%d", &value) == 1) {
        printf("You entered %d\n", value);
    }
    return 0;
}
```

Include `<sim.h>` to make the simulator's Linux-style system calls directly. Find the simulator functions' signatures and results under **From C** in [Syscalls](/documentation/x86/syscall), also available in the editor's Documentation panel. `sim_write(1, text, length)` writes `length` bytes to descriptor `1`, the Terminal. Each function returns its system call's result, with failures reported as negative error numbers. Standard input functions can keep characters they read ahead, so avoid mixing `sim_read` and functions such as `scanf` on one line.

For Terminal input, `sim_read(0, buffer, size)` reads bytes into a character array and returns how many it read. Type your input and press **Enter**. On an empty input line, press **Ctrl+D** or **End of input** to finish standard input; `sim_read` then returns `0`. It does not add a string terminator. A failed simulator call returns a negative error number; check the result before using it.

This complete example echoes up to 64 input bytes. It writes exactly the number of bytes read, so it does not need to add a string terminator:

```c
#include <sim.h>

int main(void) {
    char buffer[64];
    long count = sim_read(0, buffer, sizeof(buffer));
    if (count < 0) {
        return 1;
    }
    if (count > 0) {
        sim_write(1, buffer, count);
    }
    return 0;
}
```

## Following execution {#following-execution}

Matching colors connect source lines with their generated assembly. Select a line to highlight its instructions. Use **Step** to follow those instructions, or place a breakpoint beside a source line and choose **Run** to stop at the start of its mapped assembly blocks. One source line can require several steps, especially with optimization. Use **Undo** to move back through recorded execution steps.

Compile again after reopening a saved project to restore source highlights and breakpoints. Editing generated assembly removes that connection; recompilation asks before replacing your manual assembly edits.

## Linking project Files {#linking-project-files}

Build links the generated Entry and its startup object, then searches other assembly Files for referenced symbols, then searches the Runtime library. Your secondary File can replace a support function. Duplicate strong globals are errors on both Files, even if a File would otherwise stay unused. A Problems Hint identifies each File that was not linked; constructor-only Files also need a referenced symbol to join the program. Startup passes Blink's arguments to `main`; `argv[0]` is `/program`.
