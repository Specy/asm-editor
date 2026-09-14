Six sorted numbers and one to look for. The program halves the range it is searching every pass,
which finds an element of a million in twenty comparisons where walking the array would take half a
million.

Binary search only works on a **sorted** array, and every line of it is index arithmetic: a low, a
high, and a middle worked out from the two.

**You need to know:** the "Loops" lecture and the "Effective addresses" lecture. What is new here is
a loop whose counter moves by more than one, and the shift that divides by two.

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

`r8` comes out at 4, the index of 23.

`shr rcx, 1` is the division by two. It is the unsigned shift, which is right because `low + high` is
a sum of two indexes and cannot be negative; `sar` would be the one to use for a value that could be.

The `dec rdi` and the `inc rsi` are what stop the loop looping for ever. The middle element has
already been compared and found wrong, so the next range must exclude it; a version that wrote
`mov rdi, rcx` without the `dec` would keep choosing the same middle whenever `high` and `low` are
next to each other.

`ja` compares the two indexes as unsigned numbers, and `low` going past `high` is how the search says
the element is not there. Try changing `mov rdx, 23` to `mov rdx, 9`, which is not in the array: the
range narrows to nothing and `r8` stays at `FFFFFFFFFFFFFFFF`.

Try looking for `4` and for `42`, the first and last elements. Both are found, in three passes and
two, which is the point of the whole thing.
