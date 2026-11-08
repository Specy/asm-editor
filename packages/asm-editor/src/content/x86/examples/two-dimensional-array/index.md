You can store a two-dimensional array in memory as a sequence of elements. For a grid of three rows
and four columns, the program stores twelve numbers and uses the row and column to calculate each
element's address.

This example uses **row-major order**: the whole of row 0, then the whole of row 1, then row 2.
The element at row `r` and column `c` has index `r * COLS + c`. Rows and columns both count from 0,
and `COLS` is the number of elements in each row.

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

Run the program and inspect `r8`, `r9`, and `r10`: they hold **10**, **26**, and **21**. For the first
load, row 2 and column 1 give index `2 * 4 + 1 = 9`, so `r8` receives the tenth qword, 10. The row
loop reads indices 4, 5, 6, and 7, adding **5 + 6 + 7 + 8** into `r9`. These are four consecutive
qwords. The column loop reads indices 2, 6, and 10, adding **3 + 7 + 11** into `r10`. It computes a
new row start on each of its three passes, so its reads are four qwords, or 32 bytes, apart.

You can read the same values as a grid with different dimensions. Change `COLS equ 4` to `COLS equ 3`
_and_ `ROWS equ 3` to `ROWS equ 4`, without changing the `dq` values. The same twelve qwords are now
read as four rows of three. The source lines still look like rows of four, but the arithmetic decides
which values belong to each row: `r8` becomes **8**, `r9` becomes **15** (4 + 5 + 6), and `r10`
becomes **30** (3 + 6 + 9 + 12).

The three `dq` lines form one array: the assembler writes twelve qwords one after another.
The line breaks make the source easier to read, but do not add gaps between the values.

`[grid + rax*8]` scales the index by 8 because each qword occupies 8 bytes. An x86 address can use
a scale of 1, 2, 4, or 8. For a 20-byte record, calculate the byte offset in a register first,
then add that offset to the array's address.

## Your turn

This grid uses even numbers. Make `r8` load `grid[2][1]`, make `r9` sum row 2, and make `r10` sum
column 0. Replace the three marked placeholders with the indexing calculations. Before pressing
**Test**, predict the results; the register panel should show `r8 = 20`, `r9 = 84`, and `r10 = 30`.

```x86|playground|memory|exercise
default rel
global _start

ROWS    equ 3
COLS    equ 4

section .data
grid:   dq 2, 4, 6, 8
        dq 10, 12, 14, 16
        dq 18, 20, 22, 24

section .text
_start:
    mov rax, 2              ; row for grid[2][1]
    mov rcx, 1              ; column
    ; Turn row and column into a qword index here.
    mov r8, [grid + rax*8]

    xor r9, r9
    mov rax, 0              ; replace with the first index of row 2
    xor rcx, rcx
.row:
    mov rdx, rax
    add rdx, rcx
    add r9, [grid + rdx*8]
    inc rcx
    cmp rcx, COLS
    jb .row

    xor r10, r10
    xor rcx, rcx
.col:
    mov rax, rcx
    imul rax, 1             ; replace 1 with the row width
    add r10, [grid + rax*8] ; column 0 needs no extra offset
    inc rcx
    cmp rcx, ROWS
    jb .col

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r8": 20,
        "r9": 84,
        "r10": 30
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

ROWS    equ 3
COLS    equ 4

section .data
grid:   dq 2, 4, 6, 8
        dq 10, 12, 14, 16
        dq 18, 20, 22, 24

section .text
_start:
    mov rax, 2
    mov rcx, 1
    imul rax, COLS
    add rax, rcx
    mov r8, [grid + rax*8]

    xor r9, r9
    mov rax, 2
    imul rax, COLS
    xor rcx, rcx
.row:
    mov rdx, rax
    add rdx, rcx
    add r9, [grid + rdx*8]
    inc rcx
    cmp rcx, COLS
    jb .row

    xor r10, r10
    xor rcx, rcx
.col:
    mov rax, rcx
    imul rax, COLS
    add r10, [grid + rax*8]
    inc rcx
    cmp rcx, ROWS
    jb .col

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
