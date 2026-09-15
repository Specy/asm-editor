Two unit conversions, one in each direction. The first turns 365 days into hours with a `mul`, and
the second turns 1000 seconds into 16 minutes and 40 seconds, with the minutes from a `div` and the
leftover seconds from a `rem`.

Everything up to here added and subtracted. Multiplication and division are the **M extension**: a
group of instructions that a RISC-V chip is allowed to leave out, and that this simulator has. That
is the deal the whole instruction set is built on, a small core everyone implements and named groups
on top of it.

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
alone is wrong by exactly the amount it could not hold. `mulhu` and `mulhsu` are the same top half
for operands read as unsigned, or the first signed and the second not.

`div` and `rem` split the same way, one instruction per answer, over the same two source registers.
Division cuts towards zero and the remainder keeps the sign of the number being divided, so -7 over
2 is -3 with a remainder of -1. `divu` and `remu` are the pair that read their operands as plain
positive counts from 0 to 4294967295.

The last two lines divide by zero, and the program does not stop, complain, or print anything. `div`
answers `FFFFFFFF`, which is -1, and `rem` hands back the number you were dividing. That is the
defined behaviour, not a bug in the simulator, and it means a program handed a zero it did not
expect carries on quietly with a wrong answer. If a divisor could be zero, a `beqz` in front of the
division is the only thing that will catch it.
