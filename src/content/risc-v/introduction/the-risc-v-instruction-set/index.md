Every program so far has been written in the same shape, and this is it: a RISC-V instruction is a
mnemonic and up to three operands, and the first of them is the one that gets written.

```
    mnemonic destination, source, source
```

`add t2, t0, t1` reads `t0` and `t1`, adds them and writes `t2`, leaving both sources exactly as
they were. Naming the destination separately is what lets you keep a value and use it at the same
time.

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

`t5` comes out at `FFFFFFFC`, which is -4: the order of the two sources matters for everything that
is not addition, and the first one is the one being subtracted from.

## A base and its extensions

RISC-V is not one instruction set, it is a small one with optional pieces bolted on, and each piece
has a letter. The base is **`I`**, the integer instructions, and RV32I is the whole of it: about
forty instructions, with no multiplication, no division and no floating point.

| letter  | what it adds                                                            | here |
| ------- | ----------------------------------------------------------------------- | ---- |
| `I`     | the base: arithmetic, logic, shifts, loads, stores, branches            | yes  |
| `M`     | `mul`, `mulh`, `div`, `rem` and their unsigned forms                    | yes  |
| `F`     | 32 bit floating point, the `f0` to `f31` registers                      | yes  |
| `D`     | 64 bit floating point                                                   | yes  |
| `Zicsr` | the instructions that reach the control registers                       | yes  |
| `A`     | read and write in one uninterruptible step, for more than one processor | no   |
| `C`     | 16 bit compressed forms of common instructions                          | no   |

So the machine this editor runs is **RV32IMFD** with the control registers, and a chip that only
implements RV32I would refuse the `mul` in your program. That is what the letters after the name of
a real RISC-V chip are telling you. Most of this course stays inside `I` and `M`; `F` and `D` get a lecture of their own later on.

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

There are six branches in the hardware and the assembler makes the rest out of them, since `a > b`
is `b < a` with the operands swapped. "Asking a question with a branch" is where they are taken
apart.

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

The two shifts of `t0` land on the same answer whether the amount was written into the instruction
or read out of a register. `t6` is 0, because 16 and 1 have no bit in common for the `and` to
keep.

There are only two letters ever glued onto an instruction name. An `i` on the end means
**immediate**, a constant written into the instruction where the plain form would read a second
register. A `u` means the operands are read as unsigned numbers. That is the whole naming scheme:
`sltiu` is "set less than, immediate, unsigned" and there is nothing else to decode.

## Shorthands the assembler expands

`li`, `la`, `mv`, `ret`, `call`, `j` and `bgt` are not instructions the processor has. They are
**pseudo-instructions**: names the assembler accepts and quietly replaces with one or more real
ones. Most of them turn out to be an ordinary instruction with `zero` in one operand.

The registers lecture listed the ones built on `zero`, `mv` and `neg` and `j` and `ret` among them.
These are the rest, the ones that either cost more than one instruction or swap their operands
round:

| you write           | what the assembler makes of it         |
| ------------------- | -------------------------------------- |
| `not t1, t0`        | `xori t1, t0, -1`                      |
| `li t0, 100000`     | `lui t0, 24` and `addi t0, t0, 0x6a0`  |
| `la t0, label`      | `auipc t0, ...` and `addi t0, t0, ...` |
| `call label`        | `auipc t1, ...` and `jalr ra, t1, ...` |
| `bgt t0, t1, label` | `blt t1, t0, label`                    |
| `ble t0, t1, label` | `bge t1, t0, label`                    |

The one to remember is **`ret`, which is `jalr zero, ra, 0`**: jump to the address held in `ra`, and
write the new return address into `zero`, which is to say throw it away, because a return has
nowhere to come back from.

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
