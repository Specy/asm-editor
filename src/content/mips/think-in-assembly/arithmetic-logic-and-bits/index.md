`add` and `sub` behave exactly as they look, with the trapping and wrapping pairs from "Words, halves
and bytes". Multiplication and division are the two with rules of their own, because a product can
need 64 bits and a division has two answers.

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

`$t2` comes out at 2 and `$t3` at `540BE400`, which together are 10000000000. `$t6` is 142 and `$t7`
is 6, because 7 times 142 is 994.

`hi` and `lo` are at the bottom of the registers panel with `pc`, and they hold whatever the last
`mult` or `div` left there. So read them before the next one: a `mult` between your `div` and your
`mflo` throws the quotient away.

`mul $t2, $t0, $t1` is the three operand form and it is a real instruction: it writes the **low 32
bits** of the product straight into a register, and updates `hi` and `lo` as well. When the answer
fits in a word, which is nearly always, it is the one to write.

## Division by zero says nothing

`div $t0, $t1` with a zero in `$t1` does not stop the program, does not raise an exception and does
not even change `hi` and `lo`. The answer you then read with `mflo` is whatever was there before.

The three operand `div $t2, $t0, $t1` and `rem $t2, $t0, $t1` are pseudo-instructions, and they build
the check in: each becomes a `bne` that tests the divisor, a `break` for when it is zero, then the
real `div` and an `mflo` or `mfhi`.

```mips|playground
.text
main:
    li $t0, 1000
    li $t1, 7
    div $t2, $t0, $t1       # four instructions, quotient in $t2
    rem $t3, $t0, $t1       # four more, remainder in $t3
    mul $t4, $t0, $t1       # one instruction, the low half of the product
```

`$t2` is 142, `$t3` is 6 and `$t4` is 7000. Click on the `div` line after building and the four
instructions it became are printed underneath.

Change `li $t1, 7` to `li $t1, 0` and press Run: the program stops on the `div` line with
`break instruction executed; no code given.` Write the two operand `div $t0, $t1` instead and the
same zero goes by in silence. So either use the pseudo-instructions and let them stop you, or test
the divisor yourself before the real one.

`madd` and `msub` write `hi` and `lo` too: they multiply and then **add to** or **subtract from**
what is already in the pair, which is how a sum of products is computed without a move between every
step. `mthi` and `mtlo` write them from a register you name.

## Logic and masks

`and`, `or`, `xor` and `nor` are one bit position at a time with no carrying between them, and the
`i` forms take a constant: `andi`, `ori`, `xori`. There is no `not` instruction, because
`nor $t1, $t0, $zero` is one, and the assembler accepts `not` as a name for it.

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

`$t1` comes out at `00000056` and `$t2` at `00000034`, the second and third bytes of `12345678`
pulled out one at a time. `$t5` is `0000ABCD`, two bytes packed into one half. `$t6` is `123456FF`,
`$t7` is `12345687` and `$t9` is `12345600`.

Mask and shift down to read a field, shift up and `or` to write one. That pair is how every packed
value on this machine is taken apart, including the colour of a pixel on the bitmap display, which
is red, green and blue in three bytes of one word.

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

`$t2` is `00100000`, `$t4` is `0000FF00`, `$t6` is `FFFFFFFB`, which is -5, and `$t7` is `3FFFFFFB`,
which is 1073741819. `$t9` is `C0000000`: the bit at the bottom came round to the top and joined the
one already there.

`rol` and `ror` are pseudo-instructions. MIPS has no rotate, so each becomes a shift each way and an
`or`, through `$at`.

## One bit at a time

There is no bit test instruction. Testing bit `n` is `andi` with `1 << n` and a branch on whether the
answer is zero; setting it is `ori`, clearing it is `and` with the complement, flipping it is `xori`.
When `n` is in a register, `srlv` brings the bit down to the bottom and `andi $t1, $t1, 1` keeps it.

Counting the set bits of a word is that idea in a loop:

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

`$t1` comes out at 16 and `$t0` at 0, shifted away entirely. `add $t1, $t1, $t3` with a bit that is 0
or 1 is the whole of "count it if it is set", which needs no branch.

Two instructions count bits for you at one end of a word. `clz $t1, $t0` counts the **leading zeroes**
of `$t0`, the run of 0 bits from the top down, and `clo` counts the leading ones. `clz` is how a
program finds the position of the highest set bit, which is the integer logarithm of a number.

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
