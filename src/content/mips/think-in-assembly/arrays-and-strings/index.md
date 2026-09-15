An array in memory is a first address and a run of equal sized values. That is genuinely all it is.
Nothing records how long it is, nothing stops you reading past the end, and the names you gave the
elements existed only in your source. Everything you do with one is built out of the two numbers you
do have: where it starts, and how many bytes one element takes.

## The size decides the shift

Element number `i` lives at the base address plus `i` times the size of an element, and since
`offset(base)` will not scale anything for you, the multiplication is a line of your program. Every
size here is a power of two, so it is a shift: two places for a word, one for a half, and nothing at
all for a byte.

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
    lw $t3, 0($t2)          # element i of words
    la $t4, halves
    sll $t5, $t0, 1         # i * 2
    add $t5, $t4, $t5
    lh $t6, 0($t5)          # element i of halves
    la $t7, bytes
    add $t8, $t7, $t0       # i, with nothing to scale
    lb $t9, 0($t8)          # element i of bytes
```

`$t3`, `$t6` and `$t9` hold 30, 3 and 7, which is element 2 of each array, from the same index in
`$t0` and three different shifts. Look at the addresses the three `la` lines produced as well:
`10010000`, `10010010` and `10010018`. Four words take sixteen bytes, then four halves take eight,
and the assembler laid them out back to back in the order you wrote them.

A byte array needs no shift at all, which is why walking a string is `addi $t0, $t0, 1` and nothing
more.

## Strings are bytes with a zero at the end

`.asciiz "Assembly"` writes nine bytes: eight character codes and a zero byte on the end, which is
what the `z` in the directive's name is for. To the CPU `'A'` is the number 65, `0x41` in hex,
because that is the code ASCII gives that letter, and there is nothing in the byte marking it as a
letter rather than as the number 65. The same byte is both.

That zero at the end is the only thing that says where the string stops, so a program measures a
string by walking it until it finds one.

```mips|playground|memory
.data
text: .asciiz "Assembly"

.text
main:
    la $t0, text            # where we are in the string
    li $t1, 0               # characters counted so far
loop:
    lb $t2, 0($t0)          # the character we are standing on
    beqz $t2, done          # a zero byte ends the string
    addi $t0, $t0, 1        # on to the next byte
    addi $t1, $t1, 1        # and count it
    j loop
done:
```

`$t1` is 8, the eight characters, with the terminator counted as an ending rather than a character.
`$t0` finishes at `10010008`, standing on the zero byte itself.

The memory panel at `10010000` reads `41 73 73 65 6D 62 6C 79 00`, and its text button draws those
same nine bytes as `Assembly`. One set of bytes, two ways of looking at it, and the bytes themselves
do not care.

The loop uses `lb`, which sign extends, so a byte above 127 comes back as a negative number. Every
ASCII character is 127 or under so text is safe, but a byte array holding **numbers** wants `lbu`,
which keeps them in the range 0 to 255.

## Copying one

Copying a string means copying characters until you have copied the zero as well. That last byte is
not an afterthought: a copy that stops one byte early is not a string at all, and the next thing
that reads it walks off into whatever follows in memory.

```mips|playground|memory
.data
source: .asciiz "Hi there"
dest:   .space 16

.text
main:
    la $t0, source          # where we are reading
    la $t1, dest            # where we are writing
loop:
    lb $t2, 0($t0)          # the character we are standing on
    sb $t2, 0($t1)          # write it straight back out
    addi $t0, $t0, 1        # on to the next byte
    addi $t1, $t1, 1        # and the writing one
    bnez $t2, loop          # until the byte copied was the terminator
```

`source` is nine bytes starting at `0x10010000`, so `dest` begins at `0x10010009`, and after the run
the memory panel shows the same nine bytes twice over: `48 69 20 74 68 65 72 65 00` and then the
same again.

The order of the last two lines is the thing to understand. `bnez $t2, loop` tests the byte that was
**just copied**, not the next one, so the terminator is written first and the loop ends after it.
Move that test to the top of the loop and the copy comes out one byte short.

Comparing two strings instead of copying one is the same loop with the `sb` replaced by a second
`lb` and a `bne` between the two bytes.

One detail that will bite you elsewhere: `dest` is a `.space`, which the assembler does not align,
so it starts at an odd address and a `sw` into it would end the run. This loop uses `sb`, and a byte
may go anywhere.

## Two dimensions

Memory is one long line of bytes, so a grid has to be flattened into one. The usual way is row by
row: the whole of row 0, then the whole of row 1, and so on. Then the element at row `r`, column `c`
is element number `r * COLS + c` of the flat array, and from there it is the same base plus index
times size as before. Both multiplications are yours to write.

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
    lh $t5, 0($t4)          # the element at that row and column
```

`$t5` is 23, row 2 column 3, the last element of the last row. `$t3` on the way there was 22, which
is the byte offset: element 11 of the flat array, two bytes each.

The three `.half` lines are **one** array. Writing them on separate lines is a kindness to whoever
reads the source and means nothing to the assembler, which puts all twelve halves end to end from
`0x10010000`. The rows exist only because `COLS` in the index arithmetic says they do. Add a fifth
number to each `.half` line and forget to change `COLS`, and the program will go on reading
perfectly valid halves out of the wrong places without a word of complaint.

`mul $t3, $t0, $t2` handles a row of any width. When the width is a power of two you can use `sll`
instead and save an instruction, and the two shifts then fold into one: a grid of 4 halves per row
is `sll $t3, $t0, 3` for the row, plus the column shifted by 1.

## Two on strings

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
    la $t1, text        # where we are in the string
    li $t0, 0           # characters counted so far
loop:
    lb $t2, 0($t1)      # the character we are standing on
    beqz $t2, done
    addi $t1, $t1, 1
    addi $t0, $t0, 1
    j loop
done:
```

</details>

The second one turns `text` into upper case **in place**, so the memory at `0x10010000` ends up
holding `HELLO` and its terminator. A lower case letter has a code from `'a'` to `'z'`, and
subtracting 32 from it gives the capital.

The part worth thinking about is "is this byte a lower case letter", which is two comparisons rather
than one: below `'a'` means no, above `'z'` means no, and anything else means yes. Both of those can
send you past the conversion with a branch.

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
    lb $t1, 0($t0)      # the character we are standing on
    beqz $t1, done
    blt $t1, 'a', skip  # leave anything that is not a lower case letter
    bgt $t1, 'z', skip
    addi $t1, $t1, -32  # 'a' - 'A' is 32
    sb $t1, 0($t0)      # write the capital back over it
skip:
    addi $t0, $t0, 1
    j loop
done:
```

</details>
