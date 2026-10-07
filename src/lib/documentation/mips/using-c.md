Create `main.c` for C, or `main.cpp` for C++, in a MIPS project. Replace its starting text with this complete program, which works in either language:

```c
#include <stdio.h>

int main(void) {
    printf("Hello from MIPS\n");
    return 0;
}
```

Select the source file and choose **Compile**. The generated assembly opens beside it. Choose **Build** in the assembly pane, then **Run**. Open the **Terminal** to see `Hello from MIPS`. The program starts in `main`; `return 0` finishes successfully.

## Help while editing {#editing-help}

Type `sim_` to see the simulator functions for this project, or press **Ctrl+Space** to open suggestions. Small snippets help you write loops, functions and structures; press **Tab** to move through their editable fields. Suggestions inside an `#include` path offer available headers.

Hover over a known function such as `printf` to see its declaration, required header and a documentation link. Parameter hints highlight the current argument while you write a call. Selecting a function inserts its name; add the indicated header yourself.

Editing help works locally, before Compile. It covers known language and library names; Compile checks your program and reports errors.

## Compiling a source file {#compiling}

The Compile controls offer Clang or GCC and an optimization level. Start with **-O0** to follow your statements easily. Higher levels can combine statements, move instructions or remove work whose result is unused.

Compile creates an assembly file and makes it the project's entry file, which Build uses. Compile handles one C or C++ source file at a time; other `.c` or `.cpp` files are not compiled or linked automatically. Compilation needs an internet connection: your selected source and the project's local headers are sent to Compiler Explorer.

To use a local header, create `helpers.h` beside your source file in the same project:

```c
#define ANSWER 42
```

Include it with quotes in `main.c`:

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

Runtime support is supplied automatically. Supported C functions include `printf` and `scanf` from `<stdio.h>`, `malloc` and `free` from `<stdlib.h>`, string helpers from `<string.h>` and math functions from `<math.h>`. Functions such as `fopen` and `fprintf` work with the project's files. See the [Runtime library](/documentation/mips/runtime-library) for more detail.

C uses C17 and C++ uses C++17. C++ supports constructors, `new` and `delete`, and C compatibility headers: for example, include `<cstdio>` and use `std::printf("Hello from MIPS\n");`. The full C++ standard library is not provided: `<iostream>` and containers such as `std::vector` are unavailable. Exceptions and runtime type information (RTTI) are disabled, including `typeid` and casts that require RTTI.

When a standard input function waits, type in the Terminal and press **Enter**. Unread characters remain available to later calls. On an empty input line, press **Ctrl+D** or **End of input** to signal end of file.

Include `<sim.h>` to use simulator services such as `sim_print_string` or `sim_read_int`. Find their signatures and results under **From C** in [Syscalls](/documentation/mips/syscall), also available in the editor's Documentation panel. The number and string `sim_read_*` functions take a line, while `sim_read_char` takes one key. Standard input functions share buffered input; avoid mixing the two interfaces on one line.

## Screen and device registers {#screen-and-devices}

Declare `SIM_SCREEN` outside any function, then assign colors to its array. Compile, Build and Run this program, and open the [Screen](/documentation/mips/screen) to see a red pixel at column 10, row 10:

```c
#include <sim.h>

SIM_SCREEN(pixels, 64, 64, 1);

int main(void) {
    pixels[10 * 64 + 10] = sim_rgb(255, 0, 0);
    return 0;
}
```

Width and height are display pixels; `unit` is the side length of each colored cell. Each row has `width / unit` cells; select a cell with `y * (width / unit) + x`. Width and height can be 64, 128, 256, 512 or 1024; unit can be 1, 2, 4, 8, 16 or 32.

For keyboard and character display input and output, `<sim.h>` also provides `sim_keyboard_ready`, `sim_keyboard_read`, `sim_display_ready` and `sim_display_write`.

## Following execution {#following-execution}

Matching colors connect source lines with their generated assembly. Select a line to highlight its instructions. Use **Step** to follow those instructions, or place a breakpoint beside a source line and choose **Run** to stop at the start of its mapped assembly blocks. One source line can require several steps, especially with optimization. Use **Undo** to move back through recorded execution steps.

Compile again after reopening a saved project to restore source highlights and breakpoints. Editing generated assembly removes that connection; recompilation asks before replacing your manual assembly edits.
