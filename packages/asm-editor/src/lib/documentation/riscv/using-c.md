Create `main.c` for C, or `main.cpp` for C++, in a RISC-V or RISC-V-64 project. Replace its starting text with this complete program, which works in either language:

```c
#include <stdio.h>

int main(void) {
    printf("Hello from RISC-V\n");
    return 0;
}
```

Select the source file and choose **Compile**. The generated assembly opens beside it. Choose **Build** in the assembly pane, then **Run**. Open the **Terminal** to see `Hello from RISC-V`. The program starts in `main`; `return 0` finishes successfully.

## Help while editing {#editing-help}

Type `sim_` to see the simulator functions for this project, or press **Ctrl+Space** to open suggestions. Small snippets help you write loops, functions and structures; press **Tab** to move through their editable fields. Suggestions inside an `#include` path offer available headers.

Hover over a known function such as `printf` to see its declaration, required header and a documentation link. Parameter hints highlight the current argument while you write a call. Selecting a function inserts its name; add the indicated header yourself.

Names you declare in the current file also appear in suggestions, with variable types or function declarations. Ordinary functions get parameter hints, and nearer block declarations take priority. Complex declarations may be missed.

Editing help works locally, before Compile. It covers known language and library names; Compile checks your program and reports errors.

## Compiling a source file {#compiling}

The Compile controls offer Clang or GCC and an optimization level for both targets. Start with **-O0** to follow your statements easily. Higher levels can combine statements, move instructions or remove work whose result is unused.

Compile creates an assembly file and makes it the project's entry file, which Build uses. Compile handles one C or C++ source file at a time; other `.c` or `.cpp` files are not compiled or linked automatically. Compilation needs an internet connection: your selected source and the project files its `#include "…"` lines reach are sent to Compiler Explorer, and nothing else of the project.

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

A quoted `#include` may name a `.c` file too: the compiler pastes its text in, exactly as it does a header's, so a program can be split across several `.c` files that one source includes. Each file is then part of that one compilation, not a separate one linked later.

After changing the source or a file it includes, **Compile** again, then **Build** to run the updated program.

## Libraries and simulator services {#libraries}

Runtime support is supplied automatically. The library provides functions declared by `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`. For example, `printf` and `scanf` use the Terminal, `fopen` and `fprintf` read and write files, and `malloc` and `free` manage dynamic memory. The [Runtime library](/documentation/risc-v/runtime-library) page lists its supported functions with declarations and headers, and explains calling and debugging.

C uses C17 and C++ uses C++17. C++ supports constructors, `new` and `delete`, and the provided compatibility headers `<cassert>`, `<cctype>`, `<cerrno>`, `<cfloat>`, `<cinttypes>`, `<climits>`, `<cmath>`, `<cstdarg>`, `<cstddef>`, `<cstdint>`, `<cstdio>`, `<cstdlib>`, `<cstring>`, `<ctime>` and `<new>`. For example, include `<cstdio>` and use `std::printf("Hello from RISC-V\n");`. The full C++ standard library is not provided: `<iostream>` and containers such as `std::vector` are unavailable. Exceptions and runtime type information (RTTI) are disabled, including `typeid` and casts that require RTTI.

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

Include `<sim.h>` to use simulator services such as `sim_print_string` or `sim_read_int`. Find their signatures and results under **From C** in [Syscalls](/documentation/risc-v/syscall), also available in the editor's Documentation panel. The number and string `sim_read_*` functions take a line, while `sim_read_char` takes one key. Standard input functions share buffered input; avoid mixing the two interfaces on one line.

## Screen and device registers {#screen-and-devices}

Declare `SIM_SCREEN` outside any function, then assign colors to its array. Compile, Build and Run this program, and open the [Screen](/documentation/risc-v/screen) to see a red pixel at column 10, row 10:

```c
#include <sim.h>

SIM_SCREEN(pixels, 64, 64, 1);

int main(void) {
    pixels[10 * 64 + 10] = sim_rgb(255, 0, 0);
    return 0;
}
```

Width and height are display pixels; `unit` is the side length of each colored cell. Each row has `width / unit` cells; select a cell with `y * (width / unit) + x`. Width and height can be any whole number of pixels from 1 to 1024, and unit any from 1 to 32. RARS's own display only offers 64, 128, 256, 512 or 1024 and 1, 2, 4, 8, 16 or 32, so a program that also runs there keeps to those.

For keyboard and character display input and output, `<sim.h>` also provides `sim_keyboard_ready`, `sim_keyboard_read`, `sim_display_ready` and `sim_display_write`. For programmable waveforms and sample playback, it names the [Synth](/documentation/risc-v/synth#from-c)'s registers and provides `sim_synth_play`, `sim_synth_gate` and `sim_synth_upload`. For the keys held, key and button events, the mouse pointer and the wheel, it names the [Input controller](/documentation/risc-v/input-controller#from-c)'s registers and every key, and provides `sim_input_present`, `sim_input_pending`, `sim_input_event`, `sim_input_key_down` and `sim_input_pointer`. For streamed sound, it names the [MIDI port and the sampled-audio output](/documentation/risc-v/midi-and-audio#from-c)'s registers, and provides `sim_midi_present`, `sim_midi_write`, `sim_pcm_present`, `sim_pcm_start`, `sim_pcm_free` and `sim_pcm_write`.

## Following execution {#following-execution}

Matching colors connect source lines with their generated assembly. Select a line to highlight its instructions. Use **Step** to follow those instructions, or place a breakpoint beside a source line and choose **Run** to stop at the start of its mapped assembly blocks. One source line can require several steps, especially with optimization. Use **Undo** to move back through recorded execution steps.

Compile again after reopening a saved project to restore source highlights and breakpoints. Editing generated assembly removes that connection; recompilation asks before replacing your manual assembly edits.

## Linking assembly Files {#linking-project-files}

Only the selected C or C++ source is compiled. Assembly Files beside it can supply functions or data the program uses. Build links a File when the program uses a **global** it defines: a name the File declares with `.globl` and defines with a label. For example, this program calls `triple`, which `triple.riscv` defines:

```c
int triple(int value);

int main(void) {
    return triple(14);
}
```

```riscv
# triple.riscv
        .text
        .globl  triple
triple:
        slli    t0, a0, 1
        add     a0, t0, a0
        ret
```

The function must follow the [calling convention](/documentation/risc-v/runtime-library#from-assembly) compiled code uses, with its arguments in `a0` to `a7` and its result in `a0`.

A File the program does not use is left out, and is not even assembled, so an exercise in RARS's own syntax, or a File with mistakes, beside the program never breaks it. The **Problems** panel gives such a File a Hint: "This File is not part of the program: the program uses nothing it defines."

A File the program uses is assembled as GNU assembly, the syntax C compiles to. Most of RARS's own syntax reads the same, but not all of it: GNU names the CSR first, `csrw utvec, t0`, where RARS writes `csrw t0, utvec`, and it has no `.eqv` and no `.macro`. When such a File does not assemble, the first error says why it was linked and that it must be written in GNU syntax.

A trap handler is linked like any other function: the program stores its address in `utvec`, which uses its name. [Interrupts and the timer](/documentation/risc-v/interrupts) shows one. To link a File the program never names, such as one whose only work is a constructor that runs before `main`, ask for one of its globals with `SIM_LINK` from `<sim.h>`, once, outside any function:

```c
#include <sim.h>

SIM_LINK(install_handler);
```

`SIM_LINK` counts as a use of the name, as if the program called it, and Build fails when no File defines the name.
