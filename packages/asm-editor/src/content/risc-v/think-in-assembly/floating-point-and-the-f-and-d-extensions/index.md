Integer registers are a good fit for counts, addresses and whole-number arithmetic. Many programs
also need approximations of real values: measurements such as 1.5 metres, coordinates or the result
of a square root. **Floating point** uses a finite set of bit patterns to represent those values. A
calculation is rounded when its exact result has no matching pattern.

RISC-V gives floating-point values their own registers and instructions. The `riscv` playgrounds on
this page use RV32 integer registers and provide both floating-point extensions described below.

## F, D and the two precisions

Floating-point hardware is optional in RISC-V. A processor can omit it when its programs have no
need for it, include F for singles, or include F and D together for singles and doubles:

- **F** adds 32 floating-point registers and **single-precision** operations. A single occupies 32
  bits, or 4 bytes.
- **D** builds on F, adds **double-precision** operations and makes each floating-point register wide
  enough for a 64-bit double. A double occupies 8 bytes.

Operations that must select a floating-point precision use `.s` for single or `.d` for double:
`fadd.s` adds singles, while `fadd.d` adds doubles. Loads, stores, raw moves and control-register
instructions use other naming patterns, which we will meet as they arise.

## A useful model of the bits

For an ordinary nonzero finite value, IEEE 754 divides the encoding into a **sign**, an **exponent**
and a **fraction**. The fraction contributes to the number's **significand**, the binary digits that
carry its precision. This resembles scientific notation with a power of two in place of a power of
ten.

| type   | bytes | data directive | sign bits | exponent bits | stored fraction bits | approximate decimal precision |
| ------ | ----: | -------------- | --------: | ------------: | -------------------: | ----------------------------: |
| single |     4 | `.float`       |         1 |             8 |                   23 |                      7 digits |
| double |     8 | `.double`      |         1 |            11 |                   52 |                     16 digits |

For most finite values, an additional leading significand bit is implied instead of stored. Zero
and very small **subnormal** values use the fields differently, as do the special values infinity
and **NaN** (not a number). The three-field description is therefore a useful first model, not a
complete account of every encoding.

Many decimal fractions have no finite binary representation. For example, the binary expansion of
0.1 repeats, so a single or double stores a nearby representable value. This is why a sequence of
floating-point operations can accumulate small rounding differences.

An exponent field of all ones represents an infinity when the fraction field is zero and a NaN when
the fraction field is nonzero. Operations such as zero divided by zero produce a NaN. `feq`, `flt`
and `fle` write 0 when either input is a NaN.

## The 32 floating-point registers

The registers are `f0` through `f31`. Their ABI names follow the caller-saved and callee-saved idea
from the integer calling convention:

| registers       | role      | calling-convention use                                |
| --------------- | --------- | ----------------------------------------------------- |
| `ft0` to `ft11` | temporary | a call may replace them                               |
| `fs0` to `fs11` | saved     | a subroutine restores any of them that it changes     |
| `fa0` to `fa7`  | argument  | floating-point arguments; `fa0` also carries a result |

An integer register and a floating-point register with similar names are still separate. For
example, `t0` can hold an address while `ft0` holds the single loaded from that address.

The editor shows the floating-point registers on the **FPU** tab. Its Format selector can interpret
the bits as Double, Single or Hex. A register does not remember which interpretation the program
intended, so choose the view that matches the instructions that wrote it.

### Singles in a D-capable register

An F-only processor has 32-bit floating-point registers. When D is present, as it is in these
playgrounds, those registers are 64 bits wide. A single uses the low 32 bits, and a floating-point
instruction fills the upper 32 bits with ones. This is **NaN boxing**.

The box makes an accidental `.d` use easy to detect: interpreting the complete boxed pattern as a
double produces a NaN. It does not make the reverse interpretation safe. If a register contains a
double, the Single view simply interprets its low 32 bits as a single. Those bits could represent
many values. For example, double-precision 3.75 is `400E000000000000`, whose low word is zero, so
the Single view displays 0.0.

## Load, calculate and store

`flw` and `fsw` transfer a 32-bit single. `fld` and `fsd` transfer a 64-bit double. Their addresses
use the familiar `offset(base)` form, and the base is an integer register.

```riscv|playground|fpu
.data
a:      .float 1.5
b:      .float 2.25
result: .float 0.0

.text
.globl main
main:
    la t0, a
    flw ft0, 0(t0)          # single 1.5
    flw ft1, 4(t0)          # single 2.25
    fadd.s ft2, ft0, ft1    # 3.75
    fsw ft2, 8(t0)          # store result

    fsub.s ft3, ft1, ft0    # 0.75
    fmul.s ft4, ft0, ft1    # 3.375
    fdiv.s ft5, ft1, ft0    # 1.5
    fsqrt.s ft6, ft1        # 1.5
    fneg.s ft7, ft0         # -1.5
    fabs.s fs0, ft7         # 1.5
end:
```

Select Single on the FPU tab. `ft2` reads 3.75, `ft3` reads 0.75 and the other results follow. In
Hex, `ft2` is `FFFFFFFF40700000`: `40700000` encodes the single 3.75 and the upper ones are its NaN
box. Select Double and that complete boxed pattern appears as NaN.

`fneg.s` and `fabs.s` are convenient pseudo-instructions based on **sign injection**. For example,
`fneg.s ft7, ft0` expands to `fsgnjn.s ft7, ft0, ft0`, which copies the value while reversing its
sign bit.

The double-precision forms use `.d` and double-sized memory transfers:

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
end:
```

In Double format, `fa2` reads 3.75. Its Hex value is `400E000000000000`, with all 64 bits belonging
to the double.

## Conversions and raw moves

A **conversion** preserves the numeric value as closely as the destination format allows. A **raw
move** preserves the payload bits within the width it transfers. For `fmv.w.x`, those are the low 32
bits; on a D-capable register, the instruction also fills the upper 32 bits with ones to create a
NaN-boxed single. These are different operations even when they cross the same two register files.

| instruction        | action in this RV32 playground                                      |
| ------------------ | ------------------------------------------------------------------- |
| `fcvt.s.w ft0, t0` | convert a signed integer word to a single                           |
| `fcvt.w.s t0, ft0` | convert a single to a signed integer word, with rounding            |
| `fmv.x.w t0, ft0`  | move the single's 32 raw bits into an integer register              |
| `fmv.w.x ft0, t0`  | move 32 raw bits into a single; the D-capable register NaN-boxes it |

Read a conversion name from destination to source: `fcvt.s.w` converts **to single from word**.
Other members include `fcvt.d.w`, `fcvt.s.d` and `fcvt.d.s`.

An integer conversion can name a rounding mode. With no mode written, it uses the current mode,
which initially is round to nearest, ties to even. The `rtz` mode rounds toward zero.

```riscv|playground|fpu
.data
n: .word 7

.text
.globl main
main:
    la t0, n
    lw t1, 0(t0)
    fcvt.s.w ft0, t1        # numeric conversion: 7 -> 7.0
    fsqrt.s ft1, ft0        # about 2.64575
    fcvt.w.s t2, ft1        # 3, using round to nearest
    fcvt.w.s t3, ft1, rtz   # 2, rounding toward zero
    fmv.x.w t4, ft1         # raw single bits: 0x402953FD
end:
```

The same value in `ft1` produces integer 3, integer 2 or the raw pattern `402953FD`, depending on the
instruction.

RV64 changes two raw-move details. `fmv.x.w` still reads 32 bits, then sign-extends bit 31 through
the 64-bit integer destination. `fmv.w.x` uses the low 32 integer bits and, on a D-capable processor,
writes a NaN-boxed single. RV64D also has `fmv.x.d` and `fmv.d.x` for moving a complete 64-bit double
between one floating-point register and one 64-bit integer register. In RV32, one integer register is
not wide enough for those whole-double moves.

## Comparisons produce an integer answer

Floating-point comparisons write 1 or 0 into an integer register. An ordinary integer branch can
then act on that result.

- `flt.s t0, ft0, ft1` writes 1 when `ft0 < ft1`.
- `fle.s t0, ft0, ft1` writes 1 when `ft0 <= ft1`.
- `feq.s t0, ft0, ft1` writes 1 when the two values are equal.

The destination comes first and must be an integer register. The two sources are floating-point
registers. To ask whether one value is greater, swap the sources of `flt.s`. To branch when two
values differ, use `feq.s` and branch when its integer result is zero.

```riscv|playground|fpu
.data
a: .float 1.5
b: .float 2.25

.text
.globl main
main:
    la t0, a
    flw ft0, 0(t0)
    flw ft1, 4(t0)

    flt.s t1, ft0, ft1      # 1: 1.5 < 2.25
    fle.s t2, ft1, ft0      # 0: 2.25 <= 1.5
    feq.s t3, ft0, ft0      # 1 for this ordinary value

    bnez t1, less
    li t4, 200
    j end
less:
    li t4, 100
end:
```

`t4` finishes at 100. If either comparison source is a NaN, `feq.s`, `flt.s` and `fle.s` write 0.
Therefore `feq.s t3, ft0, ft0` followed by `xori t3, t3, 1` gives the simple NaN test used in the
second exercise.

## Sticky status flags

Floating-point operations record exceptional conditions in the five `fflags` bits of the `fcsr`
control and status register:

| flag | meaning                                                   |
| ---- | --------------------------------------------------------- |
| NV   | invalid operation                                         |
| DZ   | division by zero                                          |
| OF   | overflow: the magnitude was too large for the destination |
| UF   | underflow: a tiny result lost accuracy                    |
| NX   | inexact: the exact result had to be rounded               |

These are sticky status flags, not traps. Once an operation sets a bit, it remains set until the
program explicitly clears or replaces the flags. Clear them before observing one calculation:

```riscv|playground|fpu|csr
.data
n: .word 7

.text
.globl main
main:
    fsflags zero            # begin with all five flags clear
    la t0, n
    lw t1, 0(t0)
    fcvt.s.w ft0, t1        # exactly 7.0
    frflags t2              # 0

    fsqrt.s ft1, ft0        # rounded approximation of sqrt(7)
    frflags t3              # NX is bit 0, so t3 is 1
end:
```

The CSR tab shows the flags. `t2` is zero after the exact conversion. The square root of 7 cannot be
represented exactly as a single, so it sets NX and `t3` becomes 1.

## Floating-point arguments and results

Under the floating-point calling convention, floating-point arguments use `fa0` through `fa7`, and
a floating-point result returns in `fa0`. They are counted separately from integer arguments in
`a0` through `a7`. A subroutine receiving one integer and two floats would therefore find them in
`a0`, `fa0` and `fa1`.

This playground needs the same 12-byte startup adjustment as the previous calling-convention
examples so that `sp` is 16-byte aligned when the subroutine begins:

```riscv|playground|fpu
.data
x: .float 3.0
y: .float 4.0

.text
.globl main
main:
    addi sp, sp, -12       # align the playground stack
    la t0, x
    flw fa0, 0(t0)         # first floating-point argument
    flw fa1, 4(t0)         # second floating-point argument
    jal hypot_squared      # fa0 = x*x + y*y
    fsqrt.s fs0, fa0       # 5.0, kept where it is easy to inspect
    addi sp, sp, 12        # restore the playground's initial sp
    j end

# hypot_squared(fa0, fa1) -> fa0
hypot_squared:
    fmul.s fa0, fa0, fa0
    fmul.s ft0, fa1, fa1
    fadd.s fa0, fa0, ft0
    ret
end:
```

Select Single and `fs0` reads 5.0. `hypot_squared` freely replaces the caller-saved `fa0` and `ft0`
registers. It changes no saved register and makes no further call, so it needs no stack frame.

## Your turn

`values` holds three singles. Add them, divide the sum by three, and leave the raw bits of the answer
in `t3` with `fmv.x.w`. The exact answer for this data is 3.0, encoded as `0x40400000`.

```riscv|playground|fpu|exercise
.data
values: .float 1.5, 3.25, 4.25
three:  .float 3.0

.text
.globl main
main:
    # your code here
end:
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
    fadd.s ft0, ft0, ft1    # 4.75
    flw ft1, 8(t0)
    fadd.s ft0, ft0, ft1    # 9.0
    la t1, three
    flw ft2, 0(t1)
    fdiv.s ft0, ft0, ft2    # 3.0
    fmv.x.w t3, ft0
end:
```

</details>

For the second exercise, leave 1 in `t1` when the single at `a` is less than the one at `b`, and 0
otherwise. Leave 1 in `t2` when `a` is a NaN, and 0 otherwise. With the supplied data, the answers
are 1 and 0.

```riscv|playground|fpu|exercise
.data
a: .float 1.5
b: .float 2.5

.text
.globl main
main:
    # your code here
end:
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
a: .float 1.5
b: .float 2.5

.text
.globl main
main:
    la t0, a
    flw ft0, 0(t0)
    flw ft1, 4(t0)

    flt.s t1, ft0, ft1      # a < b
    feq.s t2, ft0, ft0      # 1 for an ordinary value, 0 for NaN
    xori t2, t2, 1          # invert it to make 1 mean NaN
end:
```

</details>
