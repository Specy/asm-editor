An array in memory has no length, no bounds and no element names. What it has is a first address and
a size per element, and every loop over it is built out of those two numbers. On MIPS the size is
also what you multiply the index by, because `offset(base)` adds a register to nothing and scales
nothing.

## The size decides the shift

`a[i]` in C is the base plus `i` times the size of an element. Here that multiplication is a shift
you write: two places for a word, one for a half, none at all for a byte.

```mips|playground|memory
.data
words:  .word 10, 20, 30, 40
halves: .half 1, 2, 3, 4
bytes:  .byte 5, 6, 7, 8

.text
main:
    li $t0, 2               # i = 2
    la $t1, words
    sll $t2, $t0, 2         # i * 4
    add $t2, $t1, $t2
    lw $t3, 0($t2)          # words[i]
    la $t4, halves
    sll $t5, $t0, 1         # i * 2
    add $t5, $t4, $t5
    lh $t6, 0($t5)          # halves[i]
    la $t7, bytes
    add $t8, $t7, $t0       # i, with nothing to scale
    lb $t9, 0($t8)          # bytes[i]
```

`$t3` comes out at 30, `$t6` at 3 and `$t9` at 7, the third element of each of the three arrays. The
three `la` results say where the assembler put them: `10010000` for the words, `10010010` for the
halves, since four words take sixteen bytes, and `10010018` for the bytes.

An array of bytes needs no shift, which is why a string is walked with `addi $t0, $t0, 1` and nothing
else.

## Strings are bytes with a zero at the end

`.asciiz "Assembly"` writes nine bytes: the eight character codes and the terminator the directive
adds. To the CPU `'A'` is the number 65, or `0x41`, which is what ASCII assigns to that letter, and
nothing anywhere marks that byte as a letter rather than a number.

Nothing records how long a string is either, so a loop finds out by reading until it reads a zero.

```mips|playground|memory
.data
text: .asciiz "Assembly"

.text
main:
    la $t0, text            # p = text
    li $t1, 0               # n = 0
loop:
    lb $t2, 0($t0)          # c = *p
    beqz $t2, done          # if(c == 0) stop
    addi $t0, $t0, 1        # p++
    addi $t1, $t1, 1        # n++
    j loop
done:
```

`$t1` comes out at 8, the eight characters without the terminator, and `$t0` at `10010008`, the
address of the zero byte. The memory panel at `10010000` reads `41 73 73 65 6D 62 6C 79 00`, and its
text button draws those same bytes as `Assembly`.

`lb` sign extends, so a byte above 127 comes back negative. Every ASCII character is 127 or under, so
`lb` is safe for text. Bytes that hold numbers instead of letters want `lbu`, which keeps them in 0
to 255.

## Copying one

`strcpy` in C copies characters until it has copied the terminator. Copying it is the point: a copy
without a terminator is not a string.

```mips|playground|memory
.data
source: .asciiz "Hi there"
dest:   .space 16

.text
main:
    la $t0, source          # p = source
    la $t1, dest            # q = dest
loop:
    lb $t2, 0($t0)          # c = *p
    sb $t2, 0($t1)          # *q = c
    addi $t0, $t0, 1        # p++
    addi $t1, $t1, 1        # q++
    bnez $t2, loop          # until the byte copied was the terminator
```

`source` is nine bytes at `0x10010000`, so `dest` begins at `0x10010009`, and after the run the
memory panel shows the same nine bytes twice: `48 69 20 74 68 65 72 65 00` and then the same again.

The `bnez $t2, loop` at the bottom is the test on the byte that was **just copied**, which is why the
terminator gets written before the loop ends. Comparing two strings is the same loop with a `bne`
between the two bytes in it, and a `sb` swapped for a second `lb`.

`dest` is a `.space`, so it is not word aligned and a `sw` into it would end the run. Bytes are fine
anywhere, which is why this loop does not care.

## Two dimensions

A 2D array is a 1D array read in rows. `grid[row][col]` is the base plus `(row * COLS + col)` times
the size of an element, and MIPS makes you write both multiplications.

```mips|playground|memory
.eqv COLS 4

.data
grid:   .half 0, 1, 2, 3
        .half 10, 11, 12, 13
        .half 20, 21, 22, 23

.text
main:
    li $t0, 2               # row
    li $t1, 3               # column
    li $t2, COLS
    mul $t3, $t0, $t2       # row * COLS
    add $t3, $t3, $t1       # + column
    sll $t3, $t3, 1         # times 2, the size of a half
    la $t4, grid
    add $t4, $t4, $t3
    lh $t5, 0($t4)          # grid[row][col]
```

`$t5` comes out at 23, the last element of the last row, and `$t3` at 22, which is the byte offset
into the block. The three `.half` lines are one array: the rows are a convenience for whoever reads
the source, and the twelve halves sit end to end from `0x10010000`, which is what `COLS` in the index
arithmetic assumes.

`mul $t3, $t0, $t2` is a real instruction and it is what a row of any width needs. When the width is
a power of two, `sll` does it in one cheaper instruction, and the two shifts can be added together:
a grid of 4 halves is `sll $t3, $t0, 3` for the row and then the column shifted by 1.

Try changing `li $t0, 2` to `li $t0, 0` and `li $t1, 3` to `li $t1, 1`. `$t5` comes out at 1, the
second element of the first row.

## Your turn

`text` at `0x10010000` is a string with a zero at the end. Leave its length, not counting the
terminator, in `$t0`. For `"Assembly"` that is 8.

```mips|playground|memory|exercise
.data
text: .asciiz "Assembly"

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": 8 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
text: .asciiz "Assembly"

.text
main:
    la $t1, text        # p = text
    li $t0, 0           # n = 0
loop:
    lb $t2, 0($t1)      # c = *p
    beqz $t2, done
    addi $t1, $t1, 1
    addi $t0, $t0, 1
    j loop
done:
```

</details>

The second one turns `text` into upper case **in place**, so the memory at `0x10010000` ends up
holding `HELLO` and its terminator. A lower case letter is `'a'` to `'z'` and subtracting 32 from its
code gives the capital.

```mips|playground|memory|exercise
.data
text: .asciiz "hello"

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

```mips|playground|memory|solution
.data
text: .asciiz "hello"

.text
main:
    la $t0, text
loop:
    lb $t1, 0($t0)      # c = *p
    beqz $t1, done
    blt $t1, 'a', skip  # leave anything that is not a lower case letter
    bgt $t1, 'z', skip
    addi $t1, $t1, -32  # 'a' - 'A' is 32
    sb $t1, 0($t0)      # *p = c
skip:
    addi $t0, $t0, 1
    j loop
done:
```

</details>
