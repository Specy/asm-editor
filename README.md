🟢 We are looking for people to help with documentation and courses, you can look at more info [here](https://github.com/Specy/asm-editor/issues/27)

# Asm editor

A webapp made with [sveltekit](https://kit.svelte.dev/), [rust](https://www.rust-lang.org/it) webassembly and [java TEAVM](https://teavm.org/) to learn, write and run M68K, MIPS and X86 assembly code.
Uses monaco-editor for the editor, my [WASM M68K interpreter](https://github.com/Specy/s68k) to run the code, a Java [MIPS Assembler (mars)](https://github.com/Specy/mars) compiled to javascript and a Java [RISC-V Assembler (rars)](https://github.com/Specy/rars) compiled to javascript.

It is made to help people approaching assembly by providing the tools necessary to write and debug code more easily.
![localImage](https://asm-editor.specy.app/images/ASM-editor.webp)

## App features

- Code completion and syntax highlighting
- Run the program or step through it
- Code breakpoints, settings, input/output interrupts, undo, formatter and more
- Inspect the value of each register and memory address to see which was changed with each instruction
- Create new projects and manage them all in the webapp
- IDE with semantic checks and useful errors to help you learn assembly
- Built-in documentation and intellisense with addressing modes, descriptions and examples
- Customisable settings and shortcuts, including theme customization

## Editor Tools

Once running the program there are many tools to help you understand what instructions did and debug the code.

- Values which changed between each instructions are highlighted and the old value is also visible. registers and memory have tooltips to show the decimal/hexadecimal value.
- Follow the stack pointer with the dedicated tab, it's split in rows of 4 bytes to make it easier to see the changes
- Whenever a jump with link instruction is executed, the callstack is saved so that it can be seen
- A view of the changes to the state of the interpreter is visible to see what each instruction did, like register / memory writes and changes to the ccr, it is also possible to jump back to a previous state
- step/undo the code, add breakpoints, and jump to a specific execution step
- Testcase runner, with IO and initial memory/register setup to create "exercises" and test your code
- Full memory viewer to inspect a memory region, string conversion, hex/dec conversion, signed/unsigned conversion, and more

## Code completion and syntax highlighting

The editor suggests you with the available instructions and the valid addressing modes for each operand, while also
giving a simple description and example.

## Documentation

The webapp comes with a [built-in documentation](https://asm-editor.specy.app/documentation), both available inside the editor and as a separate page. It explains brefly how each instruction works and the addressing modes, further documentation is coming in the future.

## Settings and shortcuts

Settings to choose from to customise the editor and the interpreter, like how to view the registers, how many steps to keep in history, themes, etc. There are also some shortcuts to ease the use of the editor, which can be changed in the settings.

## Projects

Projects are stored locally on your browser, and with the app also working offline, you can create and manage them all in the webapp. Export and import to come in the future.

## Embed the editor

You can embed the editor [here](https://asm-editor.specy.app/embed), by using an iframe, you can set the initial code and additional settings by passing them as query parameters. Which can be built by visiting the link above.

# Local setup

You must have node.js 20+ installed, then you can clone the repository and run:

```bash
npm install
npm run dev # to run the dev server
# npm run build # to build the app
```

# Contributing

If you wish to contribute, make a new issue to discuss the changes you want to make (or comment on an existing one).

We are looking for people to help with documentation and courses, you can look at more info [here](https://github.com/Specy/asm-editor/issues/27)

# Benchmarks M68K

The M68K interpreter runs at round 50mhz on the browser and 60mhz natively (on my machine).
You can benchmark your own machine by running a loop, the time it took to run is shown in the bottom right of the console in the editor, the total time of each execution is shown. example code:

```asm
limit equ 10000000
move.l #limit, d0
move.l #0, d1
for:
    add.l #1, d1
    sub.l #1, d0
    bne for
```

This runs 30 million instructions, make sure you set the Maximum instructions iteration, Maximum history size and Maximum visible history size to 0, as well as not having any breakpoints, this will turn off the
debugging tools and run the code as fast as possible.

# Benchmarks MIPS

The MIPS interpreter runs at round 2mhz on the browser.
Just like the M68K you can run this code to benchmark your own browser:

```asm
main:
    li   $t0, 1000000
    li   $t1, 0
for:
    addi $t1, $t1, 1
    addi $t0, $t0, -1
    bne  $t0, $zero, for

```

This runs 3 million instructions.
