Two unit conversions, one in each direction. The first turns 365 days into hours with a `mult`, and
the second turns 1000 seconds into 16 minutes and 40 seconds with a `div`, which answers both
questions at once.

Multiplication and division are the two instructions with rules of their own, and the rules are all
about where the answer lands: neither of them writes a register you named.

```mips|playground|allow-open
.text
main:
    li $t0, 365         # days = 365
    li $t1, 24
    mult $t0, $t1       # the product, in hi and lo
    mflo $t2            # hours = days * 24
    mfhi $t3            # the top half of the product

    li $t4, 1000        # seconds = 1000
    li $t5, 60
    div $t4, $t5        # both answers at once
    mflo $t6            # whole minutes
    mfhi $t7            # the seconds left over

    mul $t8, $t0, $t1   # the same multiplication in one instruction
```

`mult` multiplies two whole 32 bit registers and writes the 64 bit product into the pair, the top
half in `hi` and the bottom half in `lo`. `$t2` holds 8760, the whole answer, and `$t3` is
0, because 8760 needs 14 bits and there is nothing to put above them.

`div` writes the same pair with the **quotient in `lo`** and the **remainder in `hi`**, so one
instruction answers "how many whole minutes" and "how many seconds are left over" at the same time.
`$t6` is 16 and `$t7` is 40. Getting either of them costs one `mflo` or `mfhi`, and taking both
costs both: there is no way to reach `hi` or `lo` except through those two instructions.

Read them before the next multiplication or division. `hi` and `lo` hold whatever the last one left
there, and they are at the bottom of the registers panel with `pc`, which is where you can watch
them change.

`mul $t8, $t0, $t1` is the three operand form and it is a real instruction: it writes the low 32
bits of the product straight into the register you name, and updates `hi` and `lo` as well. When the
answer fits in a word, which is nearly always, it is the one to write.

`div $t0, $t1` with a zero in `$t1` does not stop the program and does not change `hi` and `lo`, so
`mflo` after it gives you whatever was there before. The three operand `div $t2, $t0, $t1` and
`rem $t2, $t0, $t1` are pseudo-instructions that build the check in and stop the program with
`break instruction executed` instead.

Change `li $t0, 365` to `li $t0, 65901` and the answer in `$t2` becomes 1581624, which is right.
That number needs 21 bits, so it still fits in `lo` alone and `hi` is still 0. Push the operands
higher and the day comes when `hi` is not 0 any more, and a program that only ever reads `lo` is
then quietly answering with the bottom half of the truth.
