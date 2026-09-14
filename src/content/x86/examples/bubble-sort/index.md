Six numbers in memory, sorted in place. Two nested loops: the inner one walks the array comparing each
pair of neighbours and swapping them when they are the wrong way round, and the outer one runs the
inner one until everything has settled.

**You need to know:** the "Loops" lecture and the "Arrays, strings and the string instructions"
lecture. What is new here is a nested loop over memory, where the inner counter is reset every time
round the outer one and the two indexes reach two neighbouring elements from the same register.

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

Type `402000` into the memory panel and the six qwords read 4, 8, 15, 16, 23, 42.

`[values + rbx*8]` and `[values + rbx*8 + 8]` are the same element and its neighbour, reached from one
index register with two different displacements. That is the addressing mode doing work that would be
a second register anywhere else.

`dec rcx` at the bottom of the outer loop is the small optimisation that makes bubble sort worth
writing: after the first pass the largest element is certainly at the end, after the second the two
largest are, so each pass can stop one element earlier.

Step through the first pass with the memory panel open and watch `42` move one place to the right
every time the inner loop goes round. That is where the name comes from.

Try changing the numbers to `dq 1, 2, 3, 4, 5, 6`, already in order. The program still makes all
fifteen comparisons and never swaps anything, because nothing in it notices that a pass did no work.
A `swapped` flag in a register, tested at the bottom of the outer loop, is the usual fix.
