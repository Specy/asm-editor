# Asm editor 

A webapp made with sveltekit to write and run m68k and mips.
Uses monaco-editor for the code editing, [M68K interpreter](https://github.com/Nazgot/M68K-JS-Interpreter) and 
[MIPS interpreter](https://github.com/dannyqiu/mips-interpreter)

## Warning
The UI is mostly finished, but the interpreters have many bugs and missing features, i would want to switch to web assembly interpreters but i'm struggling to find one. If you want to help change interpreters, make an issue.
## Features 
* Simple code completition and full syntax highlighting
* Step through or run the program 
* Inspect the value of each register and find what the instruction changed 
* Inspect the memory and look what was used
* Create new projects and manage them all in the webapp 
* Format the code
