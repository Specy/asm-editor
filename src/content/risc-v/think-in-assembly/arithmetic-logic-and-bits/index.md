`add` and `sub` behave exactly as they look, and they wrap without a word of complaint, which "Words,
halves and bytes" showed. Multiplication and division are the two with rules of their own, because a
product can need 64 bits and a division has two answers.

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

`t2` comes out at `540BE400` and `t3` at 2, which together are 10000000000. `s0` is 142 and `s1` is
6, because 7 times 142 is 994.

The MIPS course keeps its product in `hi` and `lo`, two registers outside the 32 that only four
instructions can reach, and a `mult` between a `div` and its `mflo` throws the quotient away. There
is nothing like that here: `mul` and `div` write the register you named, and nothing else on the
machine is touched.

The cost is that a program wanting the whole 64 bit product runs the multiplication twice, once as
`mul` and once as `mulh`. A chip is allowed to notice the pair and do the work once.

## Division by zero says nothing

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

`t2` and `t4` come out at `FFFFFFFF`, `t3` at 10, `s0` at `80000000` and `s1` at 0. Nothing stopped
and nothing was reported.

MIPS is the opposite: its three operand `div` and `rem` are pseudo-instructions that assemble a
`break` in front of the real division, so a divisor of zero ends the run with a message. Here the
program carries on with a -1, so **a divisor that could be zero is yours to test**, with a `beqz`
before the `div`.

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

**There is no rotate.** MIPS has `rol` and `ror` as pseudo-instructions and the M68K has four real
rotate instructions; the RISC-V base has none at all, so a rotate is a shift each way and an `or`,
written by you.

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

MIPS has `clz` and `clo`, which count the run of zeroes or ones at the top of a word in one
instruction. The RISC-V base has neither, and neither does this assembler, so finding the highest set
bit is a loop like the one above.

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
