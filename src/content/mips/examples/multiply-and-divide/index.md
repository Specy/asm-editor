These two conversions go in opposite directions. The first turns 365 days into hours by
multiplying, and the second turns 1000 seconds into 16 whole minutes with 40 seconds left by
dividing.

The two-operand forms of `mult` and `div` have implicit destinations: they write the special
registers `hi` and `lo`, rather than either register named in the instruction.

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

`mult $t0, $t1` treats both operands as signed 32 bit integers and forms a 64 bit product. Its
upper word goes to `hi` and its lower word goes to `lo`; `mfhi` and `mflo` copy those words into
ordinary registers. `div $t4, $t5` is signed too. It puts the quotient in `lo` and the remainder in
`hi`, so one division produces both parts of the conversion.

The special registers change after each operation:

| After               | `hi` | `lo` | Ordinary destination |
| ------------------- | ---: | ---: | -------------------- |
| `mult $t0, $t1`     |    0 | 8760 | none                 |
| `mul $t8, $t0, $t1` |    0 | 8760 | `$t8 = 8760`         |
| `div $t4, $t5`      |   40 |   16 | none                 |

Read `hi` and `lo` before the next multiply or divide replaces them. This program deliberately
does its three-operand `mul` before the final `div`, so the registers panel finishes with the useful
quotient and remainder, `lo = 16` and `hi = 40`.

In this Playground, `mul $t8, $t0, $t1` is a real signed three-operand instruction. It writes the
low 32 bits to `$t8` and, as the table shows, also updates `hi` and `lo` with the 64 bit product. It
does not report when the destination lost upper bits. For an unsigned product, or a product known
to be nonnegative, a nonzero `hi` proves that keeping only the low word truncated the answer.
Signed products need the full sign-extension check: `hi` must be 0 when the low word is nonnegative
and -1 when it is negative. For example, `-2 * 3` fits in one signed word even though its 64 bit
product has `hi = -1`.

The `u` suffix changes interpretation, not the register layout. `multu` and `divu` treat the same
32 bits as unsigned; `mult` and `div` treat them as signed. Predict this before trying it: with -7
in one register and 3 in another, signed `div` produces quotient -2 and remainder -1, while `divu`
reads the first bit pattern as 4294967289 and produces quotient 1431655763 and remainder 0.

There are two division edge cases to guard. In this Playground, two-operand `div` and `divu` with
a zero divisor leave `hi` and `lo` unchanged. A following `mflo` or `mfhi` therefore reads the
previous operation's result. The three-operand `div $t2, $t0, $t1` and
`rem $t2, $t0, $t1` pseudo-instructions add a runtime zero check and execute `break` when that
check fails. Also, signed `0x80000000 / -1` produces `lo = 0x80000000` and `hi = 0` here; that
overflow result is not portable across MIPS implementations, so portable code checks that pair of
operands first.

Change the day count from 365 to 65901 and predict `$t2` and `$t8` before selecting **Run**. Both
become 1581624, and `hi` is still 0 immediately after either multiplication because the product
fits. The final division still replaces `hi` and `lo` with 40 and 16.
