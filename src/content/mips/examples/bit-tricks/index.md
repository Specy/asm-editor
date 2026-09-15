Four questions about one number, none of them answered with arithmetic. Is 182 odd, what is it times
eight, what are its bottom four bits, and how many of its 32 bits are ones. The answers land in
`$t1` to `$t4`.

Every program up to here has treated a register as a number. These four treat the same register as
32 bits side by side, which is the other way to read one and often the cheaper way.

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

`andi $t1, $t0, 1` keeps the lowest bit of the number and clears the other 31, and the lowest bit
of a number is exactly what says whether it is odd. So `$t1` is 0 here, because 182 is even, and it
would be 1 for an odd number. The answer is not a hint you then have to convert: it is already the
0 or the 1 you wanted, ready to be branched on, added up or stored.

Shifting left by three multiplies by eight, since every place a bit moves left doubles what it is
worth, so `$t2` ends at 1456, which is 182 times 8. The shift amount is five bits, so 0 to 31, and
`sllv` takes it from a register when the program worked it out.

`andi $t3, $t0, 0xF` keeps the four bits the mask has set and clears everything else, so `$t3` is 6,
the `6` of `0xB6`. That is how any field is taken out of a packed value: mask what you want, then
shift it down to the bottom if it was not there already. The constant of `andi` is 16 bits, so a
mask that reaches into the top half of a register goes through `li` and a register first.

The loop runs 32 times, once per bit. Each pass keeps the lowest bit, adds it to the count, and
shifts the number down one place so that the next bit takes its turn at the bottom.

`srl` is the right shift that brings zeroes in at the top, and it is the one you want here. `sra`
would copy the sign bit down instead, which is correct when the register holds a negative number and
wrong when the register is a row of bits you are taking apart: with `sra`, a number with its top bit
set would never shift down to zero and the count would come out wrong.

`$t4` is 5, the number of ones in `10110110`. Notice there is no branch anywhere in the counting.
`add $t4, $t4, $t7` works because the masked bit is already a 0 or a 1, so adding it and counting it
are the same thing.

`clz $t8, $t0` counts the leading zeroes, the run of 0 bits from the top down, and answers 24:
the highest set bit of 182 is bit 7, and there are 24 bits above it. That is how a program finds the
position of the top bit of a number in one instruction.

Change `li $t0, 182` to `li $t0, 183` and three answers move at once: `$t1` becomes 1 because the
number is now odd, `$t3` becomes 7 because the low four bits changed, and `$t4` becomes 6 because
one more bit is set. One added to a number, and every one of those is reading the same single bit
that changed.
