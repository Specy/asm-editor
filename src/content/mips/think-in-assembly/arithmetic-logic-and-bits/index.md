`add` and `sub` behave exactly as they look. Multiplication and division are the two that need a
page, and for a reason worth stating up front: neither of them fits the usual shape of an
instruction. Multiply two 32 bit numbers and the answer can need 64 bits, which is two registers.
Divide two numbers and you get **two** answers, a quotient and a remainder, and both of them are
usually wanted.

## hi and lo

`mult $t0, $t1` multiplies the two registers and writes the 64 bit product into **`hi` and `lo`**,
two registers that sit outside the 32 and that no other instruction reads. The top half goes in `hi`,
the bottom half in `lo`, and `mfhi` and `mflo` (move from hi, move from lo) copy them into a register
you name.

`div $t0, $t1` divides and writes both answers the same way: the **quotient in `lo`** and the
**remainder in `hi`**.

```mips|playground
.text
main:
    li $t0, 100000
    li $t1, 100000
    mult $t0, $t1           # 10000000000, which needs 34 bits
    mfhi $t2                # the top half
    mflo $t3                # the bottom half
    li $t4, 1000
    li $t5, 7
    div $t4, $t5            # 1000 / 7 and 1000 % 7 at once
    mflo $t6                # the quotient
    mfhi $t7                # the remainder
```

100000 times 100000 is ten billion, which does not fit in 32 bits, and the machine did not lose it:
`$t2` holds 2 and `$t3` holds `540BE400`, and those two halves side by side are the answer. The
division came out at 142 remainder 6, which checks out, since 7 times 142 is 994 and 6 more makes 1000.

`hi` and `lo` are at the bottom of the registers panel next to `pc`. They hold whatever the last
`mult` or `div` put there and nothing tidies them up, so read them out **before** the next one runs.
A `mult` sitting between your `div` and your `mflo` quietly throws the quotient away, and the
program that does this is usually one where somebody added a line in the middle later on.

Most of the time you do not want any of this, because most products fit in 32 bits. `mul $t2, $t0,
$t1` is a real instruction in the ordinary three operand shape: it writes the low 32 bits of the
product straight into the register you name. Write that one unless you have a reason not to.

## Dividing by zero

The real `div $t0, $t1` with a zero in `$t1` carries straight on. It does not stop the program, it
raises nothing, and it leaves `hi` and `lo` exactly as they were, so the `mflo` on the next line
hands you a leftover from some earlier calculation. That is the worst kind of bug: a plausible
number, from the wrong sum, with no warning anywhere.

The three operand forms `div $t2, $t0, $t1` and `rem $t2, $t0, $t1` are pseudo-instructions that
guard it for you. Each becomes a `bne` testing the divisor, a `break` for when it is zero, and then
the real `div` with an `mflo` or an `mfhi`.

```mips|playground
.text
main:
    li $t0, 1000
    li $t1, 7
    div $t2, $t0, $t1       # four instructions, quotient in $t2
    rem $t3, $t0, $t1       # four more, remainder in $t3
    mul $t4, $t0, $t1       # one instruction, the low half of the product
```

Click on the `div` line after building and the editor prints the four instructions it became.

Now change `li $t1, 7` to `li $t1, 0` and press Run. The program stops on the `div` line with
`break instruction executed; no code given.`, which is the guard firing. Then try the same zero with
the two operand `div $t0, $t1` and watch it go by in silence. Either let the pseudo-instruction stop
you, or test the divisor yourself before writing the real one.

There is one more pair worth knowing about here. Adding up a long list of products, which is what
multiplying matrices and filtering a signal both come down to, would otherwise need an `mflo` and an
`add` after every single multiply. `madd $t0, $t1` multiplies and **adds the product into** `hi` and
`lo` where they stand, and `msub` subtracts it, so the running total lives in the pair and comes out
once at the end.

## Logic and masks

`and`, `or`, `xor` and `nor` work one bit position at a time, with nothing carried between
positions, which is what makes them different from arithmetic. Bit 7 of the answer depends on bit 7
of each operand and on nothing else. The `i` forms take a constant instead of a second register:
`andi`, `ori`, `xori`.

`nor` looks like the odd one out until you notice `nor $t1, $t0, $zero` flips every bit of `$t0`,
which is why the assembler lets you spell that `not $t1, $t0`.

A **mask** is a number written for the pattern of its bits, and each of the operations does one of
the things you can want with one:

- `and` with a mask **keeps** the bits the mask has set and clears the rest.
- `or` with a mask **sets** those bits.
- `xor` with a mask **flips** them.
- clearing a bit takes `and` with the mask's complement, which MIPS makes you build: `nor` the mask
  with `$zero` and then `and`, or write the complement out with `li`.

The constant of `andi`, `ori` and `xori` is 16 bits **zero extended**, so it can only reach the low
half of a register. A mask that touches the top half has to go into a register first with `li`.

```mips|playground
.text
main:
    li $t0, 0x12345678
    andi $t1, $t0, 0xFF00   # keep the second byte
    srl $t1, $t1, 8         # and slide it down to the bottom
    srl $t2, $t0, 16        # or slide first
    andi $t2, $t2, 0xFF     # and mask after
    li $t3, 0x00AB
    li $t4, 0x00CD
    sll $t5, $t3, 8         # make room for a byte under $t3
    or $t5, $t5, $t4        # and drop $t4 into it
    ori $t6, $t0, 0xFF      # set the low byte
    xori $t7, $t0, 0xFF     # flip it
    li $t8, 0xFFFFFF00      # a mask too wide for andi
    and $t9, $t0, $t8       # so it goes through a register
```

Follow one value through. `$t0` is `12345678`, four bytes packed into a word. The `andi` keeps the
`56` and wipes everything else, and the `srl` slides it down so it sits in the register as the plain
number `0x56`. The next two lines get `34` out the other way round, sliding first and masking after,
and both orders work.

Going the other way, `$t5` shows two separate bytes being packed: `sll` makes room, `or` drops the
second one into the gap.

| after                   | holds      | what happened                     |
| ----------------------- | ---------- | --------------------------------- |
| `li $t0, 0x12345678`    | `12345678` | four bytes packed in one register |
| `andi $t1, $t0, 0xFF00` | `00005600` | every byte but that one wiped out |
| `srl $t1, $t1, 8`       | `00000056` | slid down, now a plain number     |

Mask and shift down to read a field out, shift up and `or` to put one back. That pair takes apart
every packed value on this machine, including the colour of a pixel on the bitmap display, which is
red, green and blue packed into three bytes of one word.

## Shifts

Three shifts, each with a form that takes the amount from a register:

- **`sll`, `sllv`**, shift left, zeroes coming in at the bottom. Shifting left by `n` multiplies by 2
  to the `n`.
- **`srl`, `srlv`**, shift right logical, zeroes coming in at the top, which divides an **unsigned**
  number.
- **`sra`, `srav`**, shift right arithmetic, copies of the sign bit coming in at the top, which
  divides a **signed** number.

The constant amount is five bits, so 0 to 31, and the register forms use the low five bits of the
register and ignore the rest.

```mips|playground
.text
main:
    li $t0, 1
    li $t1, 20
    sllv $t2, $t0, $t1      # a shift amount worked out by the program
    li $t3, 0xFF
    sll $t4, $t3, 8
    li $t5, -20
    sra $t6, $t5, 2         # signed: -20 / 4
    srl $t7, $t5, 2         # the same bits, unsigned
    li $t8, 0x80000001
    ror $t9, $t8, 1         # a rotate, which is three instructions
```

`$t6` and `$t7` are the pair to compare: the same bits shifted right by the same amount, and one
answered -5 while the other answered a number over a billion. `sra` dragged the sign bit along and
`srl` did not.

`$t9` is `C0000000`. A **rotate** is a shift where the bits that fall off one end come back in at
the other, so the 1 at the bottom of `80000001` came round to the top and joined the one already
there. `rol` and `ror` are pseudo-instructions built from a shift each way and an `or`, so they cost
three instructions and `$at`.

## One bit at a time

Everything you do to a single bit is one of the four operations above with a constant that has just
that one bit in it. To test bit `n`, `andi` with that constant and branch on whether the answer came
out zero. To set it, `ori`. To flip it, `xori`. To clear it, `and` with the complement. When `n` is
worked out while the program runs, `srlv` brings that bit down to the bottom and `andi $t1, $t1, 1`
keeps it.

Counting all the set bits in a word is that idea wrapped in a loop:

```mips|playground
.text
main:
    li $t0, 0xF0F0F0F0
    li $t1, 0               # count = 0
    li $t2, 32              # bits left
loop:
    andi $t3, $t0, 1        # the lowest bit
    add $t1, $t1, $t3       # add it, since it is 0 or 1
    srl $t0, $t0, 1         # and bring the next one down
    addi $t2, $t2, -1
    bnez $t2, loop
```

`$t1` is 16 and `$t0` is 0: the word was shifted away entirely, one bit at a time, and the count is
what is left over. The line doing the counting is `add $t1, $t1, $t3`, and there is no branch in it
anywhere, because the bit is already either 0 or 1 and adding it is the same as counting it when set.

For one particular question there is an instruction that answers in a single step. `clz $t1, $t0`
counts the **leading zeroes**: how many 0 bits there are at the top of `$t0` before the first 1.
Subtract that from 32 and you have the position of the highest set bit, which is how a program finds
the largest power of two that fits inside a number, or how many bits a value actually needs. `clo`
is the same count for leading ones.

## Your turn

The test starts `$t0` at 1000. Divide it by 7 and leave the quotient in `$t1`, which is 142, and the
remainder in `$t2`, which is 6.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": 1000 },
    "expectedRegisters": { "$t1": 142, "$t2": 6 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t3, 7
    div $t0, $t3        # the real instruction: lo and hi
    mflo $t1            # the quotient
    mfhi $t2            # the remainder
```

</details>

The second one starts `$t0` at `0xF0F0F0F0` and wants the number of bits set in it left in `$t1`,
which is 16. `$t0` may be destroyed on the way.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": "0xF0F0F0F0" },
    "expectedRegisters": { "$t1": 16 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t1, 0           # count = 0
    li $t2, 32          # bits left
loop:
    andi $t3, $t0, 1    # the lowest bit
    add $t1, $t1, $t3
    srl $t0, $t0, 1
    addi $t2, $t2, -1
    bnez $t2, loop
```

</details>
