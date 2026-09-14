Two subroutines that call themselves. `fact` calls itself once per level and `fib` calls itself twice,
which makes the second one a tree of calls rather than a chain.

Recursion needs nothing the machine does not already have. Every `call` pushes its own return address,
so the depth is a stack of addresses, and anything else a level needs to survive its own call goes on
the same stack.

**You need to know:** the "call, ret and the System V convention" lecture. What is new here is a
subroutine that calls itself, and the push that keeps an argument alive across that call.

```x86|playground|memory|allow-open
default rel
global _start

section .bss
fact_out:   resq 1
fib_out:    resq 1

section .text
; fact(n) -> n!
fact:
    cmp rdi, 1
    jg .recurse
    mov rax, 1              ; fact(1) is 1, and the recursion stops here
    ret
.recurse:
    push rdi                ; n, which the call below would destroy
    dec rdi
    call fact               ; rax = fact(n - 1)
    pop rdi
    imul rax, rdi           ; n * fact(n - 1)
    ret

; fib(n) -> the nth Fibonacci number
fib:
    cmp rdi, 2
    jge .recurse
    mov rax, rdi            ; fib(0) is 0 and fib(1) is 1
    ret
.recurse:
    push rbx                ; borrowed across the two calls
    push rdi
    dec rdi
    call fib                ; fib(n - 1)
    mov rbx, rax            ; kept, because the next call destroys rax
    pop rdi
    sub rdi, 2
    call fib                ; fib(n - 2)
    add rax, rbx
    pop rbx
    ret

_start:
    mov rdi, 10
    call fact
    mov [fact_out], rax

    mov rdi, 10
    call fib
    mov [fib_out], rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

Type `402000` into the memory panel. `fact_out` holds `375F00`, which is 3628800, and `fib_out` holds
`37`, which is 55.

`push rdi` is there because `rdi` is caller saved and the thing being called is `fact` itself, which
is free to destroy it. Delete the push and the pop and the answer becomes 1: `rdi` comes back as 0
from the bottom of the recursion and every multiplication after that is by zero.

`fib` pushes `rbx` as well, because it needs a value to survive the **second** call and `rbx` is
callee saved, so keeping it there is the convention's way of saying "this will still be here
afterwards". Since `fib` is itself a callee, it saves `rbx` on the way in and restores it on the way
out, which is the same promise being kept one level up.

`fib(10)` makes 177 calls for an answer a loop would reach in ten passes. That is what a tree of
calls costs, and it is why `fib` written this way is the standard example of when not to use
recursion.

Try `mov rdi, 20` before the `call fib`. The answer is 6765 and the run takes noticeably longer,
because the number of calls roughly doubles with every step of `n`.
