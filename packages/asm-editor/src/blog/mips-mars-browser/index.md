## What is ASM Editor?

ASM Editor is an online workspace for writing, running, and debugging assembly programs. It brings a code editor, a processor simulator, debugging tools, and learning material into one application. You can organize source files in a project or get started with a runnable example.

The editor and simulator run in your browser, without a local installation. MIPS is one of its supported architectures, alongside RISC-V, M68K, Z80, and x86.

![C source linked to generated RISC-V assembly, with the debugger and a Flappy Bird game on the simulated screen.](/images/blog/mips-mars-browser/c-riscv-screen.webp)

## A workspace for learning assembly

ASM Editor keeps your source code, program output, and simulated machine state together. You can investigate how a program behaves, find problems, and experiment with changes.

The [MIPS course](/learn/courses/mips) and [instruction and syscall reference](/documentation/mips) support that work with lessons and examples you can run directly in the page. You can move from reading about a feature to trying it, then open the example as a project when you want more room to work.

## Tools for writing and debugging programs

- **Project workspace.** Keep a program's source files together and edit them in the browser.
- **Interactive execution.** Build and run programs, pause at breakpoints, step through execution, and use **Undo** to revisit recent execution states.
- **Program inspection.** View registers, memory, output, execution history, and the call stack alongside your code.

![ASM Editor's MIPS workspace with source code, execution controls, registers, memory, and terminal output.](/images/blog/mips-mars-browser/input-breakpoint.webp)

The debugger keeps the paused instruction, registers, memory, and execution history visible together.

## Graphics, input, and files

ASM Editor includes simulated peripherals for interactive programs. On MIPS, these include a **bitmap display** for graphics, **keyboard input**, and a **terminal** for text input and output. Programs can also read and write files in the project's virtual filesystem.

These facilities support animations, small games, and programs that work with files, all within the browser. The [screen and keyboard reference](/documentation/mips/screen) describes the available devices.

## The MARS simulator and more

ASM Editor's MIPS simulator comes from [MARS](https://dpetersanderson.github.io/Help/MarsHelpIntro.html), adapted to run in the browser. The MIPS instruction syntax, register names, and `syscall` conventions are the same, so programs or exercises made for MARS work also on ASM Editor.

But it also adds several tools around that simulator:

- **Built-in testcases.** Run a program with predefined input and check its output, registers, or memory. Results show actual values beside expected ones.
- **Shareable projects.** Send a link containing a snapshot of your files, configuration, and testcases. The recipient gets an editable copy, useful for sharing a question or distributing a classroom example.
- **Embeddable examples.** Put a runnable program in a lesson or another web page, with a button to continue in the full editor.
- **C/C++ alongside assembly.** [Compile supported C/C++ programs](/blog/posts/c-cpp-to-assembly) and inspect their source and generated instructions side by side. Compilation uses Compiler Explorer and needs an internet connection.

![C source on the left and generated MIPS assembly beside it, with matching code highlighted and the debugger open.](/images/blog/c-cpp-to-assembly/source-and-assembly.webp)

After compilation, the workspace connects C source lines to their generated instructions. You can debug the resulting program with the same register, memory, and execution controls used for assembly projects.

## Try ASM Editor

The example below reads a number and prints twice its value. Press **Build** to assemble the code, then **Run**, enter `21` in the terminal, and press **Enter**. The program will finish executing and print `Twice that is 42`.

Choose **Open in editor** to explore the debugger, run the included testcase with **Test**, or share your own version. The [getting-started guide](/blog/posts/getting-started) introduces the workspace controls.

```mips|playground|console|tall|allow-open
.data
prompt: .asciiz "Give me a number: "
answer: .asciiz "\nTwice that is "

.text
.globl main
main:
    li $v0, 4
    la $a0, prompt
    syscall

    li $v0, 5
    syscall
    move $t0, $v0
    add $t1, $t0, $t0

    li $v0, 4
    la $a0, answer
    syscall

    li $v0, 1
    move $a0, $t1
    syscall

    li $v0, 10
    syscall
```

```testcase
{
    "name": "Double 21",
    "input": ["21"],
    "expectedOutput": "Give me a number: \nTwice that is 42",
    "expectedRegisters": { "$t1": 42 }
}
```

<p><a class="blog-try-button" href="/projects/create">Try ASM Editor →</a></p>
