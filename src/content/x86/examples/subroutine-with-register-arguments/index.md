The first program that calls a subroutine. `sum` takes two numbers, adds them and hands the answer
back, and the three things that make it a subroutine and not a jump are `call`, `ret` and the
agreement about which registers carry what.

**You need to know:** the "call, ret and the System V convention" lecture. What is new here is the
convention itself: the first two arguments in `rdi` and `rsi`, the return value in `rax`, and the
return address on the stack.

```x86|playground|allow-open
default rel
global _start

section .text
; sum(a, b) -> a + b
; The System V convention puts the first two arguments in rdi and rsi
; and expects the return value in rax.
sum:
    mov rax, rdi
    add rax, rsi
    ret                     ; jumps back to the line after the call

_start:
    mov rdi, 20             ; the first argument
    mov rsi, 22             ; the second
    call sum                ; rax comes back as 42
    mov r12, rax

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi
    syscall
```

`r12` comes out at `2A`, which is 42.

Step through it with `rsp` and `rip` both in view. `call sum` drops `rsp` by 8, writes the address of
the `mov r12, rax` line there, and sets `rip` to `sum`. `ret` reads that address back off the stack
into `rip` and puts `rsp` where it was. Nothing checks that what `ret` pops is a return address: a
subroutine that pushes something and forgets to pop it returns to whatever it pushed.

`sum` is written above `_start`, which the assembler does not care about. What would matter is
writing it **below**: a `_start` that reached the end of its own code without the exit would run
straight into it.

`sum` destroys `rax` and reads `rdi` and `rsi`, and all three are caller saved, so it needs to save
nothing at all. A subroutine that wanted `rbx` or `r12` to `r15` would have to push them first and
pop them before returning.

Try changing `mov rdi, 20` to `mov rdi, 20` and `mov rsi, 22` to `mov rsi, -22`. `rax` comes back as
`FFFFFFFFFFFFFFFE`, which is -2, because `add` is the same instruction for signed and unsigned
numbers and only the reading of the answer differs.
