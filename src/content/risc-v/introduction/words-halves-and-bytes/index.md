Memory is bytes and a register is 32 bits, and neither of them holds a number in the sense C means
it. What the bits mean is decided by the instruction that reads them, and on RISC-V that decision is
made twice: once by which of a signed and unsigned pair you picked, and once by how much of the
register the instruction touched.

## Three ways of writing a number

The assembler reads decimal, hexadecimal and a character literal. There is no `#` in front, since a
`#` starts a comment.

| written | base                  |
| ------- | --------------------- |
| `100`   | decimal               |
| `0x64`  | hexadecimal           |
| `'d'`   | the ASCII code of `d` |

All three of those are 100, and the last one because ASCII gives the letter `d` the code `0x64`.
There is **no binary literal**: `0b1100100` is a build error. Negative numbers take a minus sign.

The assembler also does no arithmetic. `li t0, 4*2` does not assemble, and neither does
`lw t0, numbers+8`, which the MIPS assembler would have taken: a label in an operand is the label
and nothing added to it, so eight bytes past `numbers` is an `la` and an offset your program works
out.

```riscv|playground
.text
main:
    li t0, 100          # decimal
    li t1, 0x64         # hexadecimal
    li t2, 'd'          # a character
    li t3, -1           # negative
    li t4, 2147483647   # the largest signed word
    li t5, -2147483648  # and the smallest
```

`t0`, `t1` and `t2` all come out at `00000064`. `t3` is `FFFFFFFF`, `t4` is `7FFFFFFF` and `t5` is
`80000000`.

## Byte, half, word

The three sizes have names, and RISC-V uses them in the names of its instructions:

- a **byte**, 1 byte, 8 bits, which `lb`, `lbu` and `sb` move.
- a **half**, 2 bytes, 16 bits, which `lh`, `lhu` and `sh` move.
- a **word**, 4 bytes, 32 bits, which `lw` and `sw` move, and which is the size of every register.

A word here is 4 bytes. On the M68K a word is 2 and the 4 byte size is called a long, so the same
word means two different things on the two machines, which is what to check whenever you read a
manual for a machine you do not know. The 64 bit form of RISC-V adds a fourth size, the
**doubleword**, and "Going 64-bit" is where it comes in.

Everything else on RISC-V is 32 bits and says nothing about size, because there is no arithmetic on
part of a register. `add`, `and`, `sll` and the rest read all 32 bits of their operands and write
all 32 bits of their destination. The only instructions that touch fewer are the loads and stores
above, because memory is where the smaller things live.

## The same bits, two readings

`FFFFFFFF` is 4294967295 read as an unsigned word and -1 read as a signed one, and nothing in the
register says which. The signed reading is **two's complement**: the top bit is the sign, and
negating a number means flipping every bit and adding 1.

Where the answer really is different, RISC-V gives you two instructions and you pick:

| signed | unsigned | what they differ about                     |
| ------ | -------- | ------------------------------------------ |
| `slt`  | `sltu`   | which of two registers is smaller          |
| `slti` | `sltiu`  | the same against a constant                |
| `blt`  | `bltu`   | the branch that asks the same question     |
| `lb`   | `lbu`    | what fills the 24 bits above a loaded byte |
| `lh`   | `lhu`    | the 16 bits above a loaded half            |
| `srai` | `srli`   | what comes in at the top of a right shift  |
| `div`  | `divu`   | division                                   |
| `rem`  | `remu`   | the remainder                              |
| `mulh` | `mulhu`  | the top half of a product                  |

```riscv|playground
.text
main:
    li t0, -1           # FFFFFFFF: -1 signed, 4294967295 unsigned
    li t1, 1
    slt t2, t0, t1      # is -1 less than 1? signed
    sltu t3, t0, t1     # is 4294967295 less than 1? unsigned
    li t4, -20
    srai t5, t4, 2      # -20 / 4, the sign dragged along
    srli t6, t4, 2      # the same bits, zeroes coming in
```

`t2` comes out at 1 and `t3` at 0, from the same two registers. `t5` is `FFFFFFFB`, which is -5, and
`t6` is `3FFFFFFB`, which is 1073741819. Two instructions, the same input bits, two right answers to
two different questions.

The registers panel has the same choice. The **B**, **W** and **L** buttons in its header cut each
register into bytes, halves or one word, and hovering a value shows its signed and unsigned readings
side by side.

## Sign extension

Copying a byte into a 32 bit register has to decide what goes in the 24 bits above it. `0xF0` as an
unsigned byte is 240, and as a signed byte it is -16, and as a word 240 is `000000F0` while -16 is
`FFFFFFF0`. **Sign extension** is filling the bits above with copies of the top bit, which is what
keeps a signed number the same number in a bigger box.

Three ways to ask for it. `lb` sign extends what it loads and `lbu` fills with zeroes, `lh` and
`lhu` do the same for a half, and `sext.b`, `sext.h`, `zext.b` and `zext.h` do it to a value already
in a register.

Then there is the constant inside an instruction, and this is where RISC-V and MIPS disagree
completely. **Every immediate on RISC-V is sign extended**, including the ones of `andi`, `ori` and
`xori`, where MIPS fills with zeroes. So `andi t1, t0, -1` keeps every bit of `t0`, and there is no
16 bit mask you can write as a constant, because the field only holds 12 bits anyway.

```riscv|playground|memory
.data
byte: .byte 0xF0
      .align 1
half: .half 0xFFFF

.text
main:
    la t0, byte
    lb t1, 0(t0)        # sign extended: FFFFFFF0
    lbu t2, 0(t0)       # zero filled: 000000F0
    la t3, half
    lh t4, 0(t3)        # FFFFFFFF
    lhu t5, 0(t3)       # 0000FFFF
    li s0, 0x1234F0
    sext.b s1, s0       # the low byte of a register, sign extended
    zext.b s2, s0       # and the same byte zero filled
    andi s3, s0, -1     # the constant is sign extended, so this keeps everything
```

`t1` is `FFFFFFF0` and `t2` is `000000F0`, the same byte in memory read twice. `s1` is `FFFFFFF0`
and `s2` is `000000F0`, the same pair done to a register. `s3` is `001234F0`, unchanged, because the
`-1` in the instruction became `FFFFFFFF` before the `and` happened.

`sext.b` and `zext.b` are pseudo-instructions: the first is a `slli` by 24 and a `srai` back, and
the second is `andi t2, t0, 0xFF`.

## How much of an instruction a constant gets

A RISC-V instruction is 32 bits and it has to name two registers and an operation, so there are 12
bits left for a constant. Signed, that is **-2048 to 2047**, and it is the whole range `addi`,
`andi`, `slti`, `jalr` and the load and store offsets have. Write anything outside it and the build
fails with `Unsigned value is too large to fit into a sign-extended immediate`.

A larger number takes two instructions. `lui` (load upper immediate) puts a **20 bit** constant in
the top of a register and clears the bottom 12, and an `addi` adds the rest.

`li` hides that. Give it a small number and you get one instruction, give it a large one and you get
two, and unlike the MIPS assembler it uses no scratch register: both instructions write the register
you named.

```riscv|playground
.text
main:
    li t0, 2047         # fits, so one addi
    li t1, 2048         # does not, so lui and addi
    li t2, 100000
    lui t3, 0x12345     # the top 20 bits, written by hand
    addi t3, t3, 0x678  # and the low 12 added in
```

`t1` comes out at `00000800`, `t2` at `000186A0`, which is 100000, and `t3` at `12345678`. Click on
the `li t1, 2048` line after building and the editor prints `lui t1, 1` and `addi t1, t1, -2048`
underneath, which is 4096 minus 2048: the `addi` sign extends, so the assembler adds one to the
`lui` half whenever the low 12 bits come out negative.

## Overflow

Add 1 to the largest signed word and the answer wraps round to the smallest. **RISC-V says nothing
about it.** There is no trapping add, there is no carry flag, and the base instruction set has no
overflow exception at all, so the program carries on with the wrapped answer.

```riscv|playground
.text
main:
    li t0, 0x7FFFFFFF   # the largest signed word
    add t1, t0, t0      # one past it twice over, wrapped
    li t2, -1
    add t3, t2, t2
    addi t4, t0, 1      # and the immediate form
```

`t1` comes out at `FFFFFFFE`, `t3` at `FFFFFFFE` as well, and `t4` at `80000000`, which read as
signed is the most negative word there is. This is where RISC-V and MIPS part company: MIPS has an
`add` that raises an arithmetic overflow exception and an `addu` that wraps, and RISC-V has one
`add`, which wraps.

So a program that needs to know whether an addition overflowed works it out from the answer, and
"Comparing without flags" is where that is written.

## Your turn

The test starts `t0` at -16, which the panel shows as `FFFFFFF0`. Divide it by 16 twice with shifts:
the signed answer in `t1`, which is -1, and the unsigned answer in `t2`, which is `0x0FFFFFFF`.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": -16 },
    "expectedRegisters": { "t1": -1, "t2": "0x0FFFFFFF" }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    srai t1, t0, 4      # the sign bit dragged along
    srli t2, t0, 4      # zeroes coming in at the top
```

</details>

The second one starts `t0` at `0x123456F0` and asks for its **lowest byte** on its own, twice: read
as a signed number in `t1`, which is -16, and as unsigned in `t2`, which is 240. The byte is already
in a register, so no load is involved.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": "0x123456F0" },
    "expectedRegisters": { "t1": -16, "t2": 240 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    sext.b t1, t0       # the low byte, sign extended
    zext.b t2, t0       # the same byte, zero filled
```

</details>
