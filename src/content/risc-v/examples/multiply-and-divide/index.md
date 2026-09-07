Two unit conversions, one in each direction. The first turns 365 days into hours with a `mul`, and
the second turns 1000 seconds into 16 minutes and 40 seconds with a `div` and a `rem`, one
instruction per answer.

Every program up to here added and subtracted. These are the instructions that are not in the base
set at all: multiplication and division are the **M extension**, which this simulator has, and a
RISC-V chip is allowed to ship without them.

**You need to know:** the "Arithmetic, logic and bits" lecture. What is new here is that a
multiplication has two halves and one instruction gives you one of them, so the top 32 bits of a
product are a second instruction, `mulh`, run on the same two registers.

```riscv|playground|allow-open
.text
main:
    li t0, 365          # days = 365
    li t1, 24
    mul t2, t0, t1      # hours = days * 24
    mulh t3, t0, t1     # the top half of the same product

    li t4, 1000         # seconds = 1000
    li t5, 60
    div t6, t4, t5      # whole minutes
    rem s0, t4, t5      # the seconds left over

    li s1, 0
    div s2, t0, s1      # a division by zero answers -1
    rem s3, t0, s1      # and gives the dividend back
```

`mul t2, t0, t1` writes the **low** 32 bits of the product into an ordinary register you named.
`t2` comes out at `00002238`, which is 8760, and `t3` at 0, because 8760 needs 14 bits and there is
nothing to put above them. `mulh` is the signed top half, `mulhu` reads both operands as unsigned and
`mulhsu` reads the first as signed and the second as unsigned.

`div` and `rem` each write one register too, so the quotient and the remainder are two instructions
over the same pair. `t6` is 16 and `s0` is 40. The M68K packs both answers into the two halves of one
register and needs a `swap` and two masks to get at them, and MIPS puts them in `hi` and `lo`, two
registers outside the 32 that only these instructions write and that `mfhi` and `mflo` copy out of.
There is no `hi` and no `lo` here, and nothing to read before the next multiplication overwrites it.

Division truncates towards zero and the remainder takes the sign of the dividend, so `-7 / 2` is -3
and `-7 % 2` is -1. `divu` and `remu` are the unsigned pair, which read the same bits as numbers from
0 to 4294967295.

**Dividing by zero raises nothing.** No exception, no message, no stop: `div` answers -1, which is
`FFFFFFFF`, and `rem` gives the dividend straight back, which is why `s2` comes out at -1 and `s3` at 365. MIPS stops the program with `break instruction executed` when its three operand `div` is used,
and the M68K sets its overflow flag; here a program that can be handed a zero has to test for it
itself, with a `beqz` before the division.

Try changing `li t1, 24` to `li t1, 12000000`. `t2` comes out at `05117F00` and `t3` at 1, so the
product is 1 times 4294967296 plus 85032704, which is 4380000000, the right answer for 365 times
twelve million. That is what `mulh` is for: the low half on its own is wrong by exactly the 4294967296
it could not hold.
