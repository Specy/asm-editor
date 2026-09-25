The greatest common divisor (GCD) is the largest integer that divides two numbers without leaving a
remainder. Here, the inputs are nonnegative integers, and they must not both be zero: the GCD of
`(0, 0)` is undefined.

Euclid's algorithm repeatedly changes the pair `(a, b)` to `(b, a % b)`. When `b` reaches zero,
`a` is the GCD. This example puts the algorithm in a subroutine so that `main` can pass in two
arguments and receive one result. In the course calling convention, the caller puts the first two
arguments in `$a0` and `$a1`, and the subroutine returns its answer in `$v0`. `main` copies that
answer to `$s0` before using `$v0` for the exit service. A subroutine must leave an `$s` register
as it found it, so `$s0` can keep the answer across this call.

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

`jal gcd` jumps to the subroutine and records where to return in `$ra`. The argument registers and
`$t` registers are caller-saved: if `main` needed their old values after the call, it would have to
save them first. This routine changes `$a0`, `$a1`, `$t0`, and the special `hi` and `lo` registers.
It leaves `$s0` alone, as the calling convention requires. Stating which registers a routine changes
helps its callers decide what to save.

The two-operand signed `div $a0, $a1` writes the quotient to `lo` and the remainder to `hi`. Every
iteration overwrites both registers, so the routine copies the current remainder from `hi` into
`$t0` before the next division. The `beqz` check comes first because division by zero is invalid.
With 84 and 36, the pairs are `(84, 36)`, `(36, 12)`, and `(12, 0)`, so the returned GCD is 12.

`gcd` calls no other routine; such a routine is called a **leaf subroutine**. Nothing inside it
replaces the return address in `$ra`, so `jr $ra` returns to the instruction after `jal`. Back in
`main`, `move $s0, $v0` saves the GCD before `li $v0, 10` replaces the return value with the exit
service number. That syscall ends
the program before execution can reach the `gcd` label below `main`. At termination, `$s0` holds 12
and `$v0` holds 10.

For practice, change only the two argument values in `main`, predict `$s0`, then select **Build**
and **Run** for each pair. The embedded **Test** checks the original 84/36 final registers; a
different correct answer may fail that check:

- `1071` and `462` give `21`.
- `36` and `84` give `12`; the first transition handles `a < b` normally.
- `25` and `0` give `25`; this is valid because the pair is not `(0, 0)`.

Do not use `(0, 0)` as a GCD case. The code would return 0 immediately, but the mathematical GCD
is undefined for that pair.
