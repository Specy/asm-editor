There are two ways to give a number a name, and they are not alike at all.

`height` in this program is a **variable**: eight bytes sitting in memory at an address, which the
program reads, and could write, and which you can watch change in the memory panel. `WIDTH` is a
**constant** made with `equ`: a name the assembler swaps for the number 12 while it assembles, after
which the number is part of the instruction and the name has ceased to exist. Nothing in the running
program knows `WIDTH` was ever there.

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

Type `402000` into the memory panel and three variables are laid out in a row: `height` at
`0x402000`, `area` eight bytes further on, `scratch` eight further still. `WIDTH` is nowhere, because
there is nothing to see.

`mov qword [scratch], 99` needs the word `qword` because neither operand carries a size. A label is an
address and 99 is a number, and without the keyword NASM writes a single byte and leaves the other
seven alone.

`scratch` is in `.bss`, which is the section for space that starts as zeroes. The difference from
`.data` is what ends up in the program file: `area: dq 0` puts eight bytes of zero on disk, and
`scratch: resq 1` puts a note in a header saying "eight more bytes, please". For eight bytes that is
nothing. For a megabyte buffer it is the difference between a program that is a megabyte long and one
that is not.

There is a third section worth knowing about. `section .rodata` is loaded without write permission, so
a stray store into it ends the program instead of quietly corrupting a constant. Strings and lookup
tables belong there.

The middle register is avoidable, for addition at least. `add [area], rax` reads memory, adds and
writes it back in one instruction, and `inc qword [area]` does the same for a step of one. The
multiplication still needs `rax`, because `imul` has no form that writes its answer to memory.
