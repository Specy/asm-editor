Every program so far has been written in the same shape, and this is it: a MIPS instruction is a
mnemonic and up to three operands, and the first of them is the one that gets written.

```
    mnemonic destination, source, source
```

`add $t2, $t0, $t1` reads `$t0` and `$t1`, adds them and writes `$t2`, leaving both sources as they
were. That is the difference from the M68K, where `add.l d1, d0` has to overwrite `d0` because there
are only two operands and one of them is the destination.

```mips|playground
.text
main:
    li $t0, 7
    li $t1, 3
    add $t2, $t0, $t1       # a register on the right
    addi $t3, $t0, 3        # a constant on the right
    sub $t4, $t0, $t1       # source minus source, in that order
    sub $t5, $t1, $t0       # and the other way round
```

`$t2` and `$t3` both come out at 10, `$t4` at 4 and `$t5` at `FFFFFFFC`, which is -4. The order of the
two sources matters for everything that is not addition, and the rule is the same one C uses: the
operand you read first is the one being subtracted from.

## Three encodings, all four bytes

Every MIPS instruction is exactly **32 bits**, which is the whole point of the design: the CPU knows
where the next instruction begins before it has finished decoding this one. Those 32 bits are laid
out in one of three ways.

| type | fields                                                       | what it is for                                    |
| ---- | ------------------------------------------------------------ | ------------------------------------------------- |
| R    | opcode 6, `rs` 5, `rt` 5, `rd` 5, shift amount 5, function 6 | three registers: `add`, `and`, `sll`              |
| I    | opcode 6, `rs` 5, `rt` 5, immediate 16                       | two registers and a constant: `addi`, `lw`, `beq` |
| J    | opcode 6, address 26                                         | `j` and `jal`                                     |

Five bits name a register, which is why there are exactly 32 of them and no more. Sixteen bits hold a
constant, which is why a number outside -32768 to 65535 takes two instructions. And 26 bits hold a
jump target as a word address, which the CPU pastes under the top four bits of the program counter,
so `j` can reach anywhere in the same 256 megabyte quarter of memory and no further. A branch is an
I-type, so its 16 bit field is a distance in words from the instruction after it, which reaches about
32 kilobytes either way.

None of that is something you write. It decides what the assembler can and cannot do for you, which
is the rest of this page.

## The families

About sixty real instructions, in seven groups.

| what it does           | the instructions                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------ |
| arithmetic             | `add`, `addu`, `addi`, `addiu`, `sub`, `subu`, `mult`, `multu`, `mul`, `div`, `divu` |
| move to and from hi/lo | `mfhi`, `mflo`, `mthi`, `mtlo`                                                       |
| logic                  | `and`, `or`, `xor`, `nor`, `andi`, `ori`, `xori`, `lui`                              |
| shifts                 | `sll`, `srl`, `sra`, `sllv`, `srlv`, `srav`                                          |
| compare                | `slt`, `sltu`, `slti`, `sltiu`                                                       |
| memory                 | `lw`, `lh`, `lhu`, `lb`, `lbu`, `sw`, `sh`, `sb`                                     |
| go somewhere else      | `beq`, `bne`, `bgez`, `bgtz`, `blez`, `bltz`, `j`, `jr`, `jal`, `jalr`               |

`syscall`, `break`, `mfc0`, `mtc0` and `eret` are the ones left over, and all five belong to the
outside-world module. The whole list, with what each instruction reads and writes, is on the
[MIPS documentation pages](/documentation/mips).

## The letters on the end

A MIPS mnemonic is a base name with letters glued on, and there are only four of them to learn.

- **`u`, unsigned.** On `add`, `sub` and `addi` it means "do not trap on overflow", which is what
  nearly all code wants. On `slt`, `div`, `mult` and the loads it means the operands are read as
  unsigned numbers. Two different meanings for one letter, and the family it is on tells you which.
- **`i`, immediate.** `addi`, `andi`, `ori`, `xori`, `slti` take a constant where the plain form takes
  a register. `addiu` is both letters at once.
- **`v`, variable.** `sllv`, `srlv` and `srav` take the shift amount from a register instead of from
  the five bit field, so a program can shift by an amount it worked out.
- **`b`, `h`, `w`** on a load or a store, the size, with `u` after it on `lbu` and `lhu`.

```mips|playground
.text
main:
    li $t0, 1
    li $t1, 4
    sll $t2, $t0, 4         # a constant shift amount
    sllv $t3, $t0, $t1      # the same shift, from a register
    srl $t4, $t2, 2
    srlv $t5, $t2, $t1
    and $t6, $t2, $t0       # register and register
    andi $t7, $t2, 0xFF     # register and constant
```

`$t2` and `$t3` both come out at `00000010`, which is 16, `$t4` at 4 and `$t5` at 1. `$t6` is 0,
because 16 and 1 have no bit in common, and `$t7` is 16.

## Instructions that are not instructions

Half of what you have been writing does not exist in the hardware. `li`, `la`, `move`, `blt` and a
dozen more are **pseudo-instructions**: names the assembler accepts and turns into one or more real
ones, sometimes using `$at` to do it.

| you write             | what the assembler makes of it                                      |
| --------------------- | ------------------------------------------------------------------- |
| `move $t1, $t0`       | `addu $t1, $zero, $t0`                                              |
| `not $t1, $t0`        | `nor $t1, $t0, $zero`                                               |
| `neg $t1, $t0`        | `sub $t1, $zero, $t0`                                               |
| `li $t0, 5`           | `addiu $t0, $zero, 5`, one instruction while the number is small    |
| `li $t0, 100000`      | `lui $at, 0x1` and `ori $t0, $at, 0x86a0`                           |
| `la $t0, label`       | `lui $at, ...` and `ori $t0, $at, ...`                              |
| `b label`             | `beq $zero, $zero, label`                                           |
| `beqz $t0, label`     | `beq $t0, $zero, label`                                             |
| `blt $t0, $t1, label` | `slt $at, $t0, $t1` and `bne $at, $zero, label`                     |
| `rem $t2, $t0, $t1`   | a `bne` and a `break` that check the divisor, then `div` and `mfhi` |
| `abs $t1, $t0`        | `sra $at, $t0, 31`, `xor`, `subu`                                   |
| `nop`                 | `sll $zero, $zero, 0`, which writes nothing                         |

`add`, `sub`, `mul`, `sll`, `lw`, `sw`, `beq`, `bne`, `j`, `jal` and `jr` are real. `blt`, `bgt`,
`ble`, `bge` and their `u` forms are not, and neither are `div` and `rem` when you write them with
three operands.

Build this one, then click on a line: the editor prints the instructions it was assembled into
underneath, and only lines that became more than one get a note.

```mips|playground
.text
main:
    li $t0, 5
    li $t1, 10
    blt $t0, $t1, less      # two instructions, and $at
    li $s0, 99              # jumped over
less:
    move $s1, $t0           # one instruction
    li $s2, 100000          # two instructions, and $at
    mul $s3, $t0, $t1       # one, this one is real
    rem $s4, $t1, $t0       # four
    la $s5, main            # two, and $at
```

`$s0` stays 0 because the branch was taken, `$s1` is 5, `$s2` is `000186A0`, `$s3` is 50, `$s4` is 0
(10 divided by 5 leaves nothing) and `$s5` is `00400000`, the address of `main`, because a label on
an instruction is an address like any other.

Why care which is which. Three reasons: a pseudo-instruction can cost you `$at`, it can cost you four
instructions where you thought you were writing one, and it can put a `break` in the middle of your
program, which is what the guard on `rem` and three-operand `div` is. When any of that matters, write
the real instructions.

## The delay slot this simulator does not have

A real MIPS chip starts fetching the instruction after a branch before it knows whether the branch is
taken, and the architecture says that instruction runs either way, so the fetch is never wasted.
That instruction is the **branch delay slot**, and it is why printed MIPS code from a compiler has a
`nop` after so many of its jumps: there was nothing useful to put there.

This simulator does not do it. MARS has the behaviour as a setting, it is off by default, and that is
what this editor runs.

```mips|playground
.text
main:
    li $t0, 1
    j skip
    li $t0, 99          # a real chip would run this. Here it does not
skip:
    li $t1, 5
    beq $zero, $zero, done
    li $t1, 77          # nor this
done:
    li $t2, 7
```

`$t0` comes out at 1 and `$t1` at 5, so neither line under a jump ran. On hardware with delay slots
both of them would have, and `$t0` would be 99.

So write your branches as they read, and put nothing after them that you do not mean. If you go and
read real MIPS assembly, from a compiler or a textbook, expect the instruction under a jump to belong
to the jump.

## Your turn

The test starts `$t0` at 5. Leave `$t0` times 8, plus 1, in `$t1`, in two instructions and without
`mul`. It comes out at 41.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": 5 },
    "expectedRegisters": { "$t1": 41 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    sll $t1, $t0, 3     # three places left is eight times
    addi $t1, $t1, 1
```

</details>

The second one wants `0x00A50000` in `$t0` with `$at` left at 0, which rules out `li`: it would put
the top half of that number in `$at` on the way. One real instruction does it.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": "0x00A50000", "$at": 0 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    lui $t0, 0xA5       # the top 16 bits, and zeroes under them
```

</details>
