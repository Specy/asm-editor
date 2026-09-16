So far, most results have fit in one register. Multiplication can produce a result twice that size,
and division produces two useful results at once. MIPS gives those operations two special result
registers. After that, we will work directly with the individual bits inside an ordinary register.

## The 32 registers, plus hi and lo

MIPS has **32 general-purpose registers**. These are the registers you have been using, such as
`$t0`, `$s0`, `$v0`, and `$zero`. They can be named as operands for arithmetic, loads, stores, and
branches, and each holds one 32-bit value.

MIPS also has two special 32-bit registers named **`hi`** and **`lo`**. They are outside that set of
32 general-purpose registers: you cannot use `hi` or `lo` as an ordinary operand or destination.
Multiplication and division write results into them. The instructions `mfhi` and `mflo`, short for
“move from hi” and “move from lo,” copy those results into general-purpose registers.

A 32-bit register is eight hexadecimal digits wide. Multiplying two 32-bit values can need a
64-bit result, or sixteen hexadecimal digits. `mult` keeps all of that result by splitting it in
half:

- `hi` receives the upper eight hexadecimal digits;
- `lo` receives the lower eight hexadecimal digits.

Here is a product that needs more than 32 bits:

```mips|playground
.text
main:
    li $t0, 100000
    li $t1, 100000
    mult $t0, $t1
    mfhi $t2                # upper 32 bits
    mflo $t3                # lower 32 bits

    li $v0, 10
    syscall
```

The earlier directives lesson introduced `li $v0, 10` followed by `syscall` as supplied Playground
boilerplate that ends the program. Leave those two lines in place; how that service works is outside
this page.

The product is 10,000,000,000, which is `0x00000002540BE400` as a 64-bit value. Split it after the
first eight digits:

```text
0x00000002 540BE400
  hi       lo
```

After the two move instructions, `$t2` holds `0x00000002` and `$t3` holds `0x540BE400`. The pair
preserves the complete product. For a small product such as 6 times 7, `hi` is zero and `lo` holds
42.

`mult` treats its operands as signed values. Its unsigned partner is `multu`. The examples on this
page use positive values, so both forms would produce the same bits.

## Division gives two answers

The two-operand form `div $t0, $t1` divides the value in `$t0` by the value in `$t1`. It writes the
**quotient** to `lo` and the **remainder** to `hi`. Use `mflo` and `mfhi` to copy both answers out:

```mips|playground
.text
main:
    li $t0, 1000
    li $t1, 7
    div $t0, $t1
    mflo $t2                # quotient: 142
    mfhi $t3                # remainder: 6

    li $v0, 10
    syscall
```

The result checks because `7 * 142 + 6` is 1000. As with `mult`, this `div` is signed; `divu` is
the unsigned form.

Each new `mult` or `div` replaces both special registers. Copy out the values you need before
running another multiplication or division. A divisor of zero has no quotient or remainder, so a
program must check a possibly zero divisor with a branch before it executes `div`.

## Logic works one bit at a time

Arithmetic can carry from one bit position into the next. The logic instructions treat every bit
position separately. At one position, the result depends only on the two bits at that position:

| `a` | `b` | `a AND b` | `a OR b` | `a XOR b` | `a NOR b` |
| --- | --- | --------- | -------- | --------- | --------- |
| 0   | 0   | 0         | 0        | 0         | 1         |
| 0   | 1   | 0         | 1        | 1         | 0         |
| 1   | 0   | 0         | 1        | 1         | 0         |
| 1   | 1   | 1         | 1        | 0         | 0         |

`and` keeps a 1 only where both inputs have a 1. `or` keeps a 1 where either input has a 1. `xor`
keeps a 1 where the inputs differ. `nor` first performs OR, then flips every result bit.

This example makes the four-bit patterns easy to compare:

```mips|playground
.text
main:
    li $t0, 0xC             # low four bits: 1100
    li $t1, 0xA             # low four bits: 1010
    and $t2, $t0, $t1       # 1000 = 0x8
    or  $t3, $t0, $t1       # 1110 = 0xE
    xor $t4, $t0, $t1       # 0110 = 0x6
    nor $t5, $t0, $t1       # flip all 32 bits of the OR result

    li $v0, 10
    syscall
```

The low four bits of `$t5` are `0001`, but `nor` flips all 32 bits, so the complete value is
`0xFFFFFFF1`. The immediate forms `andi`, `ori`, and `xori` use a constant as the second input.

## Fixed shifts

A shift slides every bit left or right by a fixed number of positions. Bits that fall off an end
are discarded.

- `sll destination, source, amount` shifts left and fills the low positions with zeroes.
- `srl destination, source, amount` shifts right and fills the high positions with zeroes.
- `sra destination, source, amount` shifts right and copies the old sign bit into the high
  positions.

The fixed amount is from 0 through 31. Start with a positive value, whose sign bit is zero:

```mips|playground
.text
main:
    li $t0, 0x0000000C      # 12
    sll $t1, $t0, 2         # 0x00000030 = 48
    srl $t2, $t0, 2         # 0x00000003 = 3

    li $t3, -20             # two's-complement bits: 0xFFFFFFEC
    sra $t4, $t3, 2         # 0xFFFFFFFB = -5
    srl $t5, $t3, 2         # 0x3FFFFFFB = 1073741819

    li $v0, 10
    syscall
```

For 12, shifting left by two positions multiplies by four, while shifting right by two divides by
four. These examples do not discard any meaningful 1 bits.

The last two shifts begin with exactly the same two's-complement bit pattern for -20. `sra` copies
the leading 1, preserving the negative sign and producing -5. `srl` fills with zeroes, so the same
bits become a large positive value. Use `sra` when shifting a signed negative value and `srl` when
the register is being treated as an unsigned bit pattern.

## Masks and byte extraction

A **mask** is a bit pattern that selects positions in another value. With a mask:

- `and` keeps the selected bits and clears the rest;
- `or` sets the selected bits;
- `xor` flips the selected bits.

Here are those three actions on a four-bit value:

```mips|playground
.text
main:
    li $t0, 0xA             # low four bits: 1010
    andi $t1, $t0, 0x6      # 1010 AND 0110 = 0010
    ori  $t2, $t0, 0x4      # 1010 OR  0100 = 1110
    xori $t3, $t0, 0x2      # 1010 XOR 0010 = 1000

    li $v0, 10
    syscall
```

Masks and shifts work together to extract part of a word. Consider the register value
`0x12345678`. When naming its bytes by numeric significance, count from the right:

| byte | bits    | value |
| ---- | ------- | ----- |
| 3    | 31–24   | `12`  |
| 2    | 23–16   | `34`  |
| 1    | 15–8    | `56`  |
| 0    | 7–0     | `78`  |

This table describes the value inside the register. Byte 0 is the least significant, rightmost
byte. To extract byte 1, shift it down by eight positions, then keep only the low eight bits with
the mask `0xFF`:

```mips|playground
.text
main:
    li $t0, 0x12345678
    srl $t1, $t0, 8         # $t1 = 0x00123456
    andi $t1, $t1, 0xFF     # $t1 = 0x00000056

    li $v0, 10
    syscall
```

The shift places the wanted byte at the right edge. The mask then clears every bit above it. This
same two-step workflow extracts any fixed field: shift the field to the right edge, then use `and`
to keep its width.

## Counting set bits

A loop can inspect a word one bit at a time. The instruction `andi $t3, $t0, 1` keeps only the
lowest bit, so `$t3` becomes either 0 or 1. Add that value to a count, shift the next bit into the
lowest position, and repeat 32 times:

```mips|playground
.text
main:
    li $t0, 0xF0F0F0F0
    li $t1, 0               # number of 1 bits found
    li $t2, 32              # bits left to inspect

count_loop:
    andi $t3, $t0, 1
    add $t1, $t1, $t3
    srl $t0, $t0, 1
    addi $t2, $t2, -1
    bne $t2, $zero, count_loop

    li $v0, 10
    syscall
```

`0xF0F0F0F0` contains sixteen 1 bits, so `$t1` finishes at 16. `$t0` finishes at zero because every
original bit has been shifted out.

## Your turn

The test starts `$t0` at 1000. Divide it by 7 and leave the quotient in `$t1` and the remainder in
`$t2`. Use the two-operand `div`, then copy both results out of `lo` and `hi`. The stop sequence is
already present.

```mips|playground|exercise
.text
main:
    # divide and copy both results here

    li $v0, 10
    syscall
```

```testcase
{
    "startingRegisters": { "$t0": 1000 },
    "expectedRegisters": { "$t1": 142, "$t2": 6, "$v0": 10 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t3, 7
    div $t0, $t3
    mflo $t1
    mfhi $t2

    li $v0, 10
    syscall
```

</details>

For the second exercise, count the 1 bits in `$t0` and leave the count in `$t1`. The test starts
`$t0` at `0xF0F0F0F0`, which contains sixteen 1 bits. You may destroy `$t0`. Inspect exactly 32
bits, following the loop from the example above. The stop sequence is already present.

```mips|playground|exercise
.text
main:
    # initialize the count and loop here

    li $v0, 10
    syscall
```

```testcase
{
    "startingRegisters": { "$t0": "0xF0F0F0F0" },
    "expectedRegisters": { "$t1": 16, "$v0": 10 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t1, 0
    li $t2, 32

count_loop:
    andi $t3, $t0, 1
    add $t1, $t1, $t3
    srl $t0, $t0, 1
    addi $t2, $t2, -1
    bne $t2, $zero, count_loop

    li $v0, 10
    syscall
```

</details>
