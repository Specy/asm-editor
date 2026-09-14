A rectangle's height is a variable in memory and its width is a constant. The program reads the
height, multiplies by the width and writes the area back to another variable, which is the shape of
every program that works on data it did not invent.

The difference between the two is where they are. `height` is eight bytes in `section .data` that the
program can read and write; `WIDTH` is an `equ`, a name the assembler replaces with the number 12
while assembling, and it takes no memory at all.

**You need to know:** the "Sections, directives and labels" lecture. What is new here is `.bss`, the
section for space that starts as zeroes and costs nothing in the program file.

```x86|playground|memory|allow-open
default rel
global _start

WIDTH   equ 12              ; a name for a number, and it uses no memory

section .data
height: dq 5                ; a variable, eight bytes with a starting value
area:   dq 0                ; and one that starts at zero

section .bss
scratch: resq 1             ; eight more bytes of zero, and no bytes in the file

section .text
_start:
    mov rax, [height]       ; read the variable
    imul rax, WIDTH         ; the constant is assembled into the instruction
    mov [area], rax         ; and write the answer back

    mov qword [scratch], 99 ; the size has to be written for an immediate

    mov rax, 60
    xor rdi, rdi
    syscall
```

Type `402000` into the memory panel. The twenty four bytes hold `height` at `0x402000`, still 5;
`area` at `0x402008`, now `3C`, which is 60; and `scratch` at `0x402010`, now `63`, which is 99.

`mov qword [scratch], 99` needs the word `qword` because neither operand says a size: a label is an
address and 99 is a number, and without it NASM writes one byte rather than eight.

The register in the middle is avoidable. `add [area], rax` and `inc qword [area]` both read memory,
work on it and write it back in one instruction, which is a **read modify write** and is what x86 has
that MIPS and RISC-V do not: there, every one of those is a load, an arithmetic instruction and a
store. The multiplication here still needs `rax`, because `imul` has no form that writes memory.

A third section is worth knowing about. `section .rodata` holds data the program must never write,
and the loader maps it without write permission, so a stray store to a constant ends the program
instead of quietly corrupting it. Strings and lookup tables belong there.

Try changing `WIDTH equ 12` to `WIDTH equ 100` and running again. Nothing else changes and the area
becomes 500, because the constant lives in the instruction and the instruction is reassembled every
time you press Build.
