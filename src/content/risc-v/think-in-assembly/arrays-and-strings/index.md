An array in memory has no length, no bounds and no element names. What it has is a first address and
a size per element, and every loop over it is built out of those two numbers. On RISC-V the size is
also what you multiply the index by, because `offset(base)` adds a register to nothing and scales
nothing.

## The size decides the shift

Asking for element number `i` means going to the first address and moving `i` elements along, and
moving along by an element means multiplying by its size. That multiplication is a shift you write
out: two places for a word, one for a half, and none at all for a byte, which is already the unit an
address counts in.

```riscv|playground|memory
.data
words:  .word 10, 20, 30, 40
halves: .half 1, 2, 3, 4
bytes:  .byte 5, 6, 7, 8

.text
main:
    li t0, 2            # i = 2
    la t1, words
    slli t2, t0, 2      # i * 4
    add t2, t1, t2
    lw t3, 0(t2)        # words[i]
    la t4, halves
    slli t5, t0, 1      # i * 2
    add t5, t4, t5
    lh t6, 0(t5)        # halves[i]
    la s0, bytes
    add s1, s0, t0      # i, with nothing to scale
    lb s2, 0(s1)        # bytes[i]
```

`t3` comes out at 30, `t6` at 3 and `s2` at 7, the third element of each of the three arrays. The
three `la` results say where the assembler put them: `10010000` for the words, `10010010` for the
halves, since four words take sixteen bytes, and `10010018` for the bytes.

An array of bytes needs no shift, which is why a string is walked with `addi t0, t0, 1` and nothing
else.

## Strings are bytes with a zero at the end

`.asciz "Assembly"` writes nine bytes: the eight character codes and the terminator the directive
adds. To the CPU `'A'` is the number 65, or `0x41`, which is what ASCII assigns to that letter, and
nothing anywhere marks that byte as a letter instead of a number.

Nothing records how long a string is either, so a loop finds out by reading until it reads a zero.

```riscv|playground|memory
.data
text: .asciz "Assembly"

.text
main:
    la t0, text         # where we are looking
    li t1, 0            # how many characters so far
loop:
    lb t2, 0(t0)        # the character there
    beqz t2, done       # a zero byte ends the string
    addi t0, t0, 1      # on to the next byte
    addi t1, t1, 1      # and count it
    j loop
done:
```

`t1` comes out at 8, the eight characters without the terminator, and `t0` at `10010008`, the address
of the zero byte. The memory panel at `10010000` reads `41 73 73 65 6D 62 6C 79 00`, and its text
button draws those same bytes as `Assembly`.

`lb` sign extends, so a byte above 127 comes back negative. Every ASCII character is 127 or under, so
`lb` is safe for text. Bytes that hold numbers instead of letters want `lbu`, which keeps them in 0
to 255.

## Copying one

Copying a string means copying characters until you have copied the terminator, and copying the
terminator is the point rather than an afterthought: without it the copy is not a string, it is just
some bytes that happen to look like one.

```riscv|playground|memory
.data
source: .asciz "Hi there"
dest:   .space 16

.text
main:
    la t0, source       # where we are reading
    la t1, dest         # where we are writing
loop:
    lb t2, 0(t0)        # the character there
    sb t2, 0(t1)        # write it to the other string
    addi t0, t0, 1      # step both pointers on
    addi t1, t1, 1      # and the second one
    bnez t2, loop       # until the byte copied was the terminator
```

`source` is nine bytes at `0x10010000`, so `dest` begins at `0x10010009`, and after the run the
memory panel shows the same nine bytes twice: `48 69 20 74 68 65 72 65 00` and then the same again.

The `bnez t2, loop` at the bottom is the test on the byte that was **just copied**, which is why the
terminator gets written before the loop ends. Comparing two strings is the same loop with a `bne`
between the two bytes in it, and the `sb` swapped for a second `lb`.

`dest` is a `.space`, so it is not word aligned and a `sw` into it would end the run. Bytes are fine
anywhere, which is why this loop does not care.

## Two dimensions

A 2D array is a 1D array read in rows. `grid[row][col]` is the base plus `(row * COLS + col)` times
the size of an element, and RISC-V makes you write both multiplications.

```riscv|playground|memory
.eqv COLS, 4

.data
grid:   .half 0, 1, 2, 3
        .half 10, 11, 12, 13
        .half 20, 21, 22, 23

.text
main:
    li t0, 2            # row
    li t1, 3            # column
    li t2, COLS
    mul t3, t0, t2      # row * COLS
    add t3, t3, t1      # + column
    slli t3, t3, 1      # times 2, the size of a half
    la t4, grid
    add t4, t4, t3
    lh t5, 0(t4)        # the element itself
```

`t5` comes out at 23, the last element of the last row, and `t3` at 22, which is the byte offset into
the block. The three `.half` lines are one array: the rows are a convenience for whoever reads the
source, and the twelve halves sit end to end from `0x10010000`, which is what `COLS` in the index
arithmetic assumes.

`mul t3, t0, t2` is a real instruction of the M extension and it is what a row of any width needs.
When the width is a power of two, `slli` does it in one cheaper instruction, and the two shifts can
be added together: a grid of 4 halves is `slli t3, t0, 3` for the row and then the column shifted by 1.

## Two strings to walk

`text` at `0x10010000` is a string with a zero at the end. Leave its length, not counting the
terminator, in `t0`. For `"Assembly"` that is 8.

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
    la t1, text         # where we are looking
    li t0, 0            # how many characters so far
loop:
    lb t2, 0(t1)        # the character there
    beqz t2, done
    addi t1, t1, 1
    addi t0, t0, 1
    j loop
done:
```

</details>

The second one turns `text` into upper case **in place**, so the memory at `0x10010000` ends up
holding `HELLO` and its terminator. A lower case letter is `'a'` to `'z'` and subtracting 32 from its
code gives the capital. The two bounds you compare against will each need a register of their own.

```riscv|playground|memory|exercise
.data
text: .asciz "hello"

.text
main:
    # your code here
```

```testcase
{
    "expectedMemory": [{ "type": "string-chunk", "address": "0x10010000", "expected": "HELLO" }]
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
text: .asciz "hello"

.text
main:
    la t0, text
    li t3, 'a'
    li t4, 'z'
loop:
    lb t1, 0(t0)        # the character there
    beqz t1, done
    blt t1, t3, skip    # leave anything that is not a lower case letter
    bgt t1, t4, skip
    addi t1, t1, -32    # 'a' - 'A' is 32
    sb t1, 0(t0)        # put it back
skip:
    addi t0, t0, 1
    j loop
done:
```

</details>
