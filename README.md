# Asm editor 

A webapp made with [sveltekit](https://kit.svelte.dev/) and [rust](https://www.rust-lang.org/it) webassembly to learn, write and run m68k assembly code.
Uses monaco-editor for the editor, and my [WASM M68K interpreter](https://github.com/Specy/s68k) to run the code.

Mainly made to help people approaching assembly by providing the tools necessary to write and debug code more easily.
![localImage](./static/images/ASM-editor.png)

## Features recap
* Simple code completition and full syntax highlighting
* Run the program or step through it
* Code breakpoints, settings, input/output interrupts, undo, formatter and more
* Inspect the value of each register and memory address to see which was changed with each instruction
* Create new projects and manage them all in the webapp 
* Integrated IDE with semantic checks and useful errors to help you learn assembly
* Integrated documentation and intellisense with addressing modes, descriptions and examples
* Customisable settings and shortcuts, including theme customization


## Code completion and syntax highlighting
The editor suggests you with the available instructions and the valid addressing modes for each operand, while also
giving a simple description and example.

## Step and undo
The code can be run completely or step by step, the changes to the state of the interpreter is kept in memory so that it can be undone. Breakpoints can be set to stop the execution at a specific line while running, to then proceed with stepping.

## Documentation
The webapp comes with a built-in documentation, both available inside the editor and as a separate page. It explains brefly how each instruction works and the addressing modes, further documentation is coming in the future.

## Settings and shortcuts
Settings to choose from to customise the editor and the interpreter, like how to view the registers, how many steps to keep in history, themes, etc. There are also some shortcuts to ease the use of the editor, which can be changed in the settings.

## Projects
Projects are stored locally on your browser, and with the app also working offline, you can create and manage them all in the webapp. Export and import to come in the future.

## Tools
Once running the program there are many tools to help you understand what instructions did and debug the code.
* Values which changed between each instructions are highlighted and the old value is also visible. registers and memory have tooltips to show the decimal/hexadecimal value.
* Follow the stack pointer with the dedicated tab, it's split in rows of 4 bytes to make it easier to see the changes
* Whenever a jsr / bsr / rts instruction is executed, the callstack is saved so that it can be seen 
* A view of the changes to the state of the interpreter is visible to see what each instruction did, like register / memory writes and changes to the ccr, it is alsoo possible to jump back to a previous state
* Full memory viewer to inspect a memory region, with also string conversion.

## Assembler features
The assembler has a few directives and features to simplify writing code.
* equ directive to define constants
* dc, ds, dcb directives to define data regions
* org directive to set the origin of the code
* expressions (like `$FF*10`) and many immediate representations. 

# Benchmarks
The interpreter runs at round 3mhz on the browser and 11mhz natively, it will be improved in the future. You can benchmark your own code by running a loop and then read the js console, the total time of each execution is shown
