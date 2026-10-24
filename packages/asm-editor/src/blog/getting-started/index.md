## What is ASM Editor?

ASM Editor is an online workspace for writing, running, and debugging assembly programs. It keeps your source files, program output, and simulated machine state in one place. The editor and simulator run in your browser, without a local installation.

It supports MIPS, RISC-V, M68K, Z80, and x86. You can start with your own program, a project template, or a runnable example from the [courses](/learn/courses) and [reference documentation](/documentation).

![C source linked to generated RISC-V assembly, with the debugger and a Flappy Bird game on the simulated screen.](/images/blog/mips-mars-browser/c-riscv-screen.webp)

## Create a project

Open [Create new project](/projects/create), give it a name, and choose an **Instruction Set**. **RISC-V** selects the 32-bit target; **RISC-V-64** selects the 64-bit target. The example at the end of this guide uses **MIPS**.

Choose a **Template** for a starting program, then press **Create**. The project opens in the editor, also called the Workbench. The file explorer keeps the project's files together; select a file to open it in a tab.

You can also choose **Open in editor** on an example in a course or blog post. This opens a project containing that example and any included testcases.

## Write, build, and run

Write or edit assembly in the code pane. The controls beneath it handle building and execution:

- **Build** assembles the program and prepares the simulator.
- **Run** executes the built program. Its text output appears in **Terminal** below the code. When a program asks for input, type there and press **Enter**.
- **Stop** ends the debugging session and returns to editing. After changing the source, Build again to run the updated program.

If Build reports a problem, open **Problems** and select a message to reach the affected source line.

![A MIPS project open in the editor, with its source file, Build control, and Terminal visible.](/images/blog/getting-started/workbench.webp)

For supported targets, you can also [compile C/C++ programs](/blog/posts/c-cpp-to-assembly). **Compile** creates assembly beside the source; Build and Run then use that assembly. Compilation uses Compiler Explorer and needs an internet connection.

## Debug alongside your code

The debugger shows registers, memory, execution history, and the call stack alongside your source. You can pause a running program to inspect its state, or use the execution controls to follow it more closely:

- **Breakpoints** pause Run before an instruction. Click the margin to the left of the line numbers to add or remove one.
- **Step** executes one machine instruction. While paused with instructions remaining, the highlight marks the next instruction to run.
- **Undo** restores a recent execution state, so you can revisit a change to registers or memory. It uses a finite history, separate from undoing text edits.

![The debugger paused at a breakpoint, with registers, memory, execution history, Step, and Undo visible.](/images/blog/getting-started/breakpoint.webp)

## Test and share your work

Built-in testcases let you run a program with predefined input and check its output, registers, or memory. Choose **Test** to run the project's cases; the results show actual values beside expected ones.

Use **Share** at the top of the full editor to copy a project link. It contains a snapshot of your files, configuration, and testcases. The recipient gets an editable copy; create a new link to share later changes.

The [MIPS introduction](/blog/posts/mips-mars-browser) and [RISC-V introduction](/blog/posts/riscv-rars-browser) cover their simulators, peripherals, and other workspace features. The [courses](/learn/courses) cover the languages themselves.

## Try ASM Editor

The MIPS example below adds two numbers and prints `42`. Press **Build**, then **Run** to see the result in the terminal. The included testcase checks both the output and the result register.

Choose **Open in editor** to explore the full workspace. You can set a breakpoint beside the addition, use Step and Undo, or run the testcase with Test.

```mips|playground|console|tall|allow-open
.text
.globl main
main:
    li $t0, 17
    li $t1, 25
    add $t2, $t0, $t1

    li $v0, 1
    move $a0, $t2
    syscall

    li $v0, 11
    li $a0, '\n'
    syscall

    li $v0, 10
    syscall
```

```testcase
{
    "name": "Add 17 and 25",
    "expectedOutput": "42\n",
    "expectedRegisters": { "$t2": 42 }
}
```

<p><a class="blog-try-button" href="/projects/create">Try ASM Editor →</a></p>
