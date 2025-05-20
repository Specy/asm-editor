As we saw [previously](/learn/courses/assembly-basics/introduction/introduction) the CPU goes through 3 steps:
*Fetch*, Decode and Execute.

What we want to focus now is the **Fetch** step, where the CPU fetches from, how it knows where to fetch from, and where a program is stored.

## Code is just data

The surprising part is that the code you execute is just binary data, like anything else in memory.
As we saw, the CPU interprets the binary data as instructions by decoding it through the opcode and operands.
It has no concept of what is code and what is data, if the CPU can decode it (or else it will "throw" an error), it will execute it.

## The structure of a program

Often in assembly languages you will see things called **sections**.
Sections are a way to specify to the assembler where to place code and data in memory.
Usually there are two kinds of sections:

* **Text section**: This is where the code of the program is stored. One of them might also be the "entry point" of the program, which is where the program will start executing from, see it as your "main" function.
* **Data section**: This is where the data of the program is stored. This can be initialized data (like strings, numbers, constants, etc...) or uninitialized data (like variables stored in memory).

Say for example you have a program that prints a string that asks for a number, your program might look like this (in RISC-V assembly):
```riscv
.data # tells the assembler to begin a data section
message: .string "Enter a number"
# -------- #
.text # tells the assembler to begin a text section, aka the code
.globl main # tells the assembler that this is the entry point of the program
main:
    li a7, 4
    la a0, message 
    ecall
```
It's ok if you don't understand what the code does, it's a simple example to show you how sections work.

In this case the `.data`, `.text`, `.globl` and `.string` are all assembler directives, which are hints to the assembler on how to assemble the code.

## Loading a program

This can be a course on its own, if you are interested on it let us know! But to keep it simple:

When you run a program on your computer, the operating system has the role of setting everything up so that the program can 
execute. 

1. It loads the binary file of your program in memory.
2. It allocates pieces of memory that the program needs (for example the stack and heap, if you heard about it).
3. It initializes the values of registers, and most importantly, it sets the **program counter** and **stack pointer**

## The Program Counter (PC)

The program counter is a special register in CPUs that stores the address in memory where the *next instruction to execute* is located.

At the very beginning of a program, the Program Counter is initialized to whichever address the first instruction to execute is located.
In our previous example, it will be where the `main` is written, aka the `li a7, 4` instruction.

When the CPU gets to the `fetch` stage, it will fetch the next instruction to execute. The contents of this instruction are
located in memory at the address that is inside of the Program Counter. 

Once the instruction finishes execution, the Program Counter is incremented by the size of the instruction that was just executed
(some CPUs can have instructions be 16 or 32 bits for example), and now the Program Counter will point to the next instruction to execute.

Look at this example in m68k that adds 1 to a register a few times, click compile and then `step` until the end. Look at the Program Counter on the 
top right increasing as you run the code.

```m68k|playground|pc|no-sizes|no-flags
add #1, d0
add #1, d0
add #1, d0
add #1, d0
add #1, d0
add #1, d0
add #1, d0
add #1, d0
add #1, d0
```

This concept of the program counter will come back handy when we look at branching, procedure calls and jumps.


