`add` and `sub` keep the low 32 bits of their result. If a result is outside the range of one word,
it wraps around. Multiplication deserves extra care because a complete product may need 64 bits,
and division produces both a quotient and a remainder.

The multiplication and division instructions in this lecture belong to RISC-V's **M extension**.
The RV32IM instruction set combines the 32-bit integer base with that extension.

## Two registers for a complete product

Multiplying two 32-bit values can produce a 64-bit result. Each multiplication instruction writes
one 32-bit register, so a complete product uses two instructions:

- **`mul`** writes the low 32 bits. Those bits are the same for signed and unsigned multiplication.
- **`mulh`** writes the high 32 bits after reading both operands as signed.
- **`mulhu`** writes the high 32 bits after reading both operands as unsigned.
- **`mulhsu`** writes the high 32 bits with the first operand signed and the second unsigned.

This gives a direct rule for choosing a pair:

| complete product | low half | high half |
| ---------------- | -------- | --------- |
| signed × signed | `mul` | `mulh` |
| unsigned × unsigned | `mul` | `mulhu` |
| signed × unsigned | `mul` | `mulhsu` |

Operand order matters for `mulhsu`: its first source is the signed value. If a calculation is
described as unsigned × signed, supply the sources in swapped order so the signed value comes first:
`mulhsu high, signed_source, unsigned_source`.

```riscv|playground
.text
main:
    li    t0, -1
    li    t1, 2
    mul   t2, t0, t1     # low half for either interpretation
    mulh  t3, t0, t1     # high half of signed -1 * 2
    mulhu t4, t0, t1     # high half of unsigned 0xFFFFFFFF * 2
```

All three instructions read the same bits. The interpretation changes the full product:

| interpretation | complete 64-bit product | high half | low half |
| -------------- | ----------------------- | --------- | -------- |
| signed: -1 × 2 | `0xFFFFFFFFFFFFFFFE` | `FFFFFFFF` | `FFFFFFFE` |
| unsigned: 4,294,967,295 × 2 | `0x00000001FFFFFFFE` | `00000001` | `FFFFFFFE` |

Thus `t2` is `FFFFFFFE` in both cases, while `t3` and `t4` differ. Pair `t2` with `t3` for the
signed product and with `t4` for the unsigned product.

For another example, 100,000 squared is 10,000,000,000, or `0x00000002540BE400`:

```riscv|playground
.text
main:
    li    t0, 100000
    mul   t1, t0, t0     # low half:  0x540BE400
    mulhu t2, t0, t0     # high half: 0x00000002
```

Each instruction writes only its named destination. There is no hidden product register to collect.
A program that needs all 64 bits executes the appropriate pair.

## Quotient and remainder

Division also has signed and unsigned forms:

- **`div`** writes the signed quotient, and **`rem`** writes the signed remainder.
- **`divu`** writes the unsigned quotient, and **`remu`** writes the unsigned remainder.

For a nonzero divisor, signed division truncates the quotient toward zero. The remainder has the
dividend's sign when it is nonzero. In every ordinary case, the two results satisfy this mathematical
equation:

```text
dividend = quotient * divisor + remainder
```

The RV32 signed overflow case, `-2147483648 / -1`, is the exception. Its mathematical quotient
cannot fit in a signed word, so RISC-V supplies the separately defined register results shown below.

```riscv|playground
.text
main:
    li  t0, -17
    li  t1, 4
    div t2, t0, t1      # -4: truncate -4.25 toward zero
    rem t3, t0, t1      # -1: -17 = (-4 * 4) + -1

    li   t4, 17
    divu t5, t4, t1     # unsigned quotient: 4
    remu t6, t4, t1     # unsigned remainder: 1
```

### Division edge cases

RISC-V defines register results for division by zero. The instruction executes without an ISA
exception. Add a guard whenever zero is invalid for your program.

| operation | quotient | remainder |
| --------- | -------- | --------- |
| signed `x / 0` | `-1` (`0xFFFFFFFF`) | `x` |
| unsigned `x / 0` | `0xFFFFFFFF` | `x` |
| signed `-2147483648 / -1` | `-2147483648` (`0x80000000`) | 0 |

The last row is the one signed division whose mathematical quotient does not fit in a 32-bit signed
word. Its quotient wraps to the original `0x80000000` bit pattern. These specified register results
do not satisfy the mathematical equation above; they define the overflow behavior directly.

```riscv|playground
.text
main:
    li   t0, 10
    li   t1, 0
    div  t2, t0, t1     # signed quotient: -1
    rem  t3, t0, t1     # signed remainder: 10
    divu t4, t0, t1     # unsigned quotient: 0xFFFFFFFF
    remu t5, t0, t1     # unsigned remainder: 10

    li   t0, -2147483648
    li   t1, -1
    div  t6, t0, t1     # 0x80000000
    rem  s0, t0, t1     # 0
```

When a divisor may be zero and that has no valid meaning in the program, test it before dividing:

```riscv
    beqz t1, zero_divisor
    div   t2, t0, t1
    rem   t3, t0, t1
```

## Logic and masks

`and`, `or` and `xor` work independently at every bit position, with no carry between positions.
Their immediate forms are `andi`, `ori` and `xori`. The assembler accepts `not t1, t0` as a
convenient spelling of `xori t1, t0, -1`, which flips all 32 bits.

A **mask** is a value whose set bits mark the positions to affect:

- `and` with a mask **keeps** the marked bits and clears the rest.
- `or` with a mask **sets** the marked bits.
- `xor` with a mask **flips** the marked bits.

```riscv|playground
.text
main:
    li    t0, 0x12345678
    li    t1, 0x0000FF00
    and   t2, t0, t1     # keep bits 8 through 15
    srli  t2, t2, 8      # move that byte to the bottom

    srli  t3, t0, 16     # move bits 16 through 23 down first
    andi  t3, t3, 0xFF   # this small mask fits in the instruction

    li    t4, 0xAB
    li    t5, 0xCD
    slli  t6, t4, 8      # make room for the low byte
    or    t6, t6, t5     # pack the bytes as 0x0000ABCD

    ori   s0, t0, 0xFF   # set the low byte
    xori  s1, t0, 0xFF   # flip the low byte
    andi  s2, t0, -256   # clear it: -256 becomes 0xFFFFFF00
```

`t2` becomes `00000056`, and `t3` becomes `00000034`. The first sequence masks and then shifts;
the second shifts and then uses a smaller mask. `t6` becomes `0000ABCD`, while `s0`, `s1` and `s2`
become `123456FF`, `12345687` and `12345600`.

### The 12-bit immediate limit

The immediate in `andi`, `ori` and `xori` is a signed 12-bit value. It is sign-extended to 32 bits
before the logical operation. Source constants from -2048 through 2047 fit directly.

This has two useful consequences:

- A mask such as `0xFF` fits directly.
- A wider mask such as `0xFF00` or `0x00FF0000` belongs in a register, loaded with `li`.

Negative immediates describe masks with leading ones. For example, `-256` is sign-extended to
`0xFFFFFF00`, which makes the final `andi` above a compact way to clear the low byte.

For a single fixed bit, `1 << n` fits as a positive logical immediate only for bit positions 0
through 10. Bit 11 needs the isolated mask `0x00000800`, but the 12-bit immediate pattern with its
top bit set would sign-extend to `0xFFFFF800`. Load an isolated mask for bit 11 or above into a
register:

```riscv
    li   t1, 1
    slli t1, t1, 20     # t1 = mask for bit 20
    or   t0, t0, t1     # set bit 20
```

## Shifts

RISC-V has three shifts, each with a constant form and a register form:

- **`sll`, `slli`** shift left and bring zeroes in at the bottom.
- **`srl`, `srli`** shift right and bring zeroes in at the top.
- **`sra`, `srai`** shift right and copy the sign bit into the top.

The immediate shift amount is from 0 through 31. A register-form shift uses only the low five bits
of its shift-amount register. For example, an amount of 33 acts as an amount of 1 in RV32.

A left shift by `n` keeps the low 32 bits of multiplication by `2^n`. It gives the ordinary
mathematical product while that product fits in the intended 32-bit range. Bits shifted past bit 31
are discarded, so overflow makes the register wrap:

```riscv|playground
.text
main:
    li   t0, 3
    slli t1, t0, 4      # 3 * 16 = 48

    li   t2, 0x40000000
    slli t3, t2, 2      # low 32 bits are 0 after overflow
```

Logical right shift matches unsigned division by a power of two, discarding the fractional part.
Arithmetic right shift preserves the sign, but its rounding differs from `div` for some negative
values. An arithmetic shift rounds downward; signed `div` truncates toward zero:

```riscv|playground
.text
main:
    li   t0, -5
    srai t1, t0, 1      # -3: round -2.5 downward
    li   t2, 2
    div  t3, t0, t2     # -2: truncate -2.5 toward zero
    srli t4, t0, 1      # 0x7FFFFFFD, using the bits as unsigned
```

For a negative value divisible by the power of two, the results agree. For example, both
`srai` by 2 and signed division by 4 turn -20 into -5.

## Read or change one bit

For a bit position held in a register, shift the chosen bit down and keep the low bit. Here `t1`
contains the position to read:

```riscv|playground
.text
main:
    li   t0, 0x00100000 # bit 20 is set
    li   t1, 20
    srl  t2, t0, t1     # move the selected bit to position 0
    andi t2, t2, 1      # t2 = 1 if it was set, 0 if it was clear
```

The same shift-created mask can set, clear or flip a dynamic bit. The outputs below are separate
alternatives computed from the original value in `t0`:

```riscv
    li   t2, 1
    sll  t2, t2, t1     # t2 = 1 << bit position
    or   t3, t0, t2     # t3: set the selected bit
    xor  t4, t0, t2     # t4: flip the selected bit
    not  t5, t2
    and  t6, t0, t5     # t6: clear the selected bit
```

`t0` remains unchanged. Choose the output sequence that matches the operation you want.

Counting the set bits in a word repeats the extraction of its low bit:

```riscv|playground
.text
main:
    li   t0, 0xF0F0F0F0
    li   t1, 0           # count = 0
    li   t2, 32          # bits left
loop:
    andi t3, t0, 1       # extract the low bit
    add  t1, t1, t3      # add either 0 or 1
    srli t0, t0, 1       # bring the next bit down
    addi t2, t2, -1
    bnez t2, loop
```

`t1` finishes at 16. The loop always runs 32 passes, so it also handles an input of zero.

## Select with a mask

A comparison result can become an all-zero or all-one mask. That mask can select between two
values. This example computes the **signed maximum** of `t0` and `t1` because its comparison uses
`slt`:

```riscv|playground
.text
main:
    li   t0, -5
    li   t1, 3
    slt  t2, t0, t1     # 1 because signed -5 < 3
    sub  t3, zero, t2   # 0 - 1 = 0xFFFFFFFF
    xor  t4, t0, t1     # positions where the values differ
    and  t4, t4, t3     # keep that difference when t1 is larger
    xor  t4, t4, t0     # apply the difference to t0; t4 becomes t1
```

If `slt` produces 1, subtracting it from zero produces the all-one mask. The `and` keeps every
differing bit, and the final `xor` changes `t0` into `t1`. If `slt` produces 0, the all-zero mask
clears the difference and the final result stays equal to `t0`.

Use `sltu` in the same pattern for an unsigned maximum. This five-instruction sequence is mainly a
compact demonstration of comparison masks and `xor` selection. A branch can express a maximum more
directly, and performance depends on the processor and surrounding code.

## Check the choices

1. Which two instructions produce the complete signed product of two registers? Which pair produces
   the complete unsigned product?
2. What do `div` and `rem` produce for -17 divided by 4? What does `divu` produce when its divisor
   is zero?
3. What values do `srai` by 1 and signed `div` by 2 produce from -5, and why do they differ?
4. Can `andi t1, t0, 0x00FF0000` encode that mask directly? Give a two-instruction way to extract
   bits 16 through 23 without loading the wide mask.

<details>
<summary>Show answers</summary>

1. Use `mul` for the low half and `mulh` for the signed high half. Use `mul` and `mulhu` for the
   unsigned product.
2. `div` produces -4 and `rem` produces -1. `divu` by zero produces `0xFFFFFFFF`.
3. `srai` produces -3 because it rounds the shifted negative value downward. `div` produces -2
   because signed division truncates toward zero.
4. No. Shift first with `srli t1, t0, 16`, then use `andi t1, t1, 0xFF`.

</details>

## Your turn

The first exercise starts `t0` at -1 and `t1` at 2. Leave the complete **signed** product in `t2`
and `t3`: the low 32 bits in `t2` and the high 32 bits in `t3`.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": -1, "t1": 2 },
    "expectedRegisters": { "t2": "0xFFFFFFFE", "t3": "0xFFFFFFFF" }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    mul  t2, t0, t1     # low half
    mulh t3, t0, t1     # signed high half
```

</details>

The next exercise starts `t0` at `0x12345678`. Extract bits 16 through 23 and leave the byte
`0x34` in `t1`. Use a shift followed by an immediate mask.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": "0x12345678" },
    "expectedRegisters": { "t1": "0x34" }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    srli t1, t0, 16
    andi t1, t1, 0xFF
```

</details>

The third exercise starts `t0` at `0x10` and `t1` at 3. Flip the bit at the position held in `t1`
and leave the result `0x18` in `t2`. Build a one-bit mask with a register-form shift.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": "0x10", "t1": 3 },
    "expectedRegisters": { "t2": "0x18" }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    li  t2, 1
    sll t2, t2, t1      # mask = 1 << position
    xor t2, t0, t2      # flip the selected bit
```

</details>

The final exercise starts `t0` at `0xF0F0F0F0`. Count its set bits and leave the count 16 in `t1`.
You may destroy `t0` while counting.

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
    li   t1, 0
    li   t2, 32
loop:
    andi t3, t0, 1
    add  t1, t1, t3
    srli t0, t0, 1
    addi t2, t2, -1
    bnez t2, loop
```

</details>
