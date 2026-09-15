Six numbers sorted where they lie, with nowhere else to put them. The inner loop walks the array
comparing each element with the one after it and swapping the pair when they are the wrong way round.
The outer loop runs the inner one again, and again, until nothing is left out of order.

```x86|playground|memory|allow-open
default rel
global _start

section .data
values: dq 42, 4, 23, 8, 16, 15
COUNT   equ ($ - values) / 8

section .text
_start:
    mov rcx, COUNT
    dec rcx                 ; the number of passes, one fewer than the elements
.outer:
    xor rbx, rbx            ; the index inside the pass, reset every time
.inner:
    mov rax, [values + rbx*8]       ; this element
    mov rdx, [values + rbx*8 + 8]   ; and the one after it
    cmp rax, rdx
    jle .ordered                    ; already the right way round
    mov [values + rbx*8], rdx       ; swapped
    mov [values + rbx*8 + 8], rax
.ordered:
    inc rbx
    cmp rbx, rcx
    jb .inner
    dec rcx                 ; one fewer comparison needed next pass
    jnz .outer

    mov rax, 60
    xor rdi, rdi
    syscall
```

Step through the first pass with the memory panel open on `402000`, and watch the `42`. It starts at
the front, loses its first comparison, and moves one place right. Then it loses the next one and moves
again. By the end of the pass it has travelled the whole way to the end of the array in a single run,
while everything else has shuffled one place left. That is the bubbling the name refers to, and the
largest element is guaranteed to arrive after one pass however badly the array started.

`[values + rbx*8]` and `[values + rbx*8 + 8]` are an element and its neighbour, reached from one index
register with two different constants added on. The addressing mode does the work a second register
would do anywhere it could not.

That guarantee about the largest element is what `dec rcx` at the bottom of the outer loop is cashing
in. After one pass the last element is certainly right, after two the last two are, so each pass can
stop one element earlier than the one before it and the inner loop shortens as the outer one runs.

What the program does not do is notice when a pass swapped nothing. Change the data to
`dq 1, 2, 3, 4, 5, 6`, already sorted, and it still makes all fifteen comparisons before deciding it is
finished. One flag register, cleared at the top of each pass and set by the swap, tested at the bottom,
turns this into a sort that costs one pass on data that is already in order.
