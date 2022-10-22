# Asm editor 

A webapp made with sveltekit and rust webassembly to write and run m68k assembly code.
Uses monaco-editor for the editor, [WASM M68K interpreter](https://github.com/Specy/s68k) 

## Features 
* Simple code completition and full syntax highlighting
* Step through or run the program 
* Code breakpoints, settings, input/output interrupts and more
* Inspect the value of each register see which was changed with each instruction
* Inspect the memory and see which was changed with each instruction
* Create new projects and manage them all in the webapp 
* Integrated IDE with semantic checks and useful errors to help you learn assembly