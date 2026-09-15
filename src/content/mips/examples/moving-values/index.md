Two numbers go into registers, the program works out the perimeter of the rectangle they describe,
and the answer stays in `$t2`. Nothing is read from memory and nothing branches: every value is in a
register from the first instruction to the last, which is what the registers panel next to the
program shows you.

```mips|playground|allow-open
.text
main:
    li $t0, 30          # width = 30
    li $t1, 12          # height = 12
    add $t2, $t0, $t1   # half = width + height
    add $t2, $t2, $t2   # perimeter = half + half

    move $t3, $t2       # a copy of the answer
    add $t4, $t2, $zero # the same copy, written out
    sub $t5, $t0, $t1   # how much wider than tall it is
```

`li $t0, 30` puts the number 30 into `$t0`, and there is no `#` in front of it: an operand that is a
number is a number, and an operand that is a register has a `$`. The two `add` instructions between
them work out twice the width plus twice the height, and `add $t2, $t2, $t2` adds a register to
itself, which is how you double a number without a multiplication.

The reason the perimeter fits in two instructions is that `add $t2, $t0, $t1` names its destination
separately. `$t0` finishes holding 30 and `$t1` holding 12, exactly as they started, so the width
and the height are still there to be used again. On a machine where one operand had to double as the
destination, that same sum would have cost a copy first.

`$t2`, `$t3` and `$t4` all hold the same answer, by three routes. `move $t3, $t2` is a
pseudo-instruction, and `add $t4, $t2, $zero` on the line under it is exactly what the assembler
turns it into: adding a register that always reads 0 copies whatever you added it to.

`sub $t5, $t0, $t1` is 30 minus 12. Write the two sources the other way round and you get -18, which
the panel shows as `FFFFFFEE`: the destination is fixed as the first operand, but the order of the
two after it decides which way round the subtraction goes.
