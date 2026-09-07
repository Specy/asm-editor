Four questions about one number, none of them answered with arithmetic. Is 182 odd, what is it times
eight, what are its bottom four bits, and how many of its 32 bits are ones. The answers land in
`$t1` to `$t4`.

The instructions of the Example before this one treat a register as a number. These four treat the
same register as 32 bits side by side, which is the other way to read one and often the cheaper way.

**You need to know:** the "Arithmetic, logic and bits" lecture. What is new here is that a masked
bit is already a 0 or a 1, so counting one costs an `add` and no branch at all.

```mips|playground|allow-open
.text
main:
    li $t0, 182         # n = 182, which is 10110110 in binary

    andi $t1, $t0, 1    # 1 when n is odd, 0 when it is even

    sll $t2, $t0, 3     # n * 8, three places left is eight times

    andi $t3, $t0, 0xF  # the low nibble on its own

    li $t4, 0           # bits = 0
    move $t5, $t0       # a copy to take apart
    li $t6, 32          # 32 bits to look at
count:
    andi $t7, $t5, 1    # the lowest bit
    add $t4, $t4, $t7   # add it, since it is 0 or 1
    srl $t5, $t5, 1     # and bring the next one down
    addi $t6, $t6, -1
    bnez $t6, count

    clz $t8, $t0        # how many zero bits above the highest set one
```

`andi $t1, $t0, 1` is C's `n & 1`, and the answer is the value: `$t1` comes out at 0 because 182 is
even, and it would be 1 for an odd number, with nothing else to read and no flag anywhere. The M68K
tests that bit with `btst`, which sets `Z` to 1 when the bit **was 0**, and then needs an `sne` to
turn the flag back into a number.

Shifting left by three multiplies by eight, since every place a bit moves left doubles what it is
worth. `$t2` comes out at `000005B0`, which is 1456. The shift amount is five bits, so 0 to 31, and
`sllv` takes it from a register when the program worked it out.

`andi $t3, $t0, 0xF` keeps the four bits the mask has set and clears everything else, so `$t3` is 6,
the `6` of `0xB6`. That is how any field is taken out of a packed value: mask what you want, then
shift it down to the bottom if it was not there already. The constant of `andi` is 16 bits, so a
mask that reaches into the top half of a register goes through `li` and a register first.

The loop runs 32 times, once per bit, and does C's `count += n & 1; n >>= 1;`. `srl` is the shift
that brings zeroes in at the top. `sra` copies the sign bit down instead, which is what divides a
signed number by two, and here the register is a row of bits to take apart. `$t4` comes out at 5,
the number of ones in `10110110`. The M68K writes the same loop around its carry flag, shifting the
bottom bit into `C` and branching on it; here the masked bit is a number and `add $t4, $t4, $t7`
counts it without a branch.

`clz $t8, $t0` counts the leading zeroes, the run of 0 bits from the top down, and comes out at 24:
the highest set bit of 182 is bit 7, and there are 24 bits above it. That is how a program finds the
position of the top bit of a number in one instruction.

Try changing `li $t0, 182` to `li $t0, 183`, one more. `$t1` becomes 1 because the number is now
odd, `$t3` becomes 7, and `$t4` becomes 6.
