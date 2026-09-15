Six numbers and the largest of them in `r8`. The loop keeps a **best so far** and replaces it whenever
an element beats it, which is how you find the largest, the smallest, the closest or the first of
anything.

The interesting decision is made before the loop starts. `r8` begins holding the first element, and
the loop begins at the second. Starting `r8` at zero instead would be easier to write and would answer
wrongly for an array of negative numbers, because zero would beat all of them.

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

There are two comparisons in every pass of this loop and they ask different kinds of question.

`cmp rax, r8` followed by `jle` is **signed**, because the elements are data and data can be negative.
`cmp rcx, COUNT` followed by `jb` is **unsigned**, because `rcx` is an index and an index never is.
Writing the same flavour of condition for both is a bug that will not show up at all until somebody
puts a negative number in the array, and then it will look like the array is the problem.

Watch it happen. Change the `42` to `-42` and the answer becomes 23, correctly, because -42 is the
smallest element now. Change the `jle` to `jbe` as well and the answer becomes `FFFFFFFFFFFFFFD6`,
which is those same bits read as an unsigned number and therefore the largest thing in the array by a
very long way.

The three lines from `jle` down to `.skip:` can be replaced by one `cmovg r8, rax`, which moves only
when the condition holds and never branches at all. The answer is the same and the loop body is
shorter by two instructions.
