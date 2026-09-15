Every number in this course so far has been an integer. This lecture is the other kind, and the 32
registers and the set of instructions that work on it, which RISC-V keeps separate from the integer
side on purpose.

## Two extensions, and why they are optional

Arithmetic on fractions costs a great deal more hardware than arithmetic on whole numbers, and
plenty of processors are built into things that never need it: a washing machine controller, a
sensor, a keyboard. So RISC-V leaves it out of the base and offers it as two named extensions. **F**
adds 32 floating point registers and single precision arithmetic. **D** widens those registers to 64
bits and adds double precision. A chip with neither is still a RISC-V chip, and the assembler here
has both.

Being a separate extension has a visible consequence: floating point gets a **second set of
registers** of its own, with its own instructions, and two instructions whose only job is to carry
raw bits between the two sets.

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

## The 32 f registers

`f0` to `f31`, named the way the integer registers are and with a convention of the same shape:

| registers       | name      | used for                                                             |
| --------------- | --------- | -------------------------------------------------------------------- |
| `ft0` to `ft11` | temporary | destroyed by a call                                                  |
| `fs0` to `fs11` | saved     | a subroutine must put them back                                      |
| `fa0` to `fa7`  | argument  | the first eight floating point arguments, and `fa0` the return value |

They are not the integer registers. `ft0` and `t0` are two different registers, and an instruction
names one file or the other, never both, apart from the four that exist to cross between them.

The registers panel shows them on its own **FPU** tab, in register number order, so `ft0` to `ft7`
come first, then `fs0` and `fs1`, then `fa0` to `fa7`, then the rest. Its Format selector reads each
one as a double, as a single or as raw hex, because nothing in a register records which of the three
the program meant.

With the D extension every one of those registers is **64 bits** wide, because that is what a double
needs. Which raises a question: a single is only 32 bits, so what goes in the other half?

Zeroes would be the obvious answer and they are the wrong one. Nothing in a register records whether
the program meant a single or a double, so if the top half were zeroes, an instruction that read the
register as a double would find a perfectly plausible number there and carry on with it. You would
get a wrong answer and no hint that anything had happened.

So a single is stored with the top 32 bits **all ones**, and those bits read as a double are a NaN,
a value that is not a number. Anything that then treats it as a double produces a NaN, which spreads
through every calculation it touches and is impossible to mistake for an answer. The technique has a
name, **NaN boxing**: a value wrapped in a box that is obviously rubbish if you open it the wrong
way.

It is also why the registers panel opens on the Double format. Read a register holding a double in
Single and you get a NaN, for exactly the same reason in reverse.

## Loading, storing and arithmetic

Every instruction carries a suffix: `.s` for a single and `.d` for a double.

```riscv|playground|fpu
.data
a:      .float 1.5
b:      .float 2.25
result: .float 0.0

.text
.globl main
main:
    la t0, a
    flw ft0, 0(t0)          # load a single
    flw ft1, 4(t0)
    fadd.s ft2, ft0, ft1    # 3.75
    fsw ft2, 8(t0)          # and store it back

    fsub.s ft3, ft1, ft0    # 0.75
    fmul.s ft4, ft0, ft1    # 3.375
    fdiv.s ft5, ft1, ft0    # 1.5
    fsqrt.s ft6, ft1        # 1.5, since 1.5 squared is 2.25
    fneg.s ft7, ft0         # -1.5
    fabs.s fs0, ft7         # 1.5 again

    li a7, 10
    ecall
```

Switch the FPU tab's Format to **Single** and `ft2` reads `3.75`, `ft3` reads `0.75` and the rest
follow. On Hex it is `FFFFFFFF40700000`: the `40700000` is 3.75 and the ones above it are the NaN box.
On Double every one of them reads NaN, which is the box doing its job.

`flw` and `fsw` load and store a single, `fld` and `fsd` a double, and their addressing mode is
`offset(base)` like `lw` and `sw`. There is no `la`-style pseudo-instruction that loads a float from
a label in one line, so the address goes into an integer register first.

`fneg.s` and `fabs.s` are pseudo-instructions. Both are really `fsgnj`, sign injection, which builds a
result from the bits of one register and the sign of another: `fneg.s ft7, ft0` is
`fsgnjn.s ft7, ft0, ft0`, the value of `ft0` with its own sign flipped. There is no negate
instruction because there does not need to be one.

Doubles are the same instructions with `.d`.

```riscv|playground|fpu
.data
a:      .double 1.5
b:      .double 2.25
result: .double 0.0

.text
.globl main
main:
    la t0, a
    fld fa0, 0(t0)
    fld fa1, 8(t0)
    fadd.d fa2, fa0, fa1    # 3.75
    fsd fa2, 16(t0)

    li a7, 10
    ecall
```

On the Double format `fa2` reads `3.75`, and on Hex it is `400E000000000000`, the whole 64 bits in
use with no box.

## Crossing between the files

Four instructions move between the two register files, and they divide into moves and conversions.

- **`fmv.x.w t0, ft0`** copies 32 bits out of a floating point register, unchanged.
- **`fmv.w.x ft0, t0`** copies them back, unchanged.
- **`fcvt.s.w ft0, t0`** reads `t0` as an integer and writes the float with that value.
- **`fcvt.w.s t0, ft0`** goes the other way, rounding.

Read the names backwards: `fcvt.s.w` converts **to** single **from** word, and `fmv.x.w` moves **to**
an integer register **from** a word sized float. `fcvt.d.w`, `fcvt.s.d` and `fcvt.d.s` are the rest of
the family.

Which way a conversion rounds is written on the instruction. Leave it off and it follows the rounding
mode in `frm`, which starts as round to nearest, so `fcvt.w.s` turns 2.6 into 3. Write `rtz`, round
towards zero, and it truncates instead, throwing the fraction away and keeping the whole part.

```riscv|playground|fpu
.data
n:      .word 7

.text
.globl main
main:
    la t0, n
    lw t1, 0(t0)
    fcvt.s.w ft0, t1        # 7.0, which is 40E00000
    fsqrt.s ft1, ft0        # 2.6457...
    fcvt.w.s t2, ft1        # back to an integer: 3, rounded to nearest
    fcvt.w.s t3, ft1, rtz   # or 2, truncated
    fmv.x.w t4, ft1         # or the raw bits, unconverted

    li a7, 10
    ecall
```

`t2` comes out at 3 and `t3` at 2 from the same register, because the first one rounded and the
second was told not to. `t4` holds `402953FD`, the bits of 2.6457 rather than its value.

## Comparing writes an integer register

A floating point comparison writes **1 or 0 into an integer register**, exactly the way `slt` does
for whole numbers, and the branch after it is the ordinary `bnez` you already know. The two sets of
registers meet here: the question is about floating point values, the answer is an integer, and no
new branch instruction is needed.

- **`flt.s t0, ft0, ft1`** sets `t0` to 1 when `ft0 < ft1`.
- **`fle.s`** and **`feq.s`** are the other two.

There is no `fgt`: swap the operands. There is no `fne` either: use `feq` and branch on zero.

```riscv|playground|fpu
.data
a:      .float 1.5
b:      .float 2.25

.text
.globl main
main:
    la t0, a
    flw ft0, 0(t0)
    flw ft1, 4(t0)

    flt.s t1, ft0, ft1      # is 1.5 < 2.25? 1
    fle.s t2, ft1, ft0      # is 2.25 <= 1.5? 0
    feq.s t3, ft0, ft0      # is a equal to itself? 1

    bnez t1, less
    li t4, 200
    j done
less:
    li t4, 100
done:

    li a7, 10
    ecall
```

`feq.s ft0, ft0`, asking whether a number is equal to itself, is not the silly question it looks
like. It comes out false for a NaN and true for everything else, which makes it the way you test for
one.

## The fcsr

Floating point arithmetic has state that a register cannot hold: which way to round, and what has
gone wrong since anybody last looked. RISC-V puts both in a **control and status register**, `fcsr`,
which the registers panel shows on its **CSR** tab.

`fcsr` is two fields. Bits 7 to 5 are `frm`, the rounding mode, and bits 4 to 0 are `fflags`, the
five accrued exception flags:

| bit | flag | set when                                       |
| --: | ---- | ---------------------------------------------- |
|   4 | NV   | invalid, such as the square root of a negative |
|   3 | DZ   | divided by zero                                |
|   2 | OF   | the result was too large for the type          |
|   1 | UF   | too small                                      |
|   0 | NX   | inexact: the true answer needed more mantissa  |

They **accrue**: nothing clears them, so a flag says that something happened at some point, not that
it happened in the last instruction.

```riscv|playground|csr
.data
n:      .word 7

.text
.globl main
main:
    la t0, n
    lw t1, 0(t0)
    fcvt.s.w ft0, t1        # 7.0, exact
    frflags t2              # nothing has gone wrong yet: 0

    fsqrt.s ft1, ft0        # 2.6457..., which no float holds exactly
    frflags t3              # NX: 1
    frcsr t4                # the whole register

    li a7, 10
    ecall
```

`t2` is 0 and `t3` is 1, the inexact flag, set because the square root of 7 is irrational and what
`ft1` holds is the nearest float to it. Almost every real floating point program has NX set within a
few instructions, which is why it is the one flag nobody checks.

The CSR tab shows `fflags` and `fcsr` moving together. `frflags`, `frrm` and `frcsr` read the three
views, `fsflags`, `fsrm` and `fscsr` write them, and they are all pseudo-instructions for `csrrs` and
`csrrw` on CSR numbers 1, 2 and 3.

## Passing a float to a subroutine

Floating point arguments go in `fa0` to `fa7` and the result comes back in `fa0`, counted separately
from the integer arguments in `a0` to `a7`. So a subroutine taking an integer and two doubles finds
the integer in `a0` and the doubles in `fa0` and `fa1`.

```riscv|playground|fpu
.data
x:      .float 3.0
y:      .float 4.0

.text
.globl main
main:
    la t0, x
    flw fa0, 0(t0)          # the first argument
    flw fa1, 4(t0)          # the second
    jal hypot_squared       # fa0 = x*x + y*y
    fsqrt.s fs0, fa0        # 5.0

    li a7, 10
    ecall

# hypot_squared(fa0, fa1) -> fa0 * fa0 + fa1 * fa1 in fa0
hypot_squared:
    fmul.s fa0, fa0, fa0
    fmul.s ft0, fa1, fa1
    fadd.s fa0, fa0, ft0
    ret
```

Switch the FPU tab to Single and `fs0` reads `5`. `ft0` is a temporary the subroutine used and did not
restore, which is what the convention allows; a subroutine that wanted `fs0` upwards would have to
save it on the stack.

Printing a float is `ecall` service 2 with the value in `f12`, and a double is service 3. Both are in
the "ecall" lecture with the rest.

## Your turn

`values` holds three floats. Add them up, divide by three, and leave the **bits** of the answer in
`t3` with `fmv.x.w`, since a testcase reads the integer registers. The three add up to 9.0, so the
answer is 3.0, whose bits are `0x40400000`.

```riscv|playground|fpu|exercise
.data
values: .float 1.5, 3.25, 4.25
three:  .float 3.0

.text
.globl main
main:
    # your code here

    li a7, 10
    ecall
```

```testcase
{
    "expectedRegisters": { "t3": "0x40400000" }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|fpu|solution
.data
values: .float 1.5, 3.25, 4.25
three:  .float 3.0

.text
.globl main
main:
    la t0, values
    flw ft0, 0(t0)          # 1.5
    flw ft1, 4(t0)
    fadd.s ft0, ft0, ft1    # + 3.25
    flw ft1, 8(t0)
    fadd.s ft0, ft0, ft1    # + 4.25, so 9.0
    la t1, three
    flw ft2, 0(t1)
    fdiv.s ft0, ft0, ft2    # 3.0
    fmv.x.w t3, ft0

    li a7, 10
    ecall
```

</details>

The second one compares. Leave 1 in `t1` when the float at `a` is less than the one at `b` and 0 when
it is not, and leave 1 in `t2` when `a` is a NaN and 0 when it is not. The data holds 1.5 and 2.5, so
the answers are 1 and 0.

```riscv|playground|fpu|exercise
.data
a:      .float 1.5
b:      .float 2.5

.text
.globl main
main:
    # your code here

    li a7, 10
    ecall
```

```testcase
{
    "expectedRegisters": { "t1": 1, "t2": 0 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|fpu|solution
.data
a:      .float 1.5
b:      .float 2.5

.text
.globl main
main:
    la t0, a
    flw ft0, 0(t0)
    flw ft1, 4(t0)

    flt.s t1, ft0, ft1      # a < b

    feq.s t2, ft0, ft0      # a equal to itself? only a NaN is not
    xori t2, t2, 1          # so flip the answer

    li a7, 10
    ecall
```

</details>
