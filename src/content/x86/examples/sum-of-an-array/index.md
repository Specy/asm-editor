Six numbers written into memory by the assembler, added up and the total left in `r8`. There is one
loop, it runs a fixed number of times and there is no condition inside it, so the thing to look at is
how the program gets from one number to the next.

An array does not fit in the registers and its elements have no names of their own, so the program
keeps the address of the next element in a register and steps it forward as it goes.

**You need to know:** the "Loops" lecture and the "Arrays, strings and the string instructions"
lecture. What is new here is the label after the last element: `numbers_end:` is the address the
array stops at, so the loop needs no counter at all.

```x86|playground|memory|allow-open
default rel
global _start

section .data
numbers:    dq 4, 8, 15, 16, 23, 42
numbers_end:

section .text
_start:
    lea rsi, [numbers]      ; p = numbers
    lea rdi, [numbers_end]  ; the address one past the last element
    xor rax, rax            ; sum = 0
.next:
    add rax, [rsi]          ; sum += *p
    add rsi, 8              ; p++, and the 8 is the size of an element
    cmp rsi, rdi
    jb .next                ; while (p < end)
    mov r8, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` comes out at `6C`, which is 108.

`numbers_end:` is a label with nothing under it, so it holds the address the next thing would have
gone at, which is one past the array. That is C's `numbers + 6`, the pointer you may compare against
and may not read. Both registers finish at `0x402030`, forty eight bytes past the
start, which is six elements of eight bytes.

`add rax, [rsi]` reads memory as one of its operands, so the loop body is two instructions where MIPS
and RISC-V need a load and then an add. The counting form, `add rax, [numbers + rcx*8]` with an
index, is the same number of instructions and reaches `numbers[i-1]` as easily; the pointer form is
the one the string instructions can take over.

Try adding a seventh number to the `dq` line, say `100`. `r8` comes out at 208 and nothing else in
the program changes, because `numbers_end:` moved with the array.
