A grid of three rows and four columns, held in memory as twelve numbers in a row. Memory has no idea
what a row is, so the program works out where `grid[row][col]` is with one multiplication and one
addition.

The formula is `row * COLS + col`, and it is the same in C, where `grid[2][1]` compiles to exactly
that. Storing rows one after another is called **row major** order, and it is what C, and this
program, do.

**You need to know:** the "Effective addresses" lecture and the "Loops" lecture. What is new here is
an index built from two numbers, and nested loops that walk a grid along a row and down a column.

```x86|playground|memory|allow-open
default rel
global _start

ROWS    equ 3
COLS    equ 4

section .data
grid:   dq 1, 2, 3, 4
        dq 5, 6, 7, 8
        dq 9, 10, 11, 12

section .text
_start:
    mov rax, 2              ; the row
    mov rcx, 1              ; the column
    imul rax, COLS          ; row * COLS
    add rax, rcx            ; + col
    mov r8, [grid + rax*8]  ; grid[2][1]

    xor r9, r9              ; add up row 1
    mov rax, 1
    imul rax, COLS          ; the index of its first element
    xor rcx, rcx
.row:
    mov rdx, rax
    add rdx, rcx
    add r9, [grid + rdx*8]
    inc rcx
    cmp rcx, COLS
    jb .row

    xor r10, r10            ; add up column 2
    xor rcx, rcx
.col:
    mov rax, rcx
    imul rax, COLS          ; the start of row rcx
    add rax, 2              ; and two along it
    add r10, [grid + rax*8]
    inc rcx
    cmp rcx, ROWS
    jb .col

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` is `A`, which is 10, the element at row 2 column 1. `r9` is `1A`, which is 26, the sum of
5 + 6 + 7 + 8. `r10` is `15`, which is 21, the sum of 3 + 7 + 11.

The three `dq` lines are one array. The assembler writes twelve qwords one after another and the line
breaks are for you to read, which is exactly the point: nothing in memory records that this is a
grid, and the `imul rax, COLS` is where the shape actually lives.

Walking a **row** steps the index by 1 and walking a **column** steps it by `COLS`, which is why the
row loop is shorter. On a real machine it is also much faster: neighbouring elements of a row share a
cache line and neighbouring elements of a column do not, so a program that walks a big array the
wrong way round can take several times as long for the same arithmetic.

`[grid + rax*8]` can scale by 8 because an element is a qword. An element of any other size, a
twenty byte structure say, needs a real multiplication into a register first, since the scale only
goes up to 8.

Try changing `COLS equ 4` to `COLS equ 3` without touching the data. The program reads the same twelve
numbers as a 4 by 3 grid, and `r8` becomes 8, because `grid[2][1]` is now the eighth element.
