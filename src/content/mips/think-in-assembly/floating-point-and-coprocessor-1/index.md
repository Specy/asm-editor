A register holds bits. An instruction decides what those bits mean.

For example, a CPU register can hold `0x40700000`. An integer instruction reads that pattern as the
integer 1081081856. The same pattern is the single precision floating point encoding of 3.75, but
`add` still performs integer addition on it. Floating point arithmetic uses its own registers and
instructions.

Here is a complete first example:

```mips|playground|fpu
.data
left:   .float 1.5
right:  .float 2.25
sum:    .float 0.0

.text
.globl main
main:
    l.s $f0, left
    l.s $f2, right
    add.s $f4, $f0, $f2
    s.s $f4, sum

    li $v0, 10
    syscall
```

`l.s` loads each input into a floating point register, `add.s` adds them, and `s.s` stores the
answer. Open the FPU register tab and `$f4` reads 3.75. In Hex format it reads `40700000`: the same
bits, displayed with a different interpretation.

The floating point unit is traditionally called **Coprocessor 1** in MIPS. Early MIPS systems could
put floating point work on a separate coprocessor chip; modern implementations usually integrate
it with the CPU, but the name remains in the instruction set. That history explains the separate
`$f` registers and instruction names such as `mtc1`, which we will use shortly.

## Singles, doubles, and their bits

The `.float` directive writes a 4 byte **single precision** value into memory. The `.double`
directive writes an 8 byte **double precision** value:

```mips
.data
radius:    .float 2.5
distance:  .double 12345.125
```

For a normal, finite IEEE 754 value, the stored bits have three jobs:

- the **sign** bit chooses positive or negative;
- the **exponent** scales the value by a power of two;
- the **significand** holds the significant binary digits.

| format | bytes | sign bits | exponent bits | stored fraction bits | approximate precision |
| ------ | ----: | --------: | ------------: | -------------------: | --------------------: |
| single |     4 |         1 |             8 |                   23 |      7 decimal digits |
| double |     8 |         1 |            11 |                   52 |     16 decimal digits |

You do not need to memorize the field widths. The practical point is that the significand has a
fixed size. Many decimal fractions, including 0.1, have no finite binary representation, so the
machine stores a nearby representable value. A sequence of calculations can therefore finish a
little above or below the result you would get with exact decimal arithmetic.

Some exponent patterns have special meanings. With the exponent bits all set, a zero fraction
encodes positive or negative **infinity**. A nonzero fraction encodes **NaN** (not a number).
Infinity is a value distinct from NaN. NaN is _unordered_: the ordinary comparisons in this lesson
are false when either operand is NaN.

Many instructions that interpret floating point encodings carry a format suffix. `.s` means single
and `.d` means double, so `add.s` adds singles and `add.d` adds doubles. Bit-copy instructions such
as `mtc1` and branch instructions such as `bc1t` do not use that suffix.

## Floating point registers

Coprocessor 1 has 32 registers, `$f0` through `$f31`. Each is 32 bits wide and is separate from the
CPU register file: `$f0` and `$t0` are unrelated registers.

A single fits in one `$f` register. In this Playground, a double occupies an even/odd pair: the even
register contains the low 32 bits and the following odd register contains the high 32 bits. For
example, a double loaded into `$f4` occupies `$f4` and `$f5`. Double instructions name the even
register.

The Playground's FPU tab can display the registers as Single, Double, or Hex. Its Double view shows
the combined value on the even row and leaves the odd row blank. These low/high and display details
describe this Playground; other MIPS tools and targets can present register pairs differently.

## Loading, storing, and calculating

The usual single precision arithmetic instructions have the familiar destination-first shape:

```mips
add.s  $f4, $f0, $f2    # $f4 = $f0 + $f2
sub.s  $f4, $f0, $f2    # $f4 = $f0 - $f2
mul.s  $f4, $f0, $f2    # $f4 = $f0 * $f2
div.s  $f4, $f0, $f2    # $f4 = $f0 / $f2
sqrt.s $f4, $f0         # $f4 = square root of $f0
```

Use the `.d` forms with doubles. The data format has to match the instruction: `add.s` reads one
32 bit single from each named register, while `add.d` reads two 64 bit register pairs.

`l.s` and `s.s` use the same base-plus-offset addressing you know from `lw` and `sw`. Each single
takes 4 bytes, so adjacent elements of a float array are 4 bytes apart:

```mips|playground|fpu
.data
values: .float 1.5, 2.25, 0.0

.text
.globl main
main:
    la $t0, values
    l.s $f0, 0($t0)
    l.s $f2, 4($t0)
    add.s $f4, $f0, $f2
    s.s $f4, 8($t0)

    li $v0, 10
    syscall
```

After the store, the third array element is 3.75. The corresponding double instructions are `l.d`
and `s.d`; adjacent doubles are 8 bytes apart.

## Copying bits and converting values

There are two different ways for a value to cross between the CPU and FPU register files.

- `mtc1 $t0, $f0` copies 32 bits from `$t0` to `$f0` unchanged.
- `mfc1 $t0, $f0` copies 32 bits from `$f0` to `$t0` unchanged.
- `cvt.s.w $f2, $f0` reads a 32 bit integer in `$f0` and writes the single precision value with the
  same numeric value.
- `cvt.w.s $f2, $f0` reads a single in `$f0` and writes a 32 bit integer encoding into `$f2`.

Read a conversion name as “convert to the first format from the second.” In `cvt.s.w`, `.s` is the
destination format and `.w` is a 32 bit integer word.

```mips|playground|fpu
.text
.globl main
main:
    li $t0, 7
    mtc1 $t0, $f0           # $f0 now contains the unchanged bits 00000007
    cvt.s.w $f2, $f0        # $f2 now contains the encoding of 7.0
    sqrt.s $f4, $f2         # about 2.64575
    cvt.w.s $f6, $f4        # integer 3 in the default rounding mode
    mfc1 $t1, $f6           # copy that integer encoding back to the CPU

    li $v0, 10
    syscall
```

At the end, `$t1` is 3. In this Playground's default rounding mode, `cvt.w.s` rounds to the nearest
integer. `mtc1` and `mfc1` never perform that numeric conversion: they preserve the bit pattern.
That distinction matters when you want to inspect a float as hex, as the first exercise does.

## Comparing and branching

A floating point comparison records a true or false condition inside Coprocessor 1. A following
`bc1t` branches when that condition is true; `bc1f` branches when it is false.

```mips|playground|fpu
.data
a: .float 1.5
b: .float 2.25

.text
.globl main
main:
    l.s $f0, a
    l.s $f2, b

    c.lt.s $f0, $f2         # is a < b?
    bc1t less
    li $t0, 0               # false path
    j compared
less:
    li $t0, 1               # true path
compared:

    li $v0, 10
    syscall
```

Here `c.lt.s` means “compare less than, as singles,” so the true path leaves 1 in `$t0`. The other
common forms are `c.eq.s` for equal and `c.le.s` for less than or equal. Their double precision
forms end in `.d`.

A false ordered comparison does not always mean “greater than or equal.” If either operand is NaN,
`c.eq.s`, `c.lt.s`, and `c.le.s` all produce false. That rule gives a compact NaN check:

```mips
    c.eq.s $f0, $f0         # every non-NaN value equals itself
    bc1f value_is_nan
```

This lesson uses the default comparison condition selected by the two-operand form. MIPS can name
additional floating point condition flags, but one compare followed by one branch is enough for the
ordinary control flow here.

## The course calling convention

We can extend the simplified calling convention used in this course to floating point code:

| registers                   | course convention                                     |
| --------------------------- | ----------------------------------------------------- |
| `$f12`, `$f14`              | first two floating point arguments                    |
| `$f0`                       | single precision result                               |
| `$f4`–`$f10`, `$f16`–`$f18` | temporaries a callee may change                       |
| `$f20`–`$f30`               | saved registers a callee must restore if it uses them |

A double result occupies the `$f0`/`$f1` pair in this Playground. This table is the convention for
this course, not a universal MIPS ABI; real systems choose conventions for their architecture and
toolchain.

```mips|playground|fpu
.data
x: .float 3.0
y: .float 4.0

.text
.globl main
main:
    l.s $f12, x
    l.s $f14, y
    jal squared_length
    sqrt.s $f2, $f0         # 5.0

    li $v0, 10
    syscall

# squared_length($f12, $f14) -> $f0
squared_length:
    mul.s $f0, $f12, $f12
    mul.s $f4, $f14, $f14
    add.s $f0, $f0, $f4
    jr $ra
```

The subroutine may change `$f4` because it is a temporary under this course convention. A
subroutine that uses `$f20` would save and restore it, just as it does for the saved CPU registers.

## Your turn

`values` holds four adjacent singles. Load them with base-plus-offset addresses, add them, divide
the total by `four`, and use `mfc1` to leave the **bits** of the average in `$t1`. The test reads the
CPU register, so a numeric conversion with `cvt.w.s` would produce the wrong result.

```mips|playground|fpu|exercise
.data
values: .float 1.5, 2.25, 3.75, 3.5
four:   .float 4.0

.text
.globl main
main:
    # your code here

    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t1": "0x40300000" }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|fpu|solution
.data
values: .float 1.5, 2.25, 3.75, 3.5
four:   .float 4.0

.text
.globl main
main:
    la $t0, values
    l.s $f0, 0($t0)
    l.s $f2, 4($t0)
    add.s $f0, $f0, $f2
    l.s $f2, 8($t0)
    add.s $f0, $f0, $f2
    l.s $f2, 12($t0)
    add.s $f0, $f0, $f2
    l.s $f4, four
    div.s $f0, $f0, $f4
    mfc1 $t1, $f0

    li $v0, 10
    syscall
```

</details>

The second exercise checks both outcomes of an ordinary comparison and then checks a supplied NaN.
For each comparison, follow the branch on one outcome and fall through on the other:

- leave 11 in `$t0` when `low < high`, otherwise leave 22;
- leave 33 in `$t1` when `large < small`, otherwise leave 44;
- leave 55 in `$t2` when `not_a_number` is NaN, otherwise leave 66.

The `.word` directive supplies the standard quiet-NaN bit pattern. `l.s` loads those bits for the
self-comparison; it does not matter that the data was written with `.word` rather than `.float`.

```mips|playground|fpu|exercise
.data
low:          .float -1.25
high:         .float 4.5
large:        .float 8.0
small:        .float 2.0
not_a_number: .word 0x7FC00000

.text
.globl main
main:
    # your code here

    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": 11, "$t1": 44, "$t2": 55 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|fpu|solution
.data
low:          .float -1.25
high:         .float 4.5
large:        .float 8.0
small:        .float 2.0
not_a_number: .word 0x7FC00000

.text
.globl main
main:
    l.s $f0, low
    l.s $f2, high
    c.lt.s $f0, $f2
    bc1t first_true
    li $t0, 22
    j second_test
first_true:
    li $t0, 11

second_test:
    l.s $f4, large
    l.s $f6, small
    c.lt.s $f4, $f6
    bc1t second_true
    li $t1, 44
    j nan_test
second_true:
    li $t1, 33

nan_test:
    l.s $f8, not_a_number
    c.eq.s $f8, $f8
    bc1f is_nan
    li $t2, 66
    j done
is_nan:
    li $t2, 55
done:

    li $v0, 10
    syscall
```

</details>
