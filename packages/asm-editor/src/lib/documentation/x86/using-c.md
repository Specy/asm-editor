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

Hover over a known function such as `printf`, `open` or `poll` to see its declaration, required header and documentation link. Device and POSIX function help also describes arguments, return values and errors. Parameter hints highlight the current argument while you write a call. Selecting a function inserts its name; add the indicated header yourself.

Names you declare in the current file also appear in suggestions, with variable types or function declarations. Ordinary functions get parameter hints, and nearer block declarations take priority. Complex declarations may be missed.

Editing help works locally, before Compile. It covers known language and library names; Compile checks your program and reports errors.

## Compiling a source file {#compiling}

The Compile controls use GCC and let you choose an optimization level. Start with **-O0** to follow your statements easily. Higher levels can combine statements, move instructions or remove work whose result is unused.

Compile creates an assembly file and makes it the project's entry file, which Build uses. Compile handles one C or C++ source file at a time; other `.c` or `.cpp` files are not compiled or linked automatically. Compilation needs an internet connection: your selected source and the project files its `#include "…"` lines reach are sent to Compiler Explorer, and nothing else of the project.

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

A quoted `#include` may name a `.c` file too: the compiler pastes its text in, exactly as it does a header's, so a program can be split across several `.c` files that one source includes. Each file is then part of that one compilation, not a separate one linked later.

After changing the source or a file it includes, **Compile** again, then **Build** to run the updated program.

### Program arguments

To receive startup arguments, use `int main(int argc, char *argv[])`. `argc` is the number of argument strings, including the program name; `argv` is an array of pointers to those strings. `argv[0]` is `./` plus your source path without its final extension (`./main` for `main.c`), and the Arguments you enter start at `argv[1]`. For `hello "two words"`, `argc` is 3, `argv[1]` is `hello`, and `argv[2]` is `two words`.

Check `argc > 1` before reading the first user argument. For example, `if (argc > 1) printf("%s\n", argv[1]);` prints it when `<stdio.h>` is included. With no Arguments, `argc` is 1.

Enter **Arguments** on the Terminal's **Command line** or in the project's **Settings**, then **Build** to apply them. They are separate from text read later through `scanf` or `sim_read`. See [Program arguments](/documentation/x86/syscall#arguments) for quoting rules, limits, and Testcase inheritance.

## Libraries and simulator services {#libraries}

Runtime support is supplied automatically. The library provides functions declared by `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`. For example, `printf` and `scanf` use the Terminal, `fopen` and `fprintf` read and write files, and `malloc` and `free` manage dynamic memory. The [Runtime library](/documentation/x86/runtime-library) page lists its supported functions with declarations and headers, and explains calling and debugging. These functions belong to the editor Runtime; the bundled Linux libraries used by imported [Executables](/documentation/x86/executables#libraries) are separate.

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

Device programs can use the POSIX functions `open`, `read`, `write`, `close`, `ioctl`, `mmap`, `poll`, `select`, `tcgetattr`, `tcsetattr`, `usleep`, `nanosleep` and `clock_gettime`. Their declarations come from `<fcntl.h>`, `<unistd.h>`, `<sys/ioctl.h>`, `<sys/mman.h>`, `<poll.h>`, `<sys/select.h>`, `<termios.h>` and `<time.h>`. Device constants and structures come from `<linux/fb.h>`, `<linux/input.h>`, `<sys/soundcard.h>`, `<sound/asound.h>` and `<linux/kd.h>`.

A program can manage files and folders with `rename` and `remove` from `<stdio.h>`, `unlink` and `rmdir` from `<unistd.h>`, and `mkdir` from `<sys/stat.h>`. A folder made with `mkdir` stays after the program ends once a file is put in it. `setitimer` from `<sys/time.h>` sends `SIGALRM` again and again, for a handler that `signal` from `<signal.h>` installs: `struct itimerval timer = { { 0, 10000 }, { 0, 10000 } };` then `setitimer(ITIMER_REAL, &timer, NULL);` calls it every 10 milliseconds.

These functions use C error conventions. Calls such as `open`, `read`, `write` and `ioctl` return -1 on failure and set `errno`; `mmap` returns `MAP_FAILED` instead. Include `<errno.h>` to inspect the error number. A successful `read` or `write` returns a byte count, which may be smaller than requested. After a short write, submit the remaining bytes. [The Screen](/documentation/x86/screen), [Keys and the pointer](/documentation/x86/input) and [Sound](/documentation/x86/sound) show these interfaces in use.

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

Only the selected C or C++ source is compiled automatically. Other assembly files in the same project can provide functions or data, even from a different folder. Files used as another program's entry or included by it are not searched for this Build.

Build includes an assembly file when it supplies a **symbol** the program references: an exported name for a function or data. In NASM, `global add_one` exports `add_one`, and the label `add_one:` defines its address. References from a linked file can bring in further assembly files.

In C, declare `extern int add_one(int value);` before calling `add_one(41)`. In C++, use `extern "C" int add_one(int value);` so the compiler uses the exact name `add_one`. The assembly function must follow the [x86-64 function calling convention](/documentation/x86/runtime-library#from-assembly), including register preservation and returning this integer result in `rax`.

Your assembly files are searched before Runtime library functions, so exporting a Runtime function's name can replace it. Two ordinary exported definitions of one name cause an error when both files are linked. Files the program does not need are left out without being assembled. Separate programs can therefore each define `main` in the same project, provided their files are not linked together.

The **Problems** panel marks each unused assembly file with the Hint: "The program doesn't use this File, so it is left out."

A file containing only global constructors, which initialize global objects before `main`, is not included automatically. To include it, request one of its exported names with `SIM_LINK` from `<sim.h>`, once, outside any function: `SIM_LINK(setup_tables);`. In NASM, `required setup_tables` makes the same request. This includes the file without calling `setup_tables`. Build fails if no file defines the name. Other C or C++ source files are not compiled or linked automatically.
