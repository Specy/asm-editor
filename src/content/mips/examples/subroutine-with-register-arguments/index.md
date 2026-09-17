The greatest common divisor (GCD) is the largest integer that divides two numbers without leaving a
remainder. Here, the inputs are nonnegative integers, and they must not both be zero.

Euclid's algorithm repeatedly changes the pair `(a, b)` to `(b, a % b)`. When `b` reaches zero,
`a` is the GCD. This example puts the algorithm in a subroutine so that `main` can pass in two
arguments and receive one result.

```mips|playground|tests|allow-open
.text
.globl main

main:
    li $a0, 84          # first argument: a = 84
    li $a1, 36          # second argument: b = 36
    jal gcd             # call gcd(a, b)
    move $s0, $v0       # keep the result after the call

    li $v0, 10          # exit service
    syscall

# gcd(a, b): $a0 = a, $a1 = b, result in $v0
# May change $a0, $a1, $t0, hi, and lo.
gcd:
    beqz $a1, gcd_done  # guard b = 0 before div
    div $a0, $a1        # signed a / b: quotient in lo, remainder in hi
    mfhi $t0            # t = a % b
    move $a0, $a1       # a = b
    move $a1, $t0       # b = t
    j gcd

gcd_done:
    move $v0, $a0
    jr $ra
```

```testcase
{
    "expectedRegisters": {
        "$s0": 12,
        "$a0": 12,
        "$a1": 0,
        "$t0": 0,
        "$v0": 10
    }
}
```

For this course's Playground programs, we use a simplified calling convention. The caller places
arguments in `$a0` through `$a3`, `jal` records the return address in `$ra`, and the subroutine puts
its result in `$v0`. Registers whose names begin with `$t` are already caller-saved: a caller that
needs one of their old values after a call must preserve it. This routine may clobber `$a0`, `$a1`,
`$t0`, and the special `hi` and `lo` registers. Stating that contract tells the caller which values
can change.

The two-operand signed `div $a0, $a1` writes the quotient to `lo` and the remainder to `hi`. Every
iteration overwrites both registers, so the routine copies the current remainder from `hi` into
`$t0` before the next division. The `beqz` check comes first because division by zero is invalid.
With 84 and 36, the pairs are `(84, 36)`, `(36, 12)`, and `(12, 0)`, so the returned GCD is 12.

`gcd` is a **leaf subroutine**: it does not call another subroutine. Its caller's return address
therefore remains in `$ra`, so `gcd` does not need to save `$ra`; `jr $ra` returns to the instruction
after `jal`. The program does not depend on a particular numeric return address. After `main` saves
the result in `$s0`, service 10 exits the program. The routine can safely appear below `main`
because execution cannot fall through into it. At termination, `$s0` still holds 12 and `$v0` holds
10, the exit service number.

For practice, change only the two argument values in `main`, predict `$s0`, and run the program:

- `1071` and `462` give `21`.
- `36` and `84` give `12`; the first transition handles `a < b` normally.
- `25` and `0` give `25`; this is valid because the pair is not `(0, 0)`.
