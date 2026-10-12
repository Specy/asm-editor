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

### Program arguments

To receive startup arguments, use `int main(int argc, char *argv[])`. `argc` is the number of argument strings, including the program name; `argv` is an array of pointers to those strings. `argv[0]` is `./` plus your source path without its final extension (`./main` for `main.c`), and the Arguments you enter start at `argv[1]`. For `hello "two words"`, `argc` is 3, `argv[1]` is `hello`, and `argv[2]` is `two words`.

Check `argc > 1` before reading the first user argument. For example, `if (argc > 1) printf("%s\n", argv[1]);` prints it when `<stdio.h>` is included. With no Arguments, `argc` is 1.

Enter **Arguments** on the Terminal's **Command line** or in the project's **Settings**, then **Build** to apply them. They are separate from text read later through `scanf` or `sim_read`. See [Program arguments](/documentation/x86/syscall#arguments) for quoting rules, limits, and Testcase inheritance.

## Libraries and simulator services {#libraries}

Runtime support is supplied automatically. The library provides functions declared by `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`. For example, `printf` and `scanf` use the Terminal, `fopen` and `fprintf` use the project's files, and `malloc` and `free` manage dynamic memory. The [Runtime library](/documentation/x86/runtime-library) page lists its supported functions with declarations and headers, and explains calling and debugging. These functions belong to the editor Runtime; the bundled Linux libraries used by imported [Executables](/documentation/x86/executables#libraries) are separate.

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

Only the selected C or C++ source is compiled automatically. Other assembly Files can provide functions or data that the generated program uses. Build includes a File when it supplies a referenced **symbol**: an exported name for a function or data. In NASM, `global add_one` exports the name `add_one`, and the label `add_one:` defines its address.

For example, a C declaration `extern int add_one(int value);` lets a call such as `add_one(41)` use an assembly function exported as `add_one`. In C++, declare it as `extern "C" int add_one(int value);` so the compiler uses that exact name. The assembly function must follow the [x86-64 function calling convention](/documentation/x86/runtime-library#from-assembly), including preserving the required registers and returning the result in `rax`.

Project assembly definitions are considered before Runtime library functions. A File can therefore replace a Runtime support function by exporting its name. Two ordinary exported definitions of the same name cause errors on both Files, even if one File would otherwise be unused.

The **Problems** panel gives a Hint for each assembly File that was not linked. A File containing only global constructors is not included automatically: it must also supply a name referenced by the program. Other C or C++ Files are not compiled or linked automatically.
