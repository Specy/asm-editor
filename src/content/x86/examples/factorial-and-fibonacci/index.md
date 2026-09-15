Two recursive subroutines side by side, and the difference between them is worth more than either one
on its own. `fact` calls itself once per level, so the calls make a chain ten deep. `fib` calls itself
twice, so the calls make a tree, and a tree is a very different thing to pay for.

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

Type `402000` into the memory panel and both answers are there: `375F00` is 3628800, and `37` is 55.

Both subroutines had the same problem to solve. `fact` needs `n` again after its own call has
returned, and `fib` needs the first result again after its **second** call has returned. Neither value
can stay where it is, because the thing about to run is a subroutine with exactly the same instructions
in it, which will write exactly the same registers. So both go on the stack, and the recursion works
because each level gets its own eight bytes without anybody arranging it.

The two chose different registers to protect, and the reasons are different. `fact` pushes `rdi`
because `rdi` is caller saved: the convention says the callee may destroy it, so the caller protects it,
and here the caller and the callee are the same subroutine. `fib` pushes `rbx` because `rbx` is callee
saved: it wants a register the call will leave alone, and the price of using one is saving it on the
way in and restoring it on the way out, which is the same promise it is relying on from the level
below.

Delete `fact`'s push and pop and the answer becomes 1. `rdi` comes back from the bottom of the
recursion holding 0, so every multiplication on the way out is by zero except the very last.

Now count what `fib` costs. `fib(10)` makes 177 calls to produce a number a loop would reach in ten
passes, because the tree recomputes `fib(3)` again and again on different branches. Change the `10`
before `call fib` to `20` and the run takes noticeably longer: the number of calls roughly doubles for
every step of `n`, so 30 would be a minute of work for a number you can write down in four digits.
