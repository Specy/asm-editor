Every program so far has been written in the same shape, and this is it: a RISC-V instruction is a
mnemonic and up to three operands, and the first of them is the one that gets written.

```
    mnemonic destination, source, source
```

`add t2, t0, t1` reads `t0` and `t1`, adds them and writes `t2`, leaving both sources as they were.
That is the difference from the M68K, where `add.l d1, d0` has to overwrite `d0` because there are
only two operands and one of them is the destination.

```riscv|playground
.text
main:
    li t0, 7
    li t1, 3
    add t2, t0, t1      # a register on the right
    addi t3, t0, 3      # a constant on the right
    sub t4, t0, t1      # source minus source, in that order
    sub t5, t1, t0      # and the other way round
```

`t2` and `t3` both come out at 10, `t4` at 4 and `t5` at `FFFFFFFC`, which is -4. The order of the
two sources matters for everything that is not addition, and the rule is the same one C uses: the
operand you read first is the one being subtracted from.

## A base and its extensions

RISC-V is not one instruction set, it is a small one with optional pieces bolted on, and each piece
has a letter. The base is **`I`**, the integer instructions, and RV32I is the whole of it: about
forty instructions, with no multiplication, no division and no floating point.

| letter  | what it adds                                                 | in this editor |
| ------- | ------------------------------------------------------------ | -------------- |
| `I`     | the base: arithmetic, logic, shifts, loads, stores, branches | yes            |
| `M`     | `mul`, `mulh`, `div`, `rem` and their unsigned forms         | yes            |
| `F`     | 32 bit floating point, the `f0` to `f31` registers           | yes            |
| `D`     | 64 bit floating point                                        | yes            |
| `Zicsr` | `csrrw` and the rest, which reach the control registers      | yes            |
| `A`     | atomic read-modify-write, for more than one processor        | no             |
| `C`     | 16 bit compressed forms of common instructions               | no             |

So the machine this editor runs is **RV32IMFD** with the control registers, and a chip that only
implements RV32I would refuse the `mul` in your program. That is what the letters after the name of
a real RISC-V chip are telling you. This course uses `I`, `M` and, in the last lecture, the control
registers; the floating point registers are there in the Core and no page here uses them.

The names of the two 64 bit variants work the same way, so RV64I is the base with 64 bit registers
and RV64IM adds multiplication to it. "Going 64-bit" is the lecture.

## Six encodings, all four bytes

Every RISC-V instruction is exactly **32 bits**, which is the point of the design: the CPU knows
where the next instruction begins before it has finished decoding this one. Those 32 bits are laid
out in one of six ways, and which one an instruction uses is decided by how many registers it names
and how big a constant it carries.

| type | what it holds                              | examples             |
| ---- | ------------------------------------------ | -------------------- |
| R    | three registers                            | `add`, `sll`, `mul`  |
| I    | two registers and a 12 bit signed constant | `addi`, `lw`, `jalr` |
| S    | two registers and a 12 bit constant        | `sw`, `sb`           |
| B    | two registers and a 13 bit branch distance | `beq`, `blt`         |
| U    | one register and a 20 bit constant         | `lui`, `auipc`       |
| J    | one register and a 21 bit jump distance    | `jal`                |

Five bits name a register, which is why there are exactly 32 of them and no more. Twelve bits hold
the constant of an `addi` or the offset of a `lw`, which is why those run from -2048 to 2047.

The two odd ones are S and B, which are I and R with the constant chopped up and put in different
places. That looks arbitrary until you notice what it buys: the register fields sit at the same bit
positions in **every** format, so the CPU can start reading the two registers before it knows what
kind of instruction it is holding.

The distances are what limit where you can jump. A branch carries 13 bits, so it reaches about 4
kilobytes either way, and past that the build fails with
`Branch target word address beyond 12-bit range`. A `jal` carries 21 bits and reaches about a
megabyte, which in a program you write here is everywhere.

## The families

About fifty instructions in the base and the M extension, in six groups.

| what it does      | the instructions                                                          |
| ----------------- | ------------------------------------------------------------------------- |
| arithmetic        | `add`, `addi`, `sub`, `lui`, `auipc`, `mul`, `mulh`, `div`, `divu`, `rem` |
| logic             | `and`, `or`, `xor`, `andi`, `ori`, `xori`                                 |
| shifts            | `sll`, `srl`, `sra`, `slli`, `srli`, `srai`                               |
| compare           | `slt`, `sltu`, `slti`, `sltiu`                                            |
| memory            | `lw`, `lh`, `lhu`, `lb`, `lbu`, `sw`, `sh`, `sb`                          |
| go somewhere else | `beq`, `bne`, `blt`, `bge`, `bltu`, `bgeu`, `jal`, `jalr`                 |

`ecall`, `ebreak`, `csrrw` and its family, `uret` and `fence` are the ones left over, and they all
belong to the outside-world module. The whole list, with what each instruction reads and writes, is
on the [RISC-V documentation pages](/documentation/risc-v).

Six branches and no more. There is no `bgt` and no `ble` in the hardware, because `a > b` is `b < a`
with the operands swapped, and the assembler does the swapping. "Comparing without flags" is where
that is taken apart.

```riscv|playground
.text
main:
    li t0, 1
    li t1, 4
    slli t2, t0, 4      # a constant shift amount
    sll t3, t0, t1      # the same shift, from a register
    srli t4, t2, 2
    srl t5, t2, t1
    and t6, t2, t0      # register and register
    andi s0, t2, 0xFF   # register and constant
```

`t2` and `t3` both come out at `00000010`, which is 16, `t4` at 4 and `t5` at 1. `t6` is 0, because
16 and 1 have no bit in common, and `s0` is 16.

The `i` on the end of a mnemonic means **immediate**, a constant where the plain form takes a
register, and it is the only letter glued onto a RISC-V name apart from the `u` of `sltu`, `divu`,
`lbu` and `bltu`, which says the operands are read as unsigned numbers. That is the whole naming
scheme, which is a smaller thing to learn than the M68K's sizes or the MIPS `u` that means two
different things.

## Instructions that are not instructions

`li`, `la`, `mv`, `ret`, `call`, `j`, `bgt` and about thirty more are **pseudo-instructions**: names
the assembler accepts and turns into one or more real ones. Most of them are one real instruction
with `zero` in an operand, which "The 32 registers and their names" listed.

| you write           | what the assembler makes of it         |
| ------------------- | -------------------------------------- |
| `mv t1, t0`         | `add t1, zero, t0`                     |
| `not t1, t0`        | `xori t1, t0, -1`                      |
| `neg t1, t0`        | `sub t1, zero, t0`                     |
| `li t0, 5`          | `addi t0, zero, 5`                     |
| `li t0, 100000`     | `lui t0, 24` and `addi t0, t0, 0x6a0`  |
| `la t0, label`      | `auipc t0, ...` and `addi t0, t0, ...` |
| `j label`           | `jal zero, label`                      |
| `ret`               | `jalr zero, ra, 0`                     |
| `jal label`         | `jal ra, label`                        |
| `call label`        | `auipc t1, ...` and `jalr ra, t1, ...` |
| `bgt t0, t1, label` | `blt t1, t0, label`                    |
| `ble t0, t1, label` | `bge t1, t0, label`                    |
| `nop`               | `addi zero, zero, 0`                   |

Two of those are the ones to remember. **`ret` is `jalr zero, ra, 0`**: jump to the address in `ra`
and throw the return address away, since a return has nowhere to come back from. And `bgt` and its
three friends are **one** real instruction each, where the MIPS assembler needs two and a scratch
register, because RISC-V has branches that compare two registers directly.

```riscv|playground
.text
.globl main
main:
    li t0, 5
    li t1, 10
    blt t0, t1, less    # one instruction, and no register borrowed
    li s0, 99           # jumped over
less:
    mv s1, t0           # one instruction
    li s2, 100000       # two, and both write s2
    mul s3, t0, t1      # one, and this one is real
    rem s4, t1, t0      # also real, from the M extension
    la s5, main         # two
    li a7, 10
    ecall
```

`s0` stays 0 because the branch was taken, `s1` is 5, `s2` is `000186A0`, `s3` is 50, `s4` is 0 (10
divided by 5 leaves nothing) and `s5` is `00400000`, the address of `main`, because a label on an
instruction is an address like any other.

Build it and click on a line: the editor prints the instructions it was assembled into underneath,
and only lines that became more than one get a note. The reason to know which is which is that a
pseudo-instruction can cost you two instructions where you thought you were writing one, and `call`
can cost you `t1`.

## No delay slot

A MIPS chip runs the instruction after a jump whether or not the jump was taken, and printed MIPS
code is full of `nop`s under its branches because of it. **RISC-V has no delay slot.** The
architecture never had one, so a jump goes where it says and the line under it does not run.

```riscv|playground
.text
main:
    li t0, 1
    j skip
    li t0, 99           # never runs
skip:
    li t1, 5
    beq zero, zero, done
    li t1, 77           # nor this
done:
    li t2, 7
```

`t0` comes out at 1, `t1` at 5 and `t2` at 7. Write your branches as they read, and put nothing
under them that you do not mean.

## Your turn

The test starts `t0` at 5. Leave `t0` times 8, plus 1, in `t1`, in two instructions and without
`mul`. It comes out at 41.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": 5 },
    "expectedRegisters": { "t1": 41 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    slli t1, t0, 3      # three places left is eight times
    addi t1, t1, 1
```

</details>

The second one has a subroutine that doubles `a0` and then falls off the end of the program instead
of returning. Give it its return, written as the **real instruction** `ret` stands for, so that
`s0` comes out at 14.

```riscv|playground|exercise
.text
.globl main
main:
    li a0, 7
    jal doubled
    mv s0, a0
    li a7, 10
    ecall

doubled:
    add a0, a0, a0
    # your code here
```

```testcase
{
    "expectedRegisters": { "s0": 14 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
.globl main
main:
    li a0, 7
    jal doubled
    mv s0, a0
    li a7, 10
    ecall

doubled:
    add a0, a0, a0
    jalr zero, ra, 0    # jump to ra and keep no return address
```

</details>
