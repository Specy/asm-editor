MIPS has two special result registers, `hi` and `lo`. They are separate from ordinary registers such
as `$t0`: multiply and divide write them automatically, and `mfhi` and `mflo` copy their contents
into ordinary registers. Think of the path as `mult` or `div` → `hi` and `lo` → `mfhi` and `mflo` →
`$t` registers.

This program turns 365 days into hours, then turns 1000 seconds into whole minutes and seconds
left over. Select **Build**, then **Step** through each calculation and watch the registers change.

```mips|playground|tests|allow-open
.text
main:
    li $t0, 365         # days = 365
    li $t1, 24
    mult $t0, $t1       # signed 64-bit product in hi:lo
    mflo $t2            # hours = days * 24
    mfhi $t3            # upper half of the product

    mul $t8, $t0, $t1   # low word straight into $t8; also updates hi:lo

    li $t4, 1000        # seconds = 1000
    li $t5, 60
    div $t4, $t5        # signed quotient in lo, remainder in hi
    mflo $t6            # whole minutes
    mfhi $t7            # seconds left over

    li $v0, 10          # exit
    syscall
```

```testcase
{
    "expectedRegisters": {
        "$t2": 8760,
        "$t3": 0,
        "$t6": 16,
        "$t7": 40,
        "$t8": 8760,
        "$v0": 10
    }
}
```

`mult $t0, $t1` multiplies the two 32-bit values. Its complete product can take 64 bits, so the
upper 32 bits go into `hi` and the lower 32 bits go into `lo`. Here 365 × 24 is 8760, which fits
in the lower half. `mflo $t2` copies 8760 into `$t2`, while `mfhi $t3` copies 0 into `$t3`.
Neither instruction changes `hi` or `lo`.

`div $t4, $t5` divides 1000 by 60. It puts the whole-number **quotient** in `lo` and the
**remainder** in `hi`. Since 1000 = 60 × 16 + 40, `mflo $t6` copies 16 whole minutes and
`mfhi $t7` copies the 40 seconds left over.

Before looking at the table, predict what will happen if the seconds value is **367** instead of 1000. How many whole minutes and leftover seconds will `mflo` and `mfhi` copy?

| After               | `hi` | `lo` | Ordinary destination |
| ------------------- | ---: | ---: | -------------------- |
| `mult $t0, $t1`     |    0 | 8760 | none                 |
| `mul $t8, $t0, $t1` |    0 | 8760 | `$t8 = 8760`         |
| `div $t4, $t5`      |   40 |   16 | none                 |

The middle row uses a different instruction. The two-operand `mult $t0, $t1` writes the product to
`hi:lo`; you use `mflo` or `mfhi` to copy it out. The three-operand `mul $t8, $t0, $t1` puts the
low 32 bits directly in `$t8`. In this Playground, `mul` also writes the product to `hi:lo`, as
the table shows. Its direct result here is 8760, the same value copied into `$t2` earlier.

Every multiply or divide in this program replaces `hi` and `lo`. That is why the program copies
the first product into `$t2` and `$t3` before `mul`, and copies the division results into `$t6`
and `$t7` before doing anything else with those special registers.

Now select **Open in editor** on the program and change only `li $t4, 1000` to `li $t4, 367`.
Select **Build**, then **Run**, and check your prediction: `$t6` is **6** and `$t7` is **7**, because
367 = 60 × 6 + 7. The embedded **Test** checks the original 1000-second program, so use **Run**
for this changed value. Restore 1000 if you want to use **Test** again.

If a divisor might be zero, check it with a branch before `div`: division by zero has no quotient
or remainder to copy.

<details>
<summary>Explore further: signed, unsigned, and products that need two words</summary>

`mult` and `div` treat their inputs as **signed** 32-bit values. `multu` and `divu` use the same
registers and result layout, but treat those input bits as **unsigned**. Positive values in this
example give the same answers either way. With -7 and 3, signed `div` gives quotient -2 and
remainder -1. `divu` instead treats -7's bits as 4294967289, giving quotient 1431655763 and
remainder 0.

`mul` keeps only the low word in its ordinary destination. A nonzero `hi` proves that a
nonnegative or unsigned product needed more than that word. For signed products, a negative
result that fits can have `hi = -1`: the upper half is filled with copies of the sign bit. For
example, -2 × 3 is -6 and fits in one signed word even though the full product has `hi = -1`.
To check whether a signed product fits, `hi` must be 0 when the low word's sign bit is 0, or -1
when that bit is 1.

</details>
