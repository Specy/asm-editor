Two unit conversions, one in each direction. The first turns 365 days into hours with a `mul`, and
the second turns 1000 seconds into 16 minutes and 40 seconds, with the minutes from a `div` and the
leftover seconds from a `rem`.

The arithmetic examples so far have mostly added and subtracted. Multiplication and division are
the **M extension**: a group of instructions that a RISC-V chip is allowed to leave out, and that
this simulator has. That is the deal the whole instruction set is built on, a small core everyone
implements and named groups on top of it.

```riscv|playground|allow-open
.text
main:
    li t0, 365
    li t1, 24
    mul t2, t0, t1      # hours in a year
    mulh t3, t0, t1     # the top half of the same product

    li t4, 1000
    li t5, 60
    div t6, t4, t5      # whole minutes
    rem s0, t4, t5      # the seconds left over

    li s1, 0
    div s2, t0, s1      # a division by zero, on purpose
    rem s3, t0, s1
```

Multiply two 32 bit numbers and the answer can need 64 bits. A register holds 32, so the product
comes in two pieces and each piece is an instruction: `mul` writes the bottom half, `mulh` writes
the top half of the same multiplication. For 365 times 24 the top half is all zeroes, since 8760
fits with room to spare, and the second instruction looks pointless.

Change the 24 to `12000000` and it stops looking pointless. `t2` comes out at `05117F00` and `t3` at
1, and the real answer is that 1 times 4294967296, plus 85032704, which is 4380000000. The low half
alone has lost the part that did not fit. The high-half instruction says how to interpret each
operand: `mulh` is signed times signed, `mulhu` is unsigned times unsigned, and `mulhsu` treats its
first operand as signed and its second as unsigned.

`div` and `rem` split the same way, one instruction per answer, over the same two source registers.
Division cuts towards zero and the remainder keeps the sign of the number being divided, so -7 over
2 is -3 with a remainder of -1. `divu` and `remu` are the pair that read their operands as plain
unsigned values from 0 through 4,294,967,295.

The last two lines divide by zero, and the program does not stop, complain, or print anything. `div`
answers `FFFFFFFF`, which is -1, and `rem` hands back the number you were dividing. That is the
defined behaviour, not a bug in the simulator, and it means a program handed a zero it did not
expect carries on quietly with a wrong answer. If a divisor could be zero, check it and branch to
the handling your program needs before doing the division.

Signed division has one more special case. The smallest signed 32-bit number is `0x80000000`, or
-2,147,483,648, and its positive counterpart cannot fit in a signed register. Dividing it by -1
therefore leaves `0x80000000` as the quotient, and `rem` returns 0. These results, like the
zero-divisor results, are defined by RISC-V.

## Your turn: split seconds into hours, minutes, and seconds

Your program receives a nonnegative signed 32-bit duration in `t0`. Write the divisions that leave
whole hours in `t1`, the minutes left after those hours in `t2`, and the final leftover seconds in
`t3`. Use 3,600 and 60 as divisors, and use `rem` to carry only the leftover part into the next
calculation.

```riscv|playground|exercise
.text
main:
    # split the duration in t0 into t1 hours, t2 minutes, and t3 seconds
```

```testcase
{
    "startingRegisters": { "t0": 10000 },
    "expectedRegisters": { "t1": 2, "t2": 46, "t3": 40 }
}
```

```testcase
{
    "startingRegisters": { "t0": 3723 },
    "expectedRegisters": { "t1": 1, "t2": 2, "t3": 3 }
}
```

```testcase
{
    "startingRegisters": { "t0": 59 },
    "expectedRegisters": { "t1": 0, "t2": 0, "t3": 59 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    li  t4, 3600
    div t1, t0, t4
    rem t5, t0, t4

    li  t4, 60
    div t2, t5, t4
    rem t3, t5, t4
```

</details>
