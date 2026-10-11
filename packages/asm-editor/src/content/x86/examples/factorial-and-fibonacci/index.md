Factorial and Fibonacci both call themselves, but they leave different work waiting. `fact(n)` makes
one call for `fact(n - 1)`, then multiplies by `n` as the calls return: a chain. `fib(n)` needs both
`fib(n - 1)` and `fib(n - 2)`: each non-base call splits into two more branches.

```x86|playground|memory|allow-open
default rel
global _start

section .bss
fact_out:   resq 1
fib_out:    resq 1

section .text
; fact(n) -> n!, for n >= 0
fact:
    cmp rdi, 1
    jg .recurse
    mov rax, 1              ; 0! and 1! are 1
    ret
.recurse:
    push rdi                ; save this call's n; rsp is now aligned
    dec rdi
    call fact               ; rax = fact(n - 1)
    pop rdi                 ; recover this call's n
    imul rax, rdi           ; n * fact(n - 1)
    ret

; fib(n) -> the nth Fibonacci number, for n >= 0
fib:
    cmp rdi, 2
    jge .recurse
    mov rax, rdi            ; fib(0) = 0 and fib(1) = 1
    ret
.recurse:
    push rbx                ; preserve the caller's rbx; rsp is now aligned
    sub rsp, 16             ; local space; rsp stays aligned
    mov [rsp], rdi          ; save this call's n in its local space

    dec rdi
    call fib                ; rax = fib(n - 1)
    mov rbx, rax            ; keep the first answer across the second call

    mov rdi, [rsp]          ; reload this call's n
    sub rdi, 2
    call fib                ; rax = fib(n - 2)
    add rax, rbx            ; combine the two answers

    add rsp, 16             ; release local space
    pop rbx                 ; return the caller's rbx unchanged
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

Run it and type `402000` into the memory panel. `fact_out` holds `0x375F00` (3628800), and the
next qword, `fib_out`, holds `0x37` (55). The bytes of each qword appear in little-endian order.

## A saved value for each call

In `fact(3)`, the first call saves 3, calls `fact(2)`, and waits. That call saves 2 and calls
`fact(1)`. The base case returns 1. The waiting calls then recover their own values: `2 × 1 = 2`,
followed by `3 × 2 = 6`. Every recursive `call` starts another invocation of the same instructions.
Each invocation pushes at its current stack position, so its saved `n` stays separate from the
values saved by deeper calls.

`rdi` is caller-saved. A call may change it, so `fact` saves its `n` before calling and restores it
before multiplying. Its one `push` also changes the entry stack alignment from 8 modulo 16 to 0,
as required immediately before `call`.

## Following both branches of `fib(3)`

`fib` needs its original `n` to set up the second call. It keeps that `n` in `[rsp]`, a local qword
belonging to this invocation. It keeps the first answer in `rbx` while the second call runs.
Because `rbx` is callee-saved, each invocation of `fib` saves the `rbx` it inherited and restores
it before returning. The next invocation of `fib` makes the same promise to this one.

Here is the outer `fib(3)` invocation. The stack column shows **its own** saved values; deeper
calls temporarily put their frames below them. `B` stands for the `rbx` value inherited from its
caller.

| Moment in `fib(3)`           |                `rdi` | `rbx` | This invocation's stack                           | `rax` |
| ---------------------------- | -------------------: | ----: | ------------------------------------------------- | ----: |
| Before the first `call fib`  |                    2 |   `B` | local `n = 3`, padding, saved `B`, return address |     — |
| After `fib(2)` returns       | changed by that call |   `B` | same values                                       |     1 |
| Before the second `call fib` |                    1 |     1 | same values                                       |     1 |
| After `fib(1)` returns       |                    1 |     1 | same values                                       |     1 |
| After `add rax, rbx`         |                    1 |     1 | same values                                       |     2 |

The first child computes `fib(2) = fib(1) + fib(0) = 1`. Back in `fib(3)`, `mov rbx, rax` saves
that answer. `mov rdi, [rsp]` recovers 3 from this invocation's local space, then subtracts 2 to
call `fib(1)`. The second answer arrives in `rax`, while the first is still in `rbx`. After adding
them, this invocation releases its local space, restores `B`, and returns 2.

The stack arithmetic matters for both nested calls. On entry, `rsp` is 8 modulo 16. `push rbx`
makes it divisible by 16; reserving 16 more bytes keeps it that way. Only eight of those local
bytes hold `n`; the other eight are padding. Both calls therefore meet the System V alignment rule.

## Try it

First, change the Fibonacci input in `_start` from 10 to 5. Before running, work out
`fib(5) = fib(4) + fib(3)` from the base cases. Check that `fib_out` becomes `0x5` in memory.
In the call tree, `fib(3)` is computed twice: once inside `fib(4)` and once directly from `fib(5)`.
That repeated work explains why this recursive version makes many more calls as `n` grows.

Next, write a third subroutine, `sum_to(n)`, which returns `1 + 2 + ... + n` for `n >= 0`.
Make `sum_to(0)` return 0. For a positive `n`, save `n`, call `sum_to(n - 1)`, then add the saved
`n` to the returned `rax`. Use the same `rdi` argument and `rax` result convention as `fact`,
and keep `rsp` aligned before the recursive call. Add `sum_out: resq 1` after `fib_out`, call
`sum_to` with 5 in `_start`, and store its result in `sum_out` before the exit syscall. The new
qword at `0x402010` should contain `0xF` (15). Try input 0 as a second check: it should store 0.
