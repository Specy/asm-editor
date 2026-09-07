Memory is bytes and a register is 32 bits, and neither of them holds a number in the sense C means
it. What the bits mean is decided by the instruction that reads them, and on MIPS that decision is
made twice: once by which of a signed and unsigned pair you picked, and once by how much of the
register the instruction touched.

## Three ways of writing a number

The assembler reads decimal, hexadecimal and a character literal. There is no `#` in front: an
operand made of digits is a number and an operand beginning with `$` is a register.

| written | base                  |
| ------- | --------------------- |
| `100`   | decimal               |
| `0x64`  | hexadecimal           |
| `'d'`   | the ASCII code of `d` |

All three of those are 100, and the last one because ASCII gives the letter `d` the code `0x64`.
There is **no binary literal**: `0b1100100` is a build error. Negative numbers take a minus sign.

The assembler also does no arithmetic. `li $t0, 4*2` does not assemble, and `.word 2+3` writes two
words, a 2 and a 3, because the `+` separates them rather than adding them. The one place a sum is
allowed is an address, where `lw $t0, numbers+8` means eight bytes past the label.

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

`$t0`, `$t1` and `$t2` all come out at `00000064`. `$t3` is `FFFFFFFF`, `$t4` is `7FFFFFFF` and
`$t5` is `80000000`.

## Byte, half, word

The three sizes have names, and MIPS uses them in the names of its instructions:

- a **byte**, 1 byte, 8 bits, which `lb`, `lbu` and `sb` move.
- a **half**, 2 bytes, 16 bits, which `lh`, `lhu` and `sh` move.
- a **word**, 4 bytes, 32 bits, which `lw` and `sw` move, and which is the size of every register.

A word here is 4 bytes. On the M68K a word is 2 and the 4 byte size is called a long, so the same
word means two different things on the two machines, which is worth checking whenever you read a
manual for a machine you do not know.

Everything else on MIPS is 32 bits and says nothing about size, because there is no arithmetic on
part of a register. `add`, `and`, `sll` and the rest read all 32 bits of their operands and write all
32 bits of their destination. The only instructions that touch fewer are the loads and stores above,
because memory is where the smaller things live.

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

`$t2` comes out at 1 and `$t3` at 0, from the same two registers. `$t5` is `FFFFFFFB`, which is -5,
and `$t6` is `3FFFFFFB`, which is 1073741819. Two instructions, the same input bits, two right
answers to two different questions.

The registers panel has the same choice. The **B**, **W** and **L** buttons in its header cut each
register into bytes, halves or one word, and hovering a value shows its signed and unsigned readings
side by side.

## Sign extension

Copying a byte into a 32 bit register has to decide what goes in the 24 bits above it. `0xF0` as an
unsigned byte is 240, and as a signed byte it is -16, and as a word 240 is `000000F0` while -16 is
`FFFFFFF0`. **Sign extension** is filling the bits above with copies of the top bit, which is what
keeps a signed number the same number in a bigger box.

MIPS does not have an instruction for it, it has a pair of loads: `lb` sign extends and `lbu` fills
with zeroes, and `lh` and `lhu` do the same for a half.

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

`$t1` is `FFFFFFF0` and `$t2` is `000000F0`, the same byte in memory read twice. `$t6` is
`FFFFFFFF`, `$t7` is `0000FFFF`, and `$t8` is `0000FFFF`: the `andi` masked -1 down to its low half
because its own constant had zeroes above it.

`addiu` is the confusing name of the group. The `u` says the instruction does not trap on overflow;
it does **not** mean the constant is unsigned, and `addiu $t0, $zero, -1` really does put `FFFFFFFF`
in `$t0`.

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

`$t1` comes out at `000186A0`, which is 100000, `$t2` at `00010000`, which is the `lui` half of it
sitting in `$at`, and `$t3` at `12345678`. Click on the `li $t1, 100000` line after building and the
editor prints the two instructions it became underneath.

## Overflow

Add 1 to the largest signed word and the answer wraps round to the smallest. MIPS gives you two
opinions about that, one instruction each:

- **`add`, `addi` and `sub`** raise an **arithmetic overflow** exception when the true answer does
  not fit in a signed 32 bit word. Nothing is written, and the run ends with
  `Runtime exception at ...: arithmetic overflow` unless the program installed a handler.
- **`addu`, `addiu` and `subu`** never do. The answer wraps and the program carries on, which is what
  C does and what nearly all real MIPS code uses.

```mips|playground
.text
main:
    li $t0, 0x7FFFFFFF      # the largest signed word
    addu $t1, $t0, $t0      # one past it twice over, wrapped
    li $t2, -1
    addu $t3, $t2, $t2
    addiu $t4, $t0, 1       # and the immediate form
```

`$t1` comes out at `FFFFFFFE`, `$t3` at `FFFFFFFE` as well, and `$t4` at `80000000`, which read as
signed is the most negative word there is. Change `addu $t1, $t0, $t0` to `add $t1, $t0, $t0` and
press Run: the program stops on that line and the message says `arithmetic overflow`.

There is no flag left behind either way. A program that wants to know whether an unsigned addition
carried has to work it out, usually by comparing the answer with one of the operands, and that is the
subject of "Comparing without flags".

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
