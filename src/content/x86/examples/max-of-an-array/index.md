Six numbers, and the largest of them left in `r8`. The loop keeps a **best so far**, compares each
element against it and replaces it when the element wins, which is the shape of every "find the" loop
there is.

The first element is the best so far before the loop starts, so the loop begins at the second. A
program that started the best at zero would answer wrongly for an array of negative numbers.

**You need to know:** the "cmp and the conditional jumps" lecture and the "Loops" lecture. What is new
here is a condition inside the loop body, so there are two jumps rather than one.

```x86|playground|memory|allow-open
default rel
global _start

section .data
numbers:    dq 4, 42, 15, 16, 23, 8
COUNT       equ ($ - numbers) / 8

section .text
_start:
    mov r8, [numbers]       ; the first one is the best so far
    mov rcx, 1              ; and the loop starts at the second
.next:
    mov rax, [numbers + rcx*8]
    cmp rax, r8
    jle .skip               ; not bigger, so leave the best alone
    mov r8, rax             ; a new best
.skip:
    inc rcx
    cmp rcx, COUNT
    jb .next

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` comes out at `2A`, which is 42.

`jle` is the signed comparison, so an array holding `-100` is handled correctly. `COUNT` is worked
out by the assembler from the bytes the `dq` line produced, so the loop follows the array when you
edit it.

The whole body could be `cmovg r8, rax` instead of the compare and the two jumps, which is a move
that happens only when the condition holds and costs nothing when the processor guesses the branch
wrong. Try it: replace the three lines from `jle` to `.skip:` with `cmovg r8, rax` and the answer is
the same.

Two comparisons per pass, and they ask different questions. `cmp rax, r8` with `jle` is **signed**,
because the elements are numbers that could be negative; `cmp rcx, COUNT` with `jb` is **unsigned**,
because an index never is. Writing the same condition for both is the bug that only shows up once
somebody puts a negative number in the array.

Try changing `42` to `-42`. The answer becomes 23, and changing `jle` to `jbe` as well makes it
`FFFFFFFFFFFFFFD6`, which is that same `-42` read as an unsigned number and therefore enormous.
