Create a C or C++ File in an x86 Project and write `main`. Select that File, choose **Compile**, then **Build** the Generated assembly and use Run or Step. Compile asks Compiler Explorer for assembly; Build assembles that result and starts the program. A source edit needs another Compile before Build can run the new C code.

## Compiling a source File {#compiling}

x86 uses GCC 14.2 with its Intel assembly output, translated to the editor's NASM Build format. Choose an optimization level in the Compile controls. Start with `-O0` when learning how each C statement becomes instructions; `-O2` may inline calls, move instructions and combine statements. Compile creates an assembly File, makes it the Entry file and opens the source and Generated assembly together. If you later choose another assembly File as Entry, use **Set as entry file** in the Explorer to return to the generated one. A Project can keep other Files and local quoted headers, but compile one C or C++ translation unit at a time. The online compiler must be reachable.

## Freestanding C and the Environment library {#libraries}

The x86 compiler has freestanding headers, and Build links a small Start unit that calls `main` and exits with its result. There is no full C Runtime library yet: `printf`, `scanf`, `malloc` and normal standard-library File I/O are unavailable. Include the header-only Environment library `<sim.h>` for the implemented Linux [syscalls](/documentation/x86/syscall):

```c
#include <sim.h>

int main(void) {
    sim_write(1, "Hello from x86\n", 15);
    return 3;
}
```

`sim_read` reads standard input from the Terminal and `sim_write` writes bytes to its transcript. At `-O0`, a `sim_` call can appear as a small local function in Generated assembly. At `-O2`, the compiler can place `syscall` at the call site. C evaluates arguments before passing them to the wrapper; inspect each syscall's **From C** field for its prototype. The Linux syscall convention puts the number in `rax`, arguments in `rdi`, `rsi`, `rdx`, `r10`, `r8`, `r9`, and the result in `rax`. The ordinary C function convention differs: the fourth argument reaches `rcx` before the wrapper moves it to `r10`. Errors return negative errno values, such as `-2` for ENOENT, through the `sim_` function.

## Following execution {#following-execution}

The source map connects C or C++ lines to Generated assembly instructions. Select a line to see the corresponding instructions; Step, Run, Breakpoints and Undo follow that mapping. A Breakpoint on a source line stops at the first instruction of each mapped block for that line. Optimized code can map several instructions or blocks to one line. Open the read-only `@runtime/include/sim.h` from a mapped call to see the Environment library code; Step can enter its instructions and Undo returns to the caller. Editing a source File, a used header or the assembly makes the map stale; Compile again to regain current highlights and source Breakpoints. A saved Project needs Compile again after reopening to recreate its transient source map.
