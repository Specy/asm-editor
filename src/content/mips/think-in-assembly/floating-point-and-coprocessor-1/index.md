Every number so far has been a whole one. `li $t0, 3` and `li $t0, 4` work; there is no value you
can put in `$t0` that means 3.75, because a 32 bit integer register counts and does not measure.

Measuring gets a second set of registers and its own instructions, which look like this:

```
    add.s $f4, $f0, $f2
```

Same three operand shape you already know, a different bank of registers, and a suffix saying what
kind of number it is working on.

They are separate for a reason that is now historical. The first MIPS chips did integers and nothing
else, and floating point was done in software, a few hundred instructions per multiplication, which
was hopeless for the graphics and engineering work the machines were sold for. So a second chip, the
**R2010**, sat beside the main one watching the same stream of instructions: the ones it recognised
it carried out while the main chip waited, and the rest it ignored. It had its own registers, which
the main chip could not name.

That arrangement is what **coprocessor** means, and MIPS numbers them. Coprocessor 1 is the floating
point unit, and coprocessor 0 is the one that holds the registers describing a fault, which the last
lecture of this course uses. Everything went onto one piece of silicon decades ago and the names
never changed, which is why the instructions that carry a value between the two banks are still
spelled `mtc1` and `mfc1`, move to and move from coprocessor 1.

## How a number is stored

A floating point number is three fields: a **sign** bit, an **exponent** and a **mantissa**, the
digits. The value is the mantissa times two to the power of the exponent, with the sign applied,
which is scientific notation written in binary.

| type   | bytes | directive | sign | exponent | mantissa | about             |
| ------ | ----- | --------- | ---- | -------- | -------- | ----------------- |
| float  | 4     | `.float`  | 1    | 8        | 23       | 7 decimal digits  |
| double | 8     | `.double` | 1    | 11       | 52       | 16 decimal digits |

Two consequences follow from the mantissa being binary.

**Most decimal fractions cannot be stored exactly.** 0.1 in binary repeats for ever, the way 1/3 does
in decimal, so what a float holds is the nearest representable number to 0.1, and 0.1 + 0.2 is not
0.3. That is not a fault in the hardware, it is what happens when a base 10 fraction is written in
base 2.

**Some values are not numbers.** An exponent of all ones means an **infinity** when the mantissa is
zero and a **NaN**, not a number, when it is not. One divided by zero is an infinity, zero divided by
zero is a NaN, and a NaN compared with anything, itself included, answers false.

## The 32 registers of coprocessor 1

`$f0` to `$f31`, 32 bits each, and they are not the `$t` and `$s` registers: `$f0` and `$t0` are two
different registers that happen to be numbered the same way.

The registers panel shows them on its own **FPU** tab, beside the CPU one. Its Format selector reads
each register as a double, as a single or as raw hex, because nothing in a register records which of
the three the program meant.

A **double is a pair**. `$f0` holds its low half and `$f1` its high half, so a program that works in
doubles uses only the even numbered registers and the odd ones are the halves it does not name. That
is why the panel's Double format leaves the odd rows blank, and why `l.d $f1, x` stops the run with
"first register must be even-numbered".

The convention for the names, which the hardware does not enforce:

| registers        | used for                                  |
| ---------------- | ----------------------------------------- |
| `$f0`, `$f2`     | return values                             |
| `$f4` to `$f10`  | temporaries, destroyed by a call          |
| `$f12`, `$f14`   | the first two floating point arguments    |
| `$f16`, `$f18`   | more temporaries                          |
| `$f20` to `$f30` | saved, so a subroutine must put them back |

## Loading, storing and arithmetic

Every instruction carries a suffix saying what it works on: `.s` for a single and `.d` for a double.

```mips|playground|fpu
.data
a:      .float 1.5
b:      .float 2.25
result: .float 0.0

.text
.globl main
main:
    l.s $f0, a              # load a single
    l.s $f2, b
    add.s $f4, $f0, $f2     # 3.75
    s.s $f4, result         # and store it back

    sub.s $f6, $f2, $f0     # 0.75
    mul.s $f8, $f0, $f2     # 3.375
    div.s $f10, $f2, $f0    # 1.5
    sqrt.s $f12, $f2        # 1.5, since 1.5 squared is 2.25
    neg.s $f14, $f0         # -1.5
    abs.s $f16, $f14        # 1.5 again

    li $v0, 10
    syscall
```

The FPU tab shows `$f4` at `3.75` and `$f6` at `0.75`. Now switch its Format to Hex: `$f4` reads
`40700000`. That is the same 3.75, and it is what the register has been holding all along. The
Format selector changes how the panel reads the bits and changes nothing in the machine, because
nothing in the register records which of the three readings you meant.

The shape is the one you already know: destination first, then the two operands. `l.s` and `s.s`
are the floating point load and store, and they address memory as `offset(base)`, exactly like `lw`
and `sw`.

Doubles are the same instructions with `.d`, and their registers move in twos.

```mips|playground|fpu
.data
a:      .double 1.5
b:      .double 2.25
result: .double 0.0

.text
.globl main
main:
    l.d $f0, a              # $f0 and $f1 together
    l.d $f2, b              # $f2 and $f3
    add.d $f4, $f0, $f2     # into $f4 and $f5
    s.d $f4, result

    li $v0, 10
    syscall
```

On the Double format `$f4` reads `3.75` and the odd rows are blank. Switch to Hex and the same value
is `$f4` at `00000000` and `$f5` at `40120000`, the low and high halves of one 64 bit number.

## Crossing the boundary

An integer register and a floating point register hold different encodings, so getting a number from
one to the other is two steps: move the bits, then convert them.

- **`mtc1 $t0, $f0`** copies 32 bits from an integer register into a floating point one, unchanged.
- **`mfc1 $t0, $f0`** copies them back, unchanged.
- **`cvt.s.w $f0, $f0`** reads `$f0` as an integer and writes the float with that value.
- **`cvt.w.s $f0, $f0`** goes the other way, rounding.
- **`cvt.d.s`** and **`cvt.s.d`** widen a single to a double and narrow it back.

Read the `cvt` names backwards: `cvt.s.w` converts **to** single **from** word.

```mips|playground|fpu
.data
n:      .word 7

.text
.globl main
main:
    lw $t0, n
    mtc1 $t0, $f0           # the bits of the integer 7, still an integer
    cvt.s.w $f2, $f0        # 7.0, which is 40E00000
    sqrt.s $f4, $f2         # 2.6457...
    cvt.w.s $f6, $f4        # back to an integer: 3, rounded
    mfc1 $t1, $f6

    li $v0, 10
    syscall
```

`$t1` is 3, not 2. The square root of 7 is about 2.65, and `cvt.w.s` rounds to nearest rather than
throwing the fraction away, which is the opposite of what most people expect a conversion to do. When
you want the fraction thrown away, `trunc.w.s` is the instruction. `ceil.w.s` and `floor.w.s` round
the two other ways.

`$f0` after the `mtc1` is worth a look on both formats. In Hex it reads `00000007`. In Single it
reads an absurdly small number, a hair above zero, because the bit pattern of the integer 7 is also
a perfectly valid float and happens to mean that. Nothing changed the bits. The two lines of the
program did two different things because `mtc1` copies and `cvt.s.w` converts, and telling those
apart is most of what goes wrong on this page.

## Comparing

Comparing two floats works differently from anything else you have written. Coprocessor 1 keeps
eight **condition flags** of its own, and a comparison writes one of them rather than writing a
register, so asking a question takes two instructions: one to compare, one to branch on the result.

- **`c.lt.s $f0, $f2`** sets condition flag 0 when `$f0` is less than `$f2`, and clears it
  otherwise.
- **`bc1t label`** branches when flag 0 is set, and **`bc1f label`** when it is clear.

The three comparisons are `c.eq`, `c.lt` and `c.le`, each in a `.s` and a `.d` form. For "greater
than", swap the operands and use `c.lt`, the same trick the integer branches use.

```mips|playground|fpu
.data
a:      .float 1.5
b:      .float 2.25

.text
.globl main
main:
    l.s $f0, a
    l.s $f2, b

    c.lt.s $f0, $f2         # is 1.5 < 2.25?
    bc1t yes
    li $t0, 0
    j after
yes:
    li $t0, 1
after:

    c.eq.s $f0, $f0         # is a equal to itself?
    bc1t same
    li $t1, 0
    j done
same:
    li $t1, 1
done:

    li $v0, 10
    syscall
```

`$t0` and `$t1` both end at 1. Step through it with the FPU tab open: the eight condition flags are
in their own row above the registers, and the one that flickers is flag 0.

`c.eq.s $f0, $f0` asks whether a number is equal to itself, which sounds like a waste of an
instruction and is not. A NaN is the one value for which the answer is no, so this is how a program
tests whether a calculation produced one.

The eight flags exist because a comparison may name which one it writes: `c.lt.s 1, $f2, $f0` writes
flag 1, and `bc1t 1, label` reads flag 1. Two comparisons can then be under way at once without
overwriting each other.

## Passing a float to a subroutine

The convention puts the first two floating point arguments in `$f12` and `$f14` and the answer in
`$f0`. The integer registers `$a0` to `$a3` carry the integer arguments as before, counted
separately.

```mips|playground|fpu
.data
x:      .float 3.0
y:      .float 4.0

.text
.globl main
main:
    l.s $f12, x             # the first argument
    l.s $f14, y             # the second
    jal hypot_squared       # $f0 = x*x + y*y
    sqrt.s $f2, $f0         # 5.0

    li $v0, 10
    syscall

# hypot_squared($f12, $f14) -> $f12 * $f12 + $f14 * $f14 in $f0
hypot_squared:
    mul.s $f0, $f12, $f12
    mul.s $f4, $f14, $f14
    add.s $f0, $f0, $f4
    jr $ra
```

`$f2` is 5.0, which is right for sides of 3 and 4. Notice that `hypot_squared` used `$f4` for its
working and never put it back: `$f4` is a temporary and the convention allows exactly that. Had it
wanted `$f20` or above, it would have owed the caller a save and a restore.

Printing a float is `syscall` service 2 with the value in `$f12`, and a double is service 3. Both are
in the "syscall" lecture with the rest.

## Your turn

`values` holds three floats. Add them up, divide by three, and leave the **bits** of the answer in
`$t1` with `mfc1`, since a testcase reads the integer registers. The three add up to 9.0, so the
answer is 3.0, whose bits are `0x40400000`.

```mips|playground|fpu|exercise
.data
values: .float 1.5, 3.25, 4.25
three:  .float 3.0

.text
.globl main
main:
    # your code here

    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t1": "0x40400000" }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|fpu|solution
.data
values: .float 1.5, 3.25, 4.25
three:  .float 3.0

.text
.globl main
main:
    la $t0, values
    l.s $f0, 0($t0)         # 1.5
    l.s $f2, 4($t0)
    add.s $f0, $f0, $f2     # + 3.25
    l.s $f2, 8($t0)
    add.s $f0, $f0, $f2     # + 4.25, so 9.0
    l.s $f4, three
    div.s $f0, $f0, $f4     # 3.0
    mfc1 $t1, $f0

    li $v0, 10
    syscall
```

</details>

The second one compares. Leave 1 in `$t0` when the float at `a` is less than the one at `b` and 0
when it is not, and leave 1 in `$t1` when `a` is a NaN and 0 when it is not. The data holds 1.5 and
2.5, so the answers are 1 and 0.

```mips|playground|fpu|exercise
.data
a:      .float 1.5
b:      .float 2.5

.text
.globl main
main:
    # your code here

    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": 1, "$t1": 0 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|fpu|solution
.data
a:      .float 1.5
b:      .float 2.5

.text
.globl main
main:
    l.s $f0, a
    l.s $f2, b

    li $t0, 1
    c.lt.s $f0, $f2         # a < b?
    bc1t less
    li $t0, 0
less:

    li $t1, 1
    c.eq.s $f0, $f0         # a equal to itself? only a NaN is not
    bc1f isnan
    li $t1, 0
isnan:

    li $v0, 10
    syscall
```

</details>
