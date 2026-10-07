Create a C or C++ File in a RISC-V or RISC-V-64 Project and write `main`. Select that File, choose **Compile**, then **Build** the Generated assembly and use Run or Step. Compile asks Compiler Explorer for assembly; Build assembles that result and starts the program. A source edit needs another Compile before Build can run the new C code.

## Compiling a source File {#compiling}

The Compile controls offer Clang or GCC and an optimization level for RV32 and RV64. Start with `-O0` when learning how each C statement becomes instructions; `-O2` may inline calls, move instructions and combine statements. Compile creates an assembly File, makes it the Entry file and opens the source and Generated assembly together. If you later choose another assembly File as Entry, use **Set as entry file** in the Explorer to return to the generated one. A Project can keep other Files and local quoted headers, but compile one C or C++ translation unit at a time. The online compiler must be reachable.

## Libraries and simulator services {#libraries}

The [Runtime library](/documentation/risc-v/runtime-library) supplies standard C functions such as `printf`, `scanf`, `malloc` and File I/O. Compiled programs link it automatically. The **Environment library**, `<sim.h>`, instead exposes the RARS [syscalls](/documentation/risc-v/syscall) as `sim_` functions. It is header-only: include it in the source File and use its prototypes, for example:

```c
#include <sim.h>

int main(void) {
    sim_print_string("Hello from RISC-V\n");
    sim_exit2(3);
}
```

At `-O0`, a `sim_` call can appear as a small local function in Generated assembly. At `-O2`, the compiler can place its `ecall` at the call site. Each argument is evaluated through C before it reaches the service's registers; inspect a service's **From C** field for its exact prototype and result. RARS syscalls use `a7` for the service number and generally `a0`–`a6` or floating-point argument registers for values. Ordinary RV32 ILP32D and RV64 LP64D function calls use `call` and return through `ra`, pass arguments in `a0`–`a7` or `fa0`–`fa7`, keep `sp` aligned, and return an integer in `a0` or a floating-point value in `fa0`. See the [Runtime library](/documentation/risc-v/runtime-library#from-assembly) for assembly calls. The number and string `sim_read_*` services take their own input lines; `sim_read_char` takes one key. Standard input functions such as `scanf` keep a shared byte stream, so avoid mixing these interfaces on one line.

## Screen and device registers {#screen-and-devices}

`<sim.h>` also offers `SIM_SCREEN(name, width, height, unit)` for a bitmap array and a matching `@screen` directive, `sim_rgb`, and volatile accessors for the keyboard and display registers. Width and height are display pixels; the array has `(width / unit) × (height / unit)` words, so its row stride is `width / unit`. For example, `SIM_SCREEN(pixels, 64, 64, 1);` creates an array that the [Screen](/documentation/risc-v/screen) displays; assign `pixels[y * 64 + x] = sim_rgb(255, 0, 0);`. The array's location is chosen by the compiler. The Generated assembly carries the screen directive, so there is no address to hard-code.

## Following execution {#following-execution}

The source map connects C or C++ lines to Generated assembly instructions. Select a line to see the corresponding instructions; Step, Run, Breakpoints and Undo follow that mapping. A Breakpoint on a source line stops at the first instruction of each mapped block for that line. Optimized code can map several instructions or blocks to one line. Open the read-only `@runtime/include/sim.h` from a mapped call to see the Environment library code; Step can enter its instructions and Undo returns to the caller. Editing a source File, a used header or the assembly makes the map stale; Compile again to regain current highlights and source Breakpoints. A saved Project needs Compile again after reopening to recreate its transient source map.
