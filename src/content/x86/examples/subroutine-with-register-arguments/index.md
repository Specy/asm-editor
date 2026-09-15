`sum` here could have been a `jmp` with another `jmp` at the end of it, and it would work exactly once.
What makes it a subroutine is that it can be called from anywhere and get back to wherever that was,
and the whole of that ability lives in eight bytes on the stack.

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

Step through it with `rsp` and `rip` both in view, and watch the three instructions that matter.

`call sum` does two things in one: it drops `rsp` by 8 and writes the address of the **next** line,
`mov r12, rax`, into the slot it just made, and then it puts the address of `sum` into `rip`. Open the
**Stack** tab and the address is there, an ordinary eight byte number in ordinary memory.

`ret` reads that number back out, puts it into `rip` and lets `rsp` climb by 8. Nothing about the slot
marked it as a return address, and `ret` does no checking whatever. Push one extra thing inside `sum`
and forget to pop it, and `ret` takes that value instead and jumps to it, with results that will look
like anything except a missing `pop`.

`sum` writes `rax` and reads `rdi` and `rsi`, and the convention marks all three as caller saved,
which is why it saves nothing on the way in. A subroutine that wanted `rbx` or `r12` to `r15` for
scratch space would have to push them first and pop them before the `ret`.

`sum` is written above `_start` here, which the assembler is entirely indifferent to. What would
matter is writing it **below**: a `_start` that ran off the end of its own code would walk straight
into `sum` and execute it as though it had been called, without any return address underneath.

Change `mov rsi, 22` to `mov rsi, -22` and `rax` comes back as `FFFFFFFFFFFFFFFE`. `add` is one
instruction for signed and unsigned numbers alike, and the bits it produced are -2 or a number near
`2^64` depending on nothing but which way you read them.
