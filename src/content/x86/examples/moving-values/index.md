The first program of the ladder. It puts numbers in registers, moves one register into another, reads
a number out of memory, multiplies and writes the answer back. Everything it does is visible in the
registers panel, with the one memory write in the memory panel at `0x402000`.

Three places a value can come from: an **immediate**, a number written into the instruction itself; a
**register**; and **memory**, named by a label in square brackets. `mov` reaches all three, which is
what makes it the instruction x86 programs are mostly made of.

**You need to know:** the "Getting started with x86" lecture. What is new here is reading and writing
memory with a label, which the "Memory, little endian and sizes" lecture goes into.

```x86|playground|memory|allow-open
default rel
global _start

section .data
value:  dq 7                ; a 64 bit variable in memory

section .text
_start:
    mov rax, 10             ; an immediate into a register
    mov rbx, rax            ; a register into another register
    add rbx, 5              ; rbx is now 15

    mov rcx, [value]        ; memory into a register
    imul rcx, rbx           ; rcx is now 105
    mov [value], rcx        ; and the answer back into memory

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi            ; with status 0
    syscall
```

`rbx` comes out at `F`, which is 15, and `rcx` at `69`, which is 105. Type `402000` into the memory
panel and the eight bytes there read `69 00 00 00 00 00 00 00`, little endian for the same 105.

`rax` ends at `3C`, not 10, because the exit at the bottom needs `rax` for the call number. Those
three lines are the request that stops the program, and the "syscall and the Linux ABI" lecture is
where they are explained.

The one rule about where operands may live shows up here. Every line has at most one operand in
square brackets, and that is not an accident: **two memory operands are not an instruction**, so
copying `value` into another variable would be a load into a register and then a store, two lines
where C writes one. What x86 does allow, and a load/store architecture does not, is the single
bracket: `imul rcx, [value]` would have multiplied straight out of memory.

Try changing `mov rcx, [value]` to `lea rcx, [value]`. `rcx` then holds `402000`, the **address** of
the variable instead of what is in it, and the multiplication turns into arithmetic on an address.
