Every program so far has been written in one shape, and this is it. A MIPS instruction is a
**mnemonic**, which is the short name of the operation, followed by up to three **operands**, which
are the things it works on. The first operand is the one that gets written.

```
    mnemonic destination, source, source
```

`add $t2, $t0, $t1` reads `$t0` and `$t1`, adds them, and writes `$t2`. Both sources come out
untouched, which means you can use a value twice without copying it first, and it means an
instruction never quietly destroys something you still wanted.

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

`$t4` and `$t5` are the pair to look at: 4 and `FFFFFFFC`, which is -4. Order matters for everything
that is not addition, and the rule is that the operands read left to right in the order you would
say the sum out loud. `sub $t4, $t0, $t1` is "`$t0` minus `$t1`".

## Why a constant runs out of room

Four things about MIPS look arbitrary until you know one fact, and then all four follow from it:

- there are 32 registers, not 16 and not 64;
- a constant between -32768 and 65535 costs one instruction and anything bigger costs two;
- `j` can reach a quarter of memory but not all of it;
- a branch reaches about 32 kilobytes forwards or backwards and no further.

The fact is that every MIPS instruction is exactly **32 bits** long. Not "up to" 32: exactly. The
chip fetches four bytes, and it already knows where the next instruction starts before it has worked
out what this one is.

Thirty two bits is not much to spend. Naming one register out of 32 costs 5 of them, and an
instruction like `add` names three registers, so 15 bits are gone before the operation has been
spelled out. There are three ways the bits get divided up:

| type | fields                                                       | used by                                           |
| ---- | ------------------------------------------------------------ | ------------------------------------------------- |
| R    | opcode 6, `rs` 5, `rt` 5, `rd` 5, shift amount 5, function 6 | three registers: `add`, `and`, `sll`              |
| I    | opcode 6, `rs` 5, `rt` 5, immediate 16                       | two registers and a constant: `addi`, `lw`, `beq` |
| J    | opcode 6, address 26                                         | `j` and `jal`                                     |

Now read the consequences back off it. An I-type has spent 6 bits on the operation and 10 on two
registers, so the constant gets the 16 that are left, and `li $t0, 100000` cannot possibly be one
instruction. A J-type has 26 bits for a destination, which is a word address rather than a byte
address, and the top four bits of the address come from wherever the program already is, so `j`
cannot leave its own 256 megabyte quarter of memory. A branch is an I-type, so it gets 16 bits, and
it spends them on a distance from the instruction after it rather than an address, which is what
buys it the 32 kilobytes in each direction.

You will never type any of these fields. They are worth five minutes because every "why can I not
just write..." question on this machine is answered by counting bits in that table.

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

`$t2` and `$t3` land on the same value from a constant shift and a register shift, which is the
whole difference the `v` makes. `$t6` is 0, and that is the line to think about: 16 and 1 have no
bit set in the same place, so anding them together leaves nothing.

## Pseudo-instructions

A good half of what you have been writing does not exist in the hardware. `li`, `la`, `move`, `blt`
and a dozen more are pseudo-instructions: names the assembler accepts and quietly turns into one or
more real ones, sometimes borrowing `$at` on the way.

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

`$s5` is the one that catches people out: it holds `00400000`, the address of `main`. A label on an
instruction is an address in exactly the same way a label on a `.word` is, and `la` will happily
hand you either.

The reason to know which lines are pseudo-instructions is that one line of source is not one line of
machine. A pseudo-instruction can take `$at` off you, it can cost four instructions where you
counted on one, and in the case of `rem` and three-operand `div` it can put a `break` in the middle
of your program to guard against dividing by zero. When any of that matters, write the real
instructions yourself.

## The delay slot

There is one piece of real MIPS behaviour this editor leaves out, and it is worth knowing about
because you will meet it the moment you read MIPS code written anywhere else.

A real MIPS chip starts fetching the instruction after a branch before it has worked out whether the
branch is taken. Rather than throw that fetch away, the architecture says the instruction runs
either way. That instruction is called the **branch delay slot**, and it is why printed MIPS from a
compiler has a `nop` sitting under so many of its jumps: there was nothing useful to put in the
slot, so the compiler put nothing.

This editor runs branches the way they read. The instruction under a jump does not run unless the
jump falls through to it.

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

`$t0` is 1 and `$t1` is 5, so neither line under a jump ran. On hardware with delay slots both would
have, and `$t0` would have finished at 99.

So write your branches as they read. If you go and read MIPS assembly out of a compiler or a
textbook, expect the instruction under a jump to belong to the jump.

## One to try

The test starts `$t0` at 5. Leave `$t0` times 8, plus 1, in `$t1`, using two instructions and no
`mul`.

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
