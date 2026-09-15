`add` and `sub` behave exactly as they look, and they wrap round without a word of complaint.
Multiplication and division are the two worth slowing down for, because a product can need more room
than a register has and a division produces two answers rather than one.

## Two instructions for one product

Multiplying two 32 bit numbers gives a 64 bit answer, and a RISC-V instruction writes one register.
So there are two instructions, and you run whichever half you want, or both:

- **`mul`** writes the **low** 32 bits of the product.
- **`mulh`** writes the **top** 32 bits, reading both operands as signed.
- **`mulhu`** does the same reading both as unsigned, and **`mulhsu`** with the first signed and the
  second unsigned.

Division splits the same way, and here the two answers are different questions rather than two halves
of one:

- **`div`** writes the quotient and **`rem`** the remainder, both signed.
- **`divu`** and **`remu`** read the operands as unsigned.

```riscv|playground
.text
main:
    li t0, 100000
    li t1, 100000
    mul t2, t0, t1      # the low 32 bits of the product
    mulh t3, t0, t1     # and the top 32 bits, signed
    mulhu t4, t0, t1    # the same read as unsigned
    li t5, 1000
    li t6, 7
    div s0, t5, t6      # the quotient
    rem s1, t5, t6      # the remainder
```

`t2` and `t3` are the two halves of one answer: together they are 10000000000, which is far more
than either register could have held alone. `s1` is 6 because 7 times 142 is 994, six short of the
1000 it was dividing.

Each of these writes the one register you named and touches nothing else on the machine, so there is
never a hidden result sitting somewhere waiting to be collected before the next multiplication
overwrites it. The cost is that a program which wants the whole 64 bit product runs the
multiplication twice, once as `mul` and once as `mulh`. A chip is allowed to spot the pair and do
the work once.

## Dividing by zero

`div` by zero does not stop the program, does not raise an exception and does not need a guard.
RISC-V wrote the answers into the specification instead:

| what you wrote                | quotient        | remainder         |
| ----------------------------- | --------------- | ----------------- |
| `x / 0`                       | -1, all ones    | `x`, the dividend |
| the most negative word `/ -1` | itself, wrapped | 0                 |

```riscv|playground
.text
main:
    li t0, 10
    li t1, 0
    div t2, t0, t1      # -1, and no exception
    rem t3, t0, t1      # 10, the dividend back
    divu t4, t0, t1     # the unsigned pair does the same
    li t5, -2147483648
    li t6, -1
    div s0, t5, t6      # the answer does not fit, so it wraps
    rem s1, t5, t6      # and the remainder is 0
```

Nothing stopped, nothing was reported, and every one of those registers holds a perfectly ordinary
looking number.

This is a deliberate choice rather than an oversight: the instruction always produces an answer, so
the hardware needs no way to report a failure in the middle of one. The consequence lands on you.
**A divisor that could be zero is yours to test**, with a `beqz` in front of the division, because
otherwise the program will carry on perfectly happily with a -1 in it.

## Logic and masks

`and`, `or` and `xor` are one bit position at a time with no carrying between them, and the `i` forms
take a constant: `andi`, `ori`, `xori`. There is no `not` instruction, because `xori t1, t0, -1` is
one, and the assembler accepts `not` as a name for it.

A **mask** is a number written for the pattern of its bits, and each of the operations does one of
the things you can want with one:

- `and` with a mask **keeps** the bits the mask has set and clears the rest.
- `or` with a mask **sets** those bits.
- `xor` with a mask **flips** them.

The constant of `andi`, `ori` and `xori` is 12 bits **sign extended**, which cuts both ways. It only
reaches -2048 to 2047, so a mask like `0xFF00` has to go into a register with `li` first. But because
it is sign extended, a mask of all ones at the top is cheap: `andi t1, t0, -256` is `FFFFFF00`, so
clearing the low byte is one instruction.

```riscv|playground
.text
main:
    li t0, 0x12345678
    li t1, 0xFF00       # a mask too wide for a 12 bit constant
    and t2, t0, t1      # keep the second byte
    srli t2, t2, 8      # and slide it down to the bottom
    srli t3, t0, 16     # or slide first
    andi t3, t3, 0xFF   # and mask after, which does fit
    li t4, 0x00AB
    li t5, 0x00CD
    slli t6, t4, 8      # make room for a byte under t4
    or t6, t6, t5       # and drop t5 into it
    ori s0, t0, 0xFF    # set the low byte
    xori s1, t0, 0xFF   # flip it
    andi s2, t0, -256   # clear it, since -256 is FFFFFF00 sign extended
```

`t2` comes out at `00000056` and `t3` at `00000034`, the second and third bytes of `12345678` pulled
out one at a time. `t6` is `0000ABCD`, two bytes packed into one half. `s0` is `123456FF`, `s1` is
`12345687` and `s2` is `12345600`.

Mask and shift down to read a field, shift up and `or` to write one. That pair is how every packed
value on this machine is taken apart, including the colour of a pixel on the bitmap display, which is
red, green and blue in three bytes of one word.

## Shifts

Three shifts, each with a constant form and a register form:

- **`sll`, `slli`**, shift left, zeroes coming in at the bottom. Shifting left by `n` multiplies by 2
  to the `n`.
- **`srl`, `srli`**, shift right logical, zeroes coming in at the top, which divides an **unsigned**
  number.
- **`sra`, `srai`**, shift right arithmetic, copies of the sign bit coming in at the top, which
  divides a **signed** number.

The constant amount is five bits, so 0 to 31, and the register forms use the low five bits of the
register and ignore the rest.

A **rotate**, where the bits that fall off one end come back in at the other, is not in the base
instruction set. You build one: shift the word each way by amounts that add up to 32, then `or` the
two halves together, which is the last three lines of the program below.

```riscv|playground
.text
main:
    li t0, 1
    li t1, 20
    sll t2, t0, t1      # a shift amount worked out by the program
    li t3, 0xFF
    slli t4, t3, 8
    li t5, -20
    srai t6, t5, 2      # signed: -20 / 4
    srli s0, t5, 2      # the same bits, unsigned
    li s1, 0x80000001
    srli s2, s1, 1      # a rotate right by one, written out
    slli s3, s1, 31
    or s4, s2, s3
```

`t2` is `00100000`, `t4` is `0000FF00`, `t6` is `FFFFFFFB`, which is -5, and `s0` is `3FFFFFFB`,
which is 1073741819. `s4` is `C0000000`: the bit at the bottom of `s1` came round to the top and
joined the one already there.

## One bit at a time

There is no bit test instruction. Testing bit `n` is `andi` with `1 << n` and a branch on whether the
answer is zero; setting it is `ori`, clearing it is `andi` with the complement, flipping it is
`xori`. When `n` is in a register, `srl` brings the bit down to the bottom and `andi t1, t1, 1` keeps
it.

Counting the set bits of a word is that idea in a loop:

```riscv|playground
.text
main:
    li t0, 0xF0F0F0F0
    li t1, 0            # count = 0
    li t2, 32           # bits left
loop:
    andi t3, t0, 1      # the lowest bit
    add t1, t1, t3      # add it, since it is 0 or 1
    srli t0, t0, 1      # and bring the next one down
    addi t2, t2, -1
    bnez t2, loop
```

`t1` comes out at 16 and `t0` at 0, shifted away entirely. `add t1, t1, t3` with a bit that is 0 or 1
is the whole of "count it if it is set", which needs no branch.

Finding the **highest** set bit is the same loop the other way up: shift left until the top bit is
set, counting as you go. There is a RISC-V extension with single instructions for both, called Zbb,
and this assembler does not have it.

## Choosing a value without a branch

Here is what a mask is really good for. Suppose you want the larger of two numbers in a register,
and you would rather not jump anywhere to get it.

Start from the useful fact that `and` with a mask of **all ones** leaves a value alone, and `and`
with a mask of **all zeroes** wipes it out. So if you can produce one of those two masks from a
comparison, you can pick between two values with no branch at all.

`slt` gives you a 1 or a 0. `sub t3, zero, t2` turns that into the mask: 0 minus 0 is `00000000`,
and 0 minus 1 is `FFFFFFFF`.

```riscv|playground
.text
main:
    li t0, -5
    li t1, 3
    slt t2, t0, t1      # 1, because -5 is the smaller
    sub t3, zero, t2    # so the mask is all ones
    xor t4, t0, t1      # the bits in which the two differ
    and t4, t4, t3      # kept by this mask, wiped by the other one
    xor t4, t4, t0      # applied to t0, which turns it into t1
```

The last three lines are worth watching one bit at a time. Take the lowest four bits of each value,
with `t0` as -5, which ends in `1011`, and `t1` as 3, which ends in `0011`:

| step             | bits   | what it is                                     |
| ---------------- | ------ | ---------------------------------------------- |
| `t0`             | `1011` | the value we start from                        |
| `t1`             | `0011` | the value we may want instead                  |
| `xor t4, t0, t1` | `1000` | a 1 wherever the two disagree                  |
| `and t4, t4, t3` | `1000` | the mask is all ones, so nothing is dropped    |
| `xor t4, t4, t0` | `0011` | flipping exactly those bits of `t0` gives `t1` |

Flipping a bit twice puts it back, so `xor` with the difference is what carries one value across
into the other. Had the comparison come out 0, the mask would have been all zeroes, the `and` would
have wiped the difference out, and the final `xor` with nothing would have left `t0` exactly as it
was.

Five instructions where the branch version takes three, so this is not a saving. It is what you
reach for when the jump itself is the thing you want to avoid, which on a real chip is a branch
whose outcome is hard to guess in advance.

## Your turn

The test starts `t0` at 100000. Leave the **whole** product of `t0` times itself in two registers:
its low 32 bits in `t1`, which is `0x540BE400`, and its top 32 bits in `t2`, which is 2.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": 100000 },
    "expectedRegisters": { "t1": "0x540BE400", "t2": 2 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    mul t1, t0, t0      # the low half
    mulhu t2, t0, t0    # and the top half, read as unsigned
```

</details>

The second one starts `t0` at `0xF0F0F0F0` and wants the number of bits set in it left in `t1`, which
is 16. `t0` may be destroyed on the way.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": "0xF0F0F0F0" },
    "expectedRegisters": { "t1": 16 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    li t1, 0            # count = 0
    li t2, 32           # bits left
loop:
    andi t3, t0, 1      # the lowest bit
    add t1, t1, t3
    srli t0, t0, 1
    addi t2, t2, -1
    bnez t2, loop
```

</details>
