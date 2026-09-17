Four divisions and multiplications in one program, arranged so that the four answers sit in `r8` to
`r14` at the end and can be compared with each other.

The thing to watch is `rdx`. It is an output of every division, an input to every division, and an
output of the wide multiplication, and it is named in exactly one of the eight instructions that use
it.

```x86|playground|allow-open
default rel
global _start

section .text
_start:
    mov rax, 200
    mov rbx, 7
    xor rdx, rdx            ; the high half of the dividend
    div rbx                 ; unsigned: rax = 28, rdx = 4
    mov r8, rax
    mov r9, rdx

    mov rax, -200
    mov rbx, 7
    cqo                     ; rdx filled with copies of the sign of rax
    idiv rbx                ; signed: rax = -28, rdx = -4
    mov r10, rax
    mov r11, rdx

    mov rax, 6
    imul rax, 7             ; the two operand form keeps 64 bits
    mov r12, rax

    mov rax, 0xFFFFFFFFFFFFFFFF
    mov rbx, 2
    mul rbx                 ; the one operand form keeps 128
    mov r13, rax            ; the low half
    mov r14, rdx            ; and the high one

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r10` reads `FFFFFFFFFFFFFFE4`, which is -28, and `r11` reads -4. Both signs come from the dividend:
-200 divided by 7 is -28 with 4 left over, and `idiv` gives the remainder the sign of the number being
divided rather than the sign of the divisor. Most languages inherited the rule from this instruction.

`r13` and `r14` are the pair that has to be read together. `r13` is `FFFFFFFFFFFFFFFE` and `r14` is 1,
and neither of them is the answer. Stick them end to end, `r14` on the left, and you have
`1FFFFFFFFFFFFFFFE`, which is `0xFFFFFFFFFFFFFFFF` doubled. One instruction produced a 65 bit number
and split it across two registers, because there was nowhere else for the top of it to go.

Now put your finger on the `cqo` and delete it. The program stops on the `idiv` underneath. `rdx` was
holding 4, the remainder from the division ten lines above, and `idiv` reads `rdx` and `rax` together
as one number, so the dividend it actually got was about four times `2^64`. Divide that by 7 and the
quotient has no chance of fitting in `rax`, which is a divide error, and the run ends there. Put the
`cqo` back and it runs to the end.

Dividing by a power of two need not involve `div` at all. Change `mov rbx, 7` to `mov rbx, 8`, replace
the first three division lines with `shr rax, 3`, and you get the same answer from an instruction that
costs a fraction as much.
