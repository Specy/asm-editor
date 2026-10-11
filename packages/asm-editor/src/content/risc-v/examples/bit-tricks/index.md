One 32-bit value can be inspected in several useful ways by treating its register as a pattern of
bits. This program starts with `t0 = 182` and produces five results:

| question                                               | result register | value for 182 |
| ------------------------------------------------------ | --------------- | ------------- |
| Is the value odd? (`1` for odd, `0` for even)          | `t1`            | 0             |
| What are the low 32 bits after shifting left by three? | `t2`            | 1456          |
| What are the bottom four bits, as a number?            | `t3`            | 6             |
| How many of the 32 bits are 1?                         | `t4`            | 5             |
| How many zeroes come before the highest 1?             | `s1`            | 24            |

```riscv|playground|allow-open
.text
main:
    li t0, 182          # 00000000 00000000 00000000 10110110

    andi t1, t0, 1      # 1 when the value is odd, 0 when it is even

    slli t2, t0, 3      # low 32 bits of t0 shifted left three places

    andi t3, t0, 0xF    # the bottom four bits on their own

    li t4, 0            # number of 1 bits counted so far
    mv t5, t0           # a copy to take apart
    li t6, 32           # exactly 32 bits to inspect
count:
    andi s0, t5, 1      # the lowest bit, either 0 or 1
    add t4, t4, s0
    srli t5, t5, 1      # bring the next bit down
    addi t6, t6, -1
    bnez t6, count

    li s1, 32           # leading-zero count starts at the register width
    mv s2, t0
lead:
    beqz s2, lead_done
    srli s2, s2, 1
    addi s1, s1, -1
    j lead
lead_done:
```

`andi` keeps a bit wherever the mask has a 1 and clears it everywhere else. The mask 1 therefore
keeps only the lowest bit. That bit is 0 for an even value and 1 for an odd value, so `t1` is the
answer directly.

Every place a bit moves left doubles its place value, so shifting 182 left by three gives 1456.
This multiplication interpretation is exact only when the mathematical result fits the intended
32-bit range. A register keeps only the low 32 bits: any bits shifted past bit 31 are discarded.
The instruction itself does not distinguish signed from unsigned values; the same remaining bit
pattern can have different signed and unsigned interpretations. The shift amount in `slli` is a
constant from 0 through 31. `sll` instead takes the shift amount from a register.

`andi t3, t0, 0xF` keeps the bottom four bits. This is also how a field is pulled out of a packed
value: shift the wanted field down if necessary, then mask off the other bits. Here the bottom four
bits of 182 are `0110`, so `t3` becomes 6.

There is a limit on an immediate mask. The constant in `andi` is 12 bits and is sign extended, so
it ranges from -2048 through 2047. `andi t0, t0, -256` is valid and clears the low byte, because
-256 has the 32-bit pattern `FFFFFF00`. `andi t0, t0, 0xFF00` is out of range. Build a wider mask
with `li`, then use `and` with two registers.

The first eight passes of the set-bit loop look like this. The lowest bit is added to `t4` before
the copy in `t5` shifts right:

| pass | `t5` at the top | lowest bit | `t4` after adding |
| ---- | --------------- | ---------- | ----------------- |
| 1    | `...10110110`   | 0          | 0                 |
| 2    | `...1011011`    | 1          | 1                 |
| 3    | `...101101`     | 1          | 2                 |
| 4    | `...10110`      | 0          | 2                 |
| 5    | `...1011`       | 1          | 3                 |
| 6    | `...101`        | 1          | 4                 |
| 7    | `...10`         | 0          | 4                 |
| 8    | `...1`          | 1          | 5                 |

After pass 8, `t5` is zero. The loop still runs until `t6` has counted down from 32 to 0, so it
always inspects all 32 positions; the remaining 24 passes add zero. `srli` brings zeroes in at the
top, which is useful when the register is being treated as bits. `srai` instead copies the sign bit
into the new positions and is used when shifting a signed value right as arithmetic.

The leading-zero loop starts at 32 and subtracts once for every shift needed to empty the register.
It runs at most 32 times. For 182, eight shifts reach zero, leaving `s1 = 24`. If `t0` is zero, the
branch exits before any subtraction and returns 32. If bit 31 is set, emptying the register takes
32 logical shifts and the result is 0; this includes every bit pattern interpreted as a negative
signed value.

## Your turn: count the set bits

Your program receives any 32-bit pattern in `t0`. Count how many of its 32 bits are 1 and leave the
answer in `t1`. Use a copy of `t0`, a counter that makes exactly 32 passes, `andi` to isolate one
bit, and `srli` to bring down the next bit. Do not change `t0`.

```riscv|playground|exercise
.text
main:
    # leave the number of 1 bits in t1
```

```testcase
{
    "startingRegisters": { "t0": 182 },
    "expectedRegisters": { "t0": 182, "t1": 5 }
}
```

```testcase
{
    "startingRegisters": { "t0": 0 },
    "expectedRegisters": { "t0": 0, "t1": 0 }
}
```

```testcase
{
    "startingRegisters": { "t0": -1 },
    "expectedRegisters": { "t0": -1, "t1": 32 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    li t1, 0
    mv t2, t0
    li t3, 32
count:
    andi t4, t2, 1
    add t1, t1, t4
    srli t2, t2, 1
    addi t3, t3, -1
    bnez t3, count
```

</details>
