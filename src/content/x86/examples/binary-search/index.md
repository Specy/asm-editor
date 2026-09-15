Every pass of this loop throws away half of what is left to search. Six numbers is too few to be
impressive; the same twenty passes would find one element among a million, where walking the array
would average half a million comparisons.

The price is that the array has to be **sorted** first, and nothing in the program checks that it is.
Give it an unsorted array and it will not fail, it will simply report that things are missing when
they are not.

```x86|playground|memory|allow-open
default rel
global _start

section .data
sorted: dq 4, 8, 15, 16, 23, 42
COUNT   equ ($ - sorted) / 8

section .text
_start:
    mov rdx, 23             ; the number being looked for
    xor rsi, rsi            ; low = 0
    mov rdi, COUNT
    dec rdi                 ; high = the last index
    mov r8, -1              ; the answer, -1 until it is found
.search:
    cmp rsi, rdi
    ja .done                ; low went past high, so it is not here
    mov rcx, rsi
    add rcx, rdi
    shr rcx, 1              ; mid = (low + high) / 2
    mov rax, [sorted + rcx*8]
    cmp rax, rdx
    je .found
    jl .higher              ; too small, so look above
    mov rdi, rcx            ; too big, so look below
    dec rdi
    jmp .search
.higher:
    mov rsi, rcx
    inc rsi
    jmp .search
.found:
    mov r8, rcx             ; the index it was found at
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

Three registers hold the whole state of the search: `rsi` is the low end of the range still worth
looking at, `rdi` is the high end, and `rcx` is the middle of the two. Follow it looking for 23.

| pass | `rsi` | `rdi` | `rcx` | the element there | so          |
| ---- | ----- | ----- | ----- | ----------------- | ----------- |
| 1    | 0     | 5     | 2     | 15                | look higher |
| 2    | 3     | 5     | 4     | 23                | found       |

Two passes for an array of six. Looking for 4 also takes two, and looking for 42 takes three.

`shr rcx, 1` is the division by two that finds the middle. It is the **unsigned** shift, which is
correct here because `low + high` is a sum of two indexes and cannot come out negative. `sar` would be
the one for a value that could.

The `inc rsi` and the `dec rdi` are the two instructions that keep this from looping for ever, and
they are easy to leave out. The middle element has just been compared and found wrong, so it must not
be in the range the next pass searches. Write `mov rdi, rcx` without the `dec` and the range stops
shrinking as soon as `low` and `high` are next to each other: the same middle is chosen, the same
comparison fails, and the program hangs.

`ja` compares the two indexes as unsigned numbers, and `low` overtaking `high` is how the search
reports that the element is not there. Look for 9, which is not in the array, and the range narrows
until `rsi` passes `rdi` and `r8` is left at -1.
