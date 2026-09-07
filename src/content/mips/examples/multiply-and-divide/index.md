Two unit conversions, one in each direction. The first turns 365 days into hours with a `mult`, and
the second turns 1000 seconds into 16 minutes and 40 seconds with a `div`, which answers both
questions at once.

Every program up to here added and subtracted. These two instructions are the ones with rules of
their own, and the rules are about where the answer lands: neither of them writes a register you
named.

**You need to know:** the "Arithmetic, logic and bits" lecture. What is new here is `hi` and `lo`,
two registers outside the 32 that only multiplication and division write, and the `mfhi` and `mflo`
instructions that copy them into a register you can use.

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
half in `hi` and the bottom half in `lo`. `$t2` comes out at `00002238`, which is 8760, and `$t3` at
0, because 8760 needs 14 bits and there is nothing to put above them.

`div` writes the same pair with the **quotient in `lo`** and the **remainder in `hi`**, so one
instruction answers "how many whole minutes" and "how many seconds are left" together. `$t6` is 16
and `$t7` is 40. The M68K packs those two answers into the two halves of one register and needs a
`swap` and two masks to get at them; here they are in two registers already and the only cost is one
`mfhi` or `mflo` each.

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

Try changing `li $t0, 365` to `li $t0, 65901`. `$t2` comes out at `00182238`, which is 1581624, the
right answer for 65901 times 24. The M68K's `mulu` answers 8760 to that same change, because it only
reads the low 16 bits of its operand; `mult` reads all 32 of them.
