An array is a run of equal-sized elements stored next to one another in memory. Its label gives the
address of the first element, called the **base address**. To reach element `i`, calculate

```text
address = base + i * element_size
```

Assembly does not remember an array's length or scale an index for you. The program must use the
right element size and keep the index within the array.

## From an index to a byte offset

The product `i * element_size` is a **byte offset** from the base. The offsets for the first four
elements show how the element width changes the arithmetic:

| element index `i` | word array, 4 bytes each | half array, 2 bytes each | byte array, 1 byte each |
| ----------------: | -----------------------: | -----------------------: | ----------------------: |
|                 0 |                        0 |                        0 |                       0 |
|                 1 |                        4 |                        2 |                       1 |
|                 2 |                        8 |                        4 |                       2 |
|                 3 |                       12 |                        6 |                       3 |

For example, if a word array begins at `0x10010000`, element 3 is 12 bytes after the base, at
`0x1001000C`. The load still uses offset 0 because the calculation has already produced the exact
element address:

```mips|playground|memory
.data
words: .word 10, 20, 30, 40

.text
main:
    li $t0, 3               # index i
    li $t1, 4               # size of one word in bytes
    mul $t2, $t0, $t1       # mul destination, left, right: i * 4
    la $t3, words            # base address
    add $t3, $t3, $t2       # base + byte offset
    lw $t4, 0($t3)          # words[3] = 40

    li $v0, 10
    syscall
```

Here `mul $t2, $t0, $t1` multiplies the two source registers and puts the product in `$t2`. The same
base-plus-offset rule works at every width: use `lw` for words, `lh` for halves, and `lbu` for byte
values. For a byte array, the index is already a byte offset because multiplying by 1 changes
nothing.

## Strings are zero-terminated byte arrays

A string stores one character code per byte and ends with a zero byte. The directive
`.asciiz "Assembly"` writes the eight character bytes followed by that zero terminator. A character
literal such as `'A'` asks the assembler for one character's numeric code; in ASCII, `'A'` is 65.

There is no separate length field. A program finds the length by loading one byte at a time until
it reaches the terminator:

```mips|playground|memory
.data
text: .asciiz "Assembly"

.text
main:
    la $t0, text            # address of the current byte
    li $t1, 0               # number of characters already counted

length_test:
    lbu $t2, 0($t0)         # current character code, from 0 through 255
    beqz $t2, length_done
    addi $t0, $t0, 1        # advance by one byte
    addi $t1, $t1, 1
    j length_test

length_done:
    li $v0, 10
    syscall
```

Whenever execution reaches `length_test`, `$t0` points to the byte being inspected and `$t1` is the
number of characters before that byte. Those two facts are the loop's **invariants**. When the zero
is found, `$t0` points to the terminator and `$t1` holds 8. The terminator marks the end; it is not
included in the length.

`lbu` means **load byte unsigned**. It zero-extends the loaded byte to a value from 0 through 255,
which is the useful range for character codes. `lb` instead sign-extends bytes whose top bit is 1
into negative values.

## Copy the byte, then test it

The destination needs enough room for every character and the terminator. `.space 16` reserves
exactly 16 bytes, so the eight characters and zero byte in `"Hi there"` fit.

```mips|playground|memory
.data
source: .asciiz "Hi there"
dest:   .space 16

.text
main:
    la $t0, source          # address of the next byte to read
    la $t1, dest            # address of the next byte to write

copy_loop:
    lbu $t2, 0($t0)         # 1. load the next byte
    sb $t2, 0($t1)          # 2. copy it
    addi $t0, $t0, 1        # 3. advance both pointers
    addi $t1, $t1, 1
    bnez $t2, copy_loop     # 4. repeat if the copied byte was not zero

    li $v0, 10
    syscall
```

At the start of each pass, `$t0` points to the next unread source byte and `$t1` points to the next
unwritten destination byte. Everything before those pointers has already been copied. The loop
uses the order **load, copy, advance, test**, so the zero byte is copied before the branch ends the
loop. Afterwards, both pointers are one byte past their strings, and `dest` is a valid
zero-terminated copy.

## Rows and columns in one line of memory

Memory is a line of bytes, even when source code arranges values as a grid. In **row-major order**,
all of row 0 comes first, then all of row 1, and so on. For an array with a fixed number of columns,
the complete address calculation is

```text
address = base + (row * columns + column) * element_size
```

`.eqv COLS 4` gives the constant 4 the name `COLS`. The assembler replaces that name wherever it is
used. This example finds row 2, column 3 in a grid of halfwords:

```mips|playground|memory
.eqv COLS 4
.eqv HALF_SIZE 2

.data
grid:   .half 0, 1, 2, 3
        .half 10, 11, 12, 13
        .half 20, 21, 22, 23

.text
main:
    li $t0, 2               # row
    li $t1, 3               # column
    li $t2, COLS
    mul $t3, $t0, $t2       # row * columns = 8
    add $t3, $t3, $t1       # flat element index = 11
    li $t2, HALF_SIZE
    mul $t3, $t3, $t2       # byte offset = 22
    la $t4, grid
    add $t4, $t4, $t3
    lh $t5, 0($t4)          # grid[2][3] = 23

    li $v0, 10
    syscall
```

The three `.half` lines form one contiguous array of twelve elements. Their line breaks only make
the source easier to read. The value of `COLS` is what makes every four elements one logical row.

## Checking a character range

ASCII places the lowercase letters together from `'a'` through `'z'`. To decide whether a byte is
lowercase, reject values below the lower bound and above the upper bound:

```mips|playground
.text
main:
    li $t0, 'g'                 # a character literal supplies the code for g
    blt $t0, 'a', not_lowercase # branch if value < lower bound
    bgt $t0, 'z', not_lowercase # branch if value > upper bound
    addi $t0, $t0, -32          # g becomes G

not_lowercase:
    li $v0, 10
    syscall
```

The forms are `blt value, lower_bound, label` and `bgt value, upper_bound, label`. For `'g'`, neither
branch is taken, so subtracting 32 produces `'G'`. A character such as `'!'` takes the first branch,
while `'{'` takes the second. Both skip the conversion.

## Your turn

Find the length of `text`, excluding its zero terminator, and leave the result in `$t0`. The string
contains letters, a space, digits, and punctuation; each still occupies one byte. Use `lbu` to walk
the string. The stop sequence is already present.

```mips|playground|memory|exercise
.data
text: .asciiz "MIPS 32!"

.text
main:
    # count the characters here

    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": 8, "$v0": 10 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
text: .asciiz "MIPS 32!"

.text
main:
    la $t1, text
    li $t0, 0

length_test:
    lbu $t2, 0($t1)
    beqz $t2, length_done
    addi $t1, $t1, 1
    addi $t0, $t0, 1
    j length_test

length_done:
    li $v0, 10
    syscall
```

</details>

Now convert every lowercase ASCII letter in `text` to uppercase **in place**. Leave uppercase
letters, punctuation, and digits unchanged. For each nonzero byte, use the two-sided `blt`/`bgt`
range check shown above; subtract 32 and store the byte back only when it lies from `'a'` through
`'z'`. The stop sequence is already present.

```mips|playground|memory|exercise
.data
text: .asciiz "aAzZ-09!"

.text
main:
    # walk the string and convert lowercase letters here

    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$v0": 10 },
    "expectedMemory": [
        { "type": "string-chunk", "address": "0x10010000", "expected": "AAZZ-09!" },
        { "type": "number", "address": "0x10010008", "bytes": 1, "expected": 0 }
    ]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
text: .asciiz "aAzZ-09!"

.text
main:
    la $t0, text

loop:
    lbu $t1, 0($t0)
    beqz $t1, done
    blt $t1, 'a', advance
    bgt $t1, 'z', advance
    addi $t1, $t1, -32
    sb $t1, 0($t0)

advance:
    addi $t0, $t0, 1
    j loop

done:
    li $v0, 10
    syscall
```

</details>
