Memory is a line of bytes. It has no idea what a row is, and there is no arrangement of hardware that
will give it one. A grid of three rows and four columns is therefore twelve numbers in a row, plus an
agreement about how to read them.

The agreement here is **row major**: the whole of row 0, then the whole of row 1, then row 2. Under
that agreement the element at row `r` and column `c` is number `r * COLS + c` in the line, and the
multiplication is where the shape of the grid actually lives.

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

`r9` is 26, which is 5 + 6 + 7 + 8, a whole row. `r10` is 21, which is 3 + 7 + 11, a whole column. The
two loops that produced them are the same length and do very different amounts of work.

The row loop adds 1 to its index each pass, so it reads twelve consecutive qwords going forwards. The
column loop adds `COLS` to its index, so it jumps thirty two bytes at a time. On real hardware that is
several times slower for exactly the same arithmetic, because neighbouring elements of a row arrive in
the same cache line and are already there by the time the loop asks for them, while neighbouring
elements of a column are each in a different one. A program that walks a large array the wrong way
round can spend most of its time waiting for memory.

Nothing recorded that this was a grid, which you can prove. Change `COLS equ 4` to `COLS equ 3` and do
not touch a byte of the data. The program now reads the same twelve numbers as four rows of three,
`r8` becomes 8, and no error is reported anywhere, because the only thing that ever said "four
columns" was the `imul`.

The three `dq` lines are one array for the same reason: the assembler writes twelve qwords one after
another and the line breaks in the source exist for your benefit only.

`[grid + rax*8]` scales by 8 because an element is a qword. An element of some other size, a twenty
byte record say, needs a real multiplication into a register first, because the scale in an address
only goes up to 8.
