A register holds 32 bits. Not a number: bits. Whether those particular bits mean 4294967295, or
mean -1, or mean four letters, or mean an address, is settled by the instruction that reads them and
by nothing else. Two instructions can read the same register on two consecutive lines and disagree
about what is in it, and both of them can be right.

This page is about the two places you make that decision: picking one of a signed and an unsigned
instruction, and picking how many of the 32 bits an instruction touches.

## Three ways of writing a number

The assembler reads decimal, hexadecimal and a character literal. There is no `#` in front: an
operand made of digits is a number and an operand beginning with `$` is a register.

| written | base                  |
| ------- | --------------------- |
| `100`   | decimal               |
| `0x64`  | hexadecimal           |
| `'d'`   | the ASCII code of `d` |

All three of those are the number 100, the last one because ASCII gives the letter `d` the code
`0x64`. Those three and no more: `0b1100100` is a build error, so binary is something you write out
in hex. Negative numbers take a minus sign.

The assembler also does no arithmetic, which catches everybody once. `li $t0, 4*2` does not
assemble. `.word 2+3` writes **two** words, a 2 and a 3, because the `+` is read as a separator
rather than as a sum. The one place the assembler will add for you is an address: `lw $t0,
numbers+8` means eight bytes past the label.

```mips|playground
.text
main:
    li $t0, 100         # decimal
    li $t1, 0x64        # hexadecimal
    li $t2, 'd'         # a character
    li $t3, -1          # negative
    li $t4, 2147483647  # the largest signed word
    li $t5, -2147483648 # and the smallest
```

`$t0`, `$t1` and `$t2` all end up holding `00000064`, three spellings of one number. The last two
lines are the edges of the signed range, and the panel shows them as `7FFFFFFF` and `80000000`:
those two bit patterns are next to each other, and as signed numbers they are as far apart as this
machine can get.

## Byte, half, word

The three sizes have names, and MIPS uses them in the names of its instructions:

- a **byte**, 1 byte, 8 bits, which `lb`, `lbu` and `sb` move.
- a **half**, 2 bytes, 16 bits, which `lh`, `lhu` and `sh` move.
- a **word**, 4 bytes, 32 bits, which `lw` and `sw` move, and which is the size of every register.

"Word" is a slippery term in general, because different machines have used it for different sizes.
Here and everywhere in this course it is 4 bytes, and if you ever read a manual for hardware you do
not know, that is the first thing worth checking.

Everything that is not a load or a store works on the full 32 bits. `add`, `and`, `sll` and the rest
read all 32 bits of each operand and write all 32 bits of the destination, so sizes only ever come
up where a value is going to or coming from memory, which is where the smaller things live.

## The same bits, two readings

`FFFFFFFF` is 4294967295 read as an unsigned word and -1 read as a signed one, and nothing in the
register says which. The signed reading is **two's complement**: the top bit is the sign, and
negating a number means flipping every bit and adding 1.

Where the answer really is different, MIPS gives you two instructions and you pick:

| signed | unsigned | what they differ about                     |
| ------ | -------- | ------------------------------------------ |
| `slt`  | `sltu`   | which of two registers is smaller          |
| `slti` | `sltiu`  | the same against a constant                |
| `lb`   | `lbu`    | what fills the 24 bits above a loaded byte |
| `lh`   | `lhu`    | the 16 bits above a loaded half            |
| `sra`  | `srl`    | what comes in at the top of a right shift  |
| `div`  | `divu`   | division                                   |
| `mult` | `multu`  | multiplication                             |

```mips|playground
.text
main:
    li $t0, -1              # FFFFFFFF: -1 signed, 4294967295 unsigned
    li $t1, 1
    slt $t2, $t0, $t1       # is -1 less than 1? signed
    sltu $t3, $t0, $t1      # is 4294967295 less than 1? unsigned
    li $t4, -20
    sra $t5, $t4, 2         # -20 / 4, the sign dragged along
    srl $t6, $t4, 2         # the same bits, zeroes coming in
```

`$t2` is 1 and `$t3` is 0, out of the same two registers, on consecutive lines. `$t5` and `$t6` do
the same trick: both shifted the same bits right by two, and one answered -5 while the other
answered a number over a billion. Neither instruction is wrong. They were asked different questions
about the same 32 bits.

The registers panel has the same choice. The **B**, **W** and **L** buttons in its header cut each
register into bytes, halves or one word, and hovering a value shows its signed and unsigned readings
side by side.

## Sign extension

Copying a byte into a 32 bit register has to decide what goes in the 24 bits above it. `0xF0` as an
unsigned byte is 240, and as a signed byte it is -16, and as a word 240 is `000000F0` while -16 is
`FFFFFFF0`. **Sign extension** is filling the bits above with copies of the top bit, which is what
keeps a signed number the same number in a bigger box.

MIPS builds the choice into the load itself rather than giving you a separate instruction for it.
`lb` sign extends the byte it read and `lbu` fills the top with zeroes, and `lh` and `lhu` are the
same pair for a half.

The same choice is made about the 16 bit constant inside an instruction, and here the two families
split the other way:

- **`addi`, `addiu`, `slti`, `sltiu`** and the load and store offsets **sign extend** their constant,
  so `-1` written in the instruction is `FFFFFFFF` by the time it is added.
- **`andi`, `ori`, `xori`** **zero extend** theirs, so `0xFFFF` in one of those is `0000FFFF` and
  never touches the top half of the register.

```mips|playground|memory
.data
byte:   .byte 0xF0
        .align 1
half:   .half 0xFFFF

.text
main:
    la $t0, byte
    lb $t1, 0($t0)          # sign extended: FFFFFFF0
    lbu $t2, 0($t0)          # zero filled: 000000F0
    la $t3, half
    lh $t4, 0($t3)           # FFFFFFFF
    lhu $t5, 0($t3)          # 0000FFFF
    addi $t6, $zero, -1      # the constant is sign extended
    ori $t7, $zero, 0xFFFF   # and this one is not
    andi $t8, $t6, 0xFFFF    # so this keeps the low half of -1
```

`$t1` and `$t2` hold `FFFFFFF0` and `000000F0`: the same single byte in memory, loaded twice, two
answers. Further down, `$t8` is `0000FFFF`, which is `-1` with its top half wiped out, and the
wiping was done by the `andi`'s own constant having zeroes above it rather than by anything you
wrote.

`addiu` is the name in that group that misleads people. Its `u` is the overflow `u`, not the
constant `u`: `addiu $t0, $zero, -1` really does put `FFFFFFFF` in `$t0`.

## How much of an instruction a constant gets

A MIPS instruction is 32 bits and it has to name two registers and an operation, so there are 16 bits
left for a constant. Anything from -32768 to 65535 goes into one instruction. Anything else takes
two: `lui` puts the top 16 bits in place and clears the bottom ones, and an `ori` or an `addiu` puts
the bottom half in.

`li` hides that. Give it a small number and you get one instruction, give it a large one and you get
two, and the second of them goes through `$at`.

```mips|playground
.text
main:
    li $t0, 32767           # fits, so one instruction
    li $t1, 100000          # does not, so lui and ori through $at
    move $t2, $at           # and here is what it left behind
    lui $t3, 0x1234         # the top half, written by hand
    ori $t3, $t3, 0x5678    # and the bottom half
```

The line to look at is `$t2`. Nothing in the program you wrote put anything there, and it holds
`00010000`, the top half of 100000 left over from the first of the two instructions `li` turned
into. Click on the `li $t1, 100000` line after building and the editor prints both of them
underneath it.

## Overflow

Add 1 to the largest signed word and the answer wraps round to the smallest. MIPS gives you two
opinions about that, one instruction each:

- **`add`, `addi` and `sub`** raise an **arithmetic overflow** exception when the true answer does
  not fit in a signed 32 bit word. Nothing is written, and the run ends with
  `Runtime exception at ...: arithmetic overflow` unless the program installed a handler.
- **`addu`, `addiu` and `subu`** never do. The answer wraps round and the program carries on, and
  this is the pair nearly all real MIPS code is written with.

```mips|playground
.text
main:
    li $t0, 0x7FFFFFFF      # the largest signed word
    addu $t1, $t0, $t0      # one past it twice over, wrapped
    li $t2, -1
    addu $t3, $t2, $t2
    addiu $t4, $t0, 1       # and the immediate form
```

`$t1` and `$t3` both hold `FFFFFFFE`, from two additions with nothing in common. `$t4` is
`80000000`: adding 1 to the largest positive word landed on the most negative one, which is what
wrapping round looks like when you read it as signed.

Now change `addu $t1, $t0, $t0` to `add $t1, $t0, $t0` and press Run. The program stops dead on that
line with `arithmetic overflow`, and `$t1` is never written. That is the difference between the two
families, and it is why the choice is worth making deliberately.

Either way the machine keeps no record of the wrap afterwards. A program that needs to know whether
an unsigned addition wrapped works it out from the answer, which "Comparing two numbers" shows how
to do.

## Your turn

The test starts `$t0` at -16, which the panel shows as `FFFFFFF0`. Divide it by 16 twice with
shifts: the signed answer in `$t1`, which is -1, and the unsigned answer in `$t2`, which is
`0x0FFFFFFF`.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": -16 },
    "expectedRegisters": { "$t1": -1, "$t2": "0x0FFFFFFF" }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    sra $t1, $t0, 4     # the sign bit dragged along
    srl $t2, $t0, 4     # zeroes coming in at the top
```

</details>

The second one has one byte in memory holding `0xF0`. Leave it in `$t0` read as a signed number,
which is -16, and in `$t1` read as unsigned, which is 240.

```mips|playground|memory|exercise
.data
value:  .byte 0xF0

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": -16, "$t1": 240 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
value:  .byte 0xF0

.text
main:
    la $t2, value
    lb $t0, 0($t2)      # sign extended
    lbu $t1, 0($t2)     # zero filled
```

</details>
