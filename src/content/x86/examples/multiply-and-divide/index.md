Multiplication and division, both of them twice: once unsigned and once signed. The quotient and the
remainder come out of one instruction, and the line before each division is the one that decides
whether it works.

`mul` and `div` are unsigned, `imul` and `idiv` are signed, and they are genuinely different
instructions, not the same one read two ways, because the high half of the answer differs.

**You need to know:** the "Arithmetic, logic and bits" lecture. What is new here is the one operand
form of `mul`, which produces a 128 bit answer in `rdx:rax`.

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

`r8` is 28 and `r9` is 4. `r10` reads `FFFFFFFFFFFFFFE4`, which is -28, and `r11` reads -4: C rounds
integer division towards zero and gives the remainder the sign of the dividend, and `idiv` is where
that rule comes from. `r12` is `2A`, which is 42. `r13` and `r14` are `FFFFFFFFFFFFFFFE` and 1,
which together are `2^65 - 2`, the answer that did not fit in one register.

`div` and `idiv` read a dividend twice as wide as their operand, out of `rdx:rax`, so the line
before is never optional: `xor rdx, rdx` for an unsigned division and `cqo` for a signed one. Delete
either and the program stops on the division, because the dividend becomes enormous and the quotient
does not fit in `rax`. That is a divide error, and so is dividing by zero.

Try changing `mov rbx, 7` to `mov rbx, 8` and then replacing the whole first division with
`shr rax, 3`. Dividing by a power of two is a shift, which is what a compiler emits on sight because
`div` is one of the slowest instructions there is.
