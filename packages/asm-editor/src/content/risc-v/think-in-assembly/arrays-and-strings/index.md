An array occupies one contiguous run of memory, with equal-sized elements placed one after another.
Its memory representation carries no automatic length or bounds. A program can keep the length in a
register or memory, define it as a constant, or mark the address just after the final element.

To reach element `i`, start with the array's base address and add `i * element_size`. RISC-V addresses
memory in bytes, so the element size turns an index into a byte offset.

## Scale a register index

The address inside a load or store has the form `constant(base_register)`. For example,
`lw t3, 8(t1)` reads four bytes at address `t1 + 8`. The `8` is a constant byte offset encoded in the
instruction. When an index is held in a register, calculate its byte offset, add that to the base,
and then load or store through the resulting address.

Here the same index selects the third element from arrays whose elements have three different sizes:

```riscv|playground|memory
.data
words:  .word 10, 20, 30, 40
halves: .half 1, 2, 3, 4
bytes:  .byte 5, 6, 7, 8

.text
main:
    li   t0, 2           # i = 2

    la   t1, words
    slli t2, t0, 2       # byte offset = i * 4
    add  t2, t1, t2
    lw   t3, 0(t2)       # words[i]

    la   t1, halves
    slli t2, t0, 1       # byte offset = i * 2
    add  t2, t1, t2
    lh   t4, 0(t2)       # halves[i]

    la   t1, bytes
    add  t2, t1, t0      # byte offset = i
    lb   t5, 0(t2)       # bytes[i]
```

After the run, `t3` is 30, `t4` is 3 and `t5` is 7. Shifting left by two multiplies by four, and
shifting left by one multiplies by two. A byte index is already a byte offset, so it needs no shift.

In this simulator, `words`, `halves` and `bytes` begin at `0x10010000`, `0x10010010` and
`0x10010018`. Those addresses follow from this particular data layout; the labels let the program
work without embedding them as constants.

A moving pointer is the other common way to walk an array. Add 4 after visiting a word, 2 after a
halfword, or 1 after a byte. An index loop and a pointer loop perform the same address arithmetic in
different places.

## Zero-terminated strings

A string is an array of character-code bytes with a convention for finding its end. The `.asciz`
directive appends a zero byte after the characters:

```riscv
text: .asciz "Assembly"
```

This writes nine bytes: eight ASCII character codes followed by zero. `'A'` has ASCII code 65, or
`0x41`, so the bytes begin `41 73 73 65 6D 62 6C 79 00`. In this simulator, if `text` is the first
item in `.data`, those bytes begin at `0x10010000`.

The zero is called the **terminator**. A program finds the string's end by checking one byte at a
time, and its character count excludes that terminator. The string itself still occupies one extra
byte to hold it.

Choose `lb` or `lbu` according to how the loaded byte will be interpreted:

- `lb` sign-extends bit 7 and gives a signed value from -128 through 127.
- `lbu` zero-extends and gives an unsigned value from 0 through 255.

ASCII codes use only 0 through 127, so both instructions produce the same register value for ASCII.
Either also works when a byte is only tested for zero or copied with `sb`: zero remains zero, and
`sb` writes the low eight bits. Use `lbu` when later arithmetic or comparison should treat every
possible byte as an unsigned number, and `lb` when the byte represents a signed 8-bit value.

## Copy a string

A complete string copy includes the terminating zero. This loop stores each byte before deciding
whether another pass is needed:

```riscv|playground|memory
.data
source: .asciz "Hi there"
dest:   .space 16

.text
main:
    la   t0, source      # source pointer
    la   t1, dest        # destination pointer
loop:
    lbu  t2, 0(t0)       # read one byte
    sb   t2, 0(t1)       # copy that byte, including a possible zero
    addi t0, t0, 1
    addi t1, t1, 1
    bnez t2, loop        # continue if the copied byte was not zero
done:
```

In this simulator, `source` begins at `0x10010000` and occupies nine bytes, so `dest` begins at
`0x10010009`. After the run, both locations contain `48 69 20 74 68 65 72 65 00`. The branch tests
the byte that was just stored; when it is zero, the destination already has its terminator.

## Compare two strings

Two zero-terminated strings are equal when every corresponding character matches and both reach
their terminators together. A mismatch produces 0 here, while matching strings produce 1:

```riscv|playground|memory
.data
left:  .asciz "same"
right: .asciz "sand"

.text
main:
    la   t0, left
    la   t1, right
compare:
    lbu  t2, 0(t0)
    lbu  t3, 0(t1)
    bne  t2, t3, different
    beqz t2, equal       # equal bytes that are zero end both strings
    addi t0, t0, 1
    addi t1, t1, 1
    j    compare
different:
    li   t4, 0
    j    done
equal:
    li   t4, 1
done:
```

With the data shown, the third characters differ, so `t4` becomes 0. Change `right` to `"same"`
and `t4` becomes 1. The `beqz` is reached only after the two loaded bytes have compared equal. If
that equal byte is zero, both strings ended at the same position and every earlier pair matched.

## Two dimensions

A 2D array is stored as one contiguous array, one row after another. If every row has `COLS`
elements, the element number for `grid[row][col]` is:

```text
row * COLS + col
```

Multiply that element number by the element size to obtain the byte offset. This example uses four
halfwords per row:

```riscv|playground|memory
.eqv COLS, 4

.data
grid:   .half 0, 1, 2, 3
        .half 10, 11, 12, 13
        .half 20, 21, 22, 23

.text
main:
    li   t0, 2           # row
    li   t1, 3           # column
    li   t2, COLS
    mul  t3, t0, t2      # row * COLS
    add  t3, t3, t1      # row * COLS + column
    slli t3, t3, 1       # byte offset: halfwords take two bytes
    la   t4, grid
    add  t4, t4, t3
    lh   t5, 0(t4)       # grid[row][column]
```

`t3` becomes 22, the byte offset of element 11, and `t5` becomes 23. The line breaks in the data
declaration make the rows visible to a reader; memory contains twelve consecutive halfwords. The
value of `COLS` is what gives those bytes their row shape during the calculation.

When the row width and element size are powers of two, shifts can express both multiplications
directly. A row above occupies `4 * 2 = 8` bytes, and a column step occupies 2 bytes. This complete
sequence computes the same address:

```riscv
    # t0 = row, t1 = column
    slli t2, t0, 3       # row byte offset = row * 8
    slli t3, t1, 1       # column byte offset = column * 2
    add  t2, t2, t3      # total byte offset
    la   t4, grid
    add  t4, t4, t2
    lh   t5, 0(t4)
```

The shift form makes the power-of-two layout explicit. The multiplication form follows the general
formula and also works when the row width is not a power of two.

## Four memory exercises

First, load element 4 of the halfword array into `t1`. The supplied index in `t0` is zero-based, so
element 4 holds 23.

```riscv|playground|memory|exercise
.data
values: .half 4, 8, 15, 16, 23, 42

.text
main:
    li t0, 4             # index
    # your code here
```

```testcase
{
    "expectedRegisters": { "t1": 23 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
values: .half 4, 8, 15, 16, 23, 42

.text
main:
    li   t0, 4
    slli t2, t0, 1       # halfword index to byte offset
    la   t3, values
    add  t3, t3, t2
    lh   t1, 0(t3)
```

</details>

Next, leave the length of `text`, excluding its terminator, in `t0`. For `"Assembly"` the answer is 8.

```riscv|playground|memory|exercise
.data
text: .asciz "Assembly"

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "t0": 8 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
text: .asciz "Assembly"

.text
main:
    la   t1, text
    li   t0, 0
loop:
    lbu  t2, 0(t1)
    beqz t2, done
    addi t1, t1, 1
    addi t0, t0, 1
    j    loop
done:
```

</details>

For the third exercise, load `grid[1][2]` into `t2`. The grid has four halfwords per row.

```riscv|playground|memory|exercise
.eqv COLS, 4

.data
grid:   .half 0, 1, 2, 3
        .half 10, 11, 12, 13
        .half 20, 21, 22, 23

.text
main:
    li t0, 1             # row
    li t1, 2             # column
    # your code here
```

```testcase
{
    "expectedRegisters": { "t2": 12 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.eqv COLS, 4

.data
grid:   .half 0, 1, 2, 3
        .half 10, 11, 12, 13
        .half 20, 21, 22, 23

.text
main:
    li   t0, 1
    li   t1, 2
    li   t3, COLS
    mul  t3, t0, t3      # row * COLS
    add  t3, t3, t1      # add the column
    slli t3, t3, 1       # halfword index to byte offset
    la   t4, grid
    add  t4, t4, t3
    lh   t2, 0(t4)
```

</details>

Finally, turn `text` into upper case in place. A character literal is its numeric character code:
`'a'` assembles as ASCII 97 and `'z'` as ASCII 122. Subtracting 32 from a lowercase ASCII code
produces the corresponding uppercase code. Leave other characters unchanged and preserve the
terminator. In this simulator, this first `.data` item begins at `0x10010000`, which is the memory
address checked below. The result should read `HELLO, ASM!`: the existing uppercase letter, comma,
space and exclamation mark stay as they are.

```riscv|playground|memory|exercise
.data
text: .asciz "Hello, asm!"

.text
main:
    # your code here
```

```testcase
{
    "expectedMemory": [{ "type": "string-chunk", "address": "0x10010000", "expected": "HELLO, ASM!" }]
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
text: .asciz "Hello, asm!"

.text
main:
    la   t0, text
    li   t3, 'a'         # ASCII 97
    li   t4, 'z'         # ASCII 122
loop:
    lbu  t1, 0(t0)
    beqz t1, done
    blt  t1, t3, skip
    bgt  t1, t4, skip
    addi t1, t1, -32
    sb   t1, 0(t0)
skip:
    addi t0, t0, 1
    j    loop
done:
```

</details>
