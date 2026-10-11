The greatest common divisor of two numbers can be found with Euclid's method: replace the pair with
the second number and the remainder of the division, then repeat until the second number is zero.
Here that calculation is a subroutine. Its first argument arrives in `a0`, its second in `a1`, and
its result comes back in `a0`.

```riscv|playground|allow-open
.text
.globl main

# gcd(a, b): a arrives in a0 and b in a1; the result leaves in a0.
gcd:
    beqz a1, gcd_done   # while (b != 0)
    rem t0, a0, a1     # t = a % b
    mv a0, a1          # a = b
    mv a1, t0          # b = t
    j gcd
gcd_done:
    ret

main:
    li a0, 84
    li a1, 36
    addi sp, sp, -12    # 0x7fffeffc becomes 0x7fffeff0, divisible by 16
    jal gcd
    addi sp, sp, 12     # restore the Playground's initial sp
    mv s0, a0           # keep the result: 12
```

The Playground starts `sp` at `0x7fffeffc`. RISC-V requires it to be a multiple of 16 at a call, so
`main` subtracts 12 before `jal` and adds 12 back immediately after the return. `gcd` does not need
stack space of its own, but it still begins with an aligned `sp`.

As the loop runs, the arguments are working registers. For `gcd(84, 36)`, `a0` finishes as 12 and
`a1` finishes as 0. The caller copies the result from `a0` to `s0` before using `a0` for anything
else.

The calling convention is the agreed set of rules that lets caller and subroutine understand each
other. The `a` and `t` registers are caller-saved: a call may change them, so a caller that needs an
old value must save it before calling. That is why `gcd` may use `t0` without restoring it. The `s`
registers are callee-saved: a subroutine that changes one must restore its old value before `ret`.
This `gcd` does not change any `s` register.

`jal gcd` writes `0x00400028`, the address of the following `addi`, into `ra`. `ret` jumps to the
address in `ra`, so execution resumes there and restores `sp`. `gcd` is a **leaf subroutine**: it
does not call another subroutine, so nothing overwrites its incoming `ra` and it need not save it.
If it contained another `jal`, it would have to preserve that return address, normally in an aligned
stack frame.

## Your turn: absolute difference

Write the leaf subroutine `difference`. It receives two nonnegative signed 32-bit integers (0 through
2,147,483,647) in `a0` and `a1` and returns their absolute difference in `a0`. It may change `a1`
and any `t` register, but it must not change an `s` register. Do not use memory or call another
subroutine. `main` puts a sentinel in `s3`; the test checks that the subroutine leaves it unchanged.

Also replace each `addi sp, sp, 0` around a call: subtract 12 before `jal` so `sp` is 16-byte aligned,
then add 12 after the return. The three calls check both argument orders and equal arguments. At the
end, `sp` must be back at its initial value.

```riscv|playground|exercise
.text
.globl main

difference:
    # Return |a0 - a1| in a0.
    ret

main:
    li s3, 12345        # callee-saved sentinel: difference must leave this unchanged

    li a0, 20
    li a1, 13
    addi sp, sp, 0      # replace 0 with the adjustment before the call
    jal difference
    addi sp, sp, 0      # replace 0 with the adjustment after the call
    mv s0, a0

    li a0, 4
    li a1, 11
    addi sp, sp, 0
    jal difference
    addi sp, sp, 0
    mv s1, a0

    li a0, 9
    li a1, 9
    addi sp, sp, 0
    jal difference
    addi sp, sp, 0
    mv s2, a0
```

```testcase
{
    "expectedRegisters": {
        "s0": 7,
        "s1": 7,
        "s2": 0,
        "s3": 12345,
        "sp": "0x7fffeffc"
    }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
.globl main

difference:
    blt a0, a1, second_is_larger
    sub a0, a0, a1
    ret
second_is_larger:
    sub a0, a1, a0
    ret

main:
    li s3, 12345

    li a0, 20
    li a1, 13
    addi sp, sp, -12
    jal difference
    addi sp, sp, 12
    mv s0, a0

    li a0, 4
    li a1, 11
    addi sp, sp, -12
    jal difference
    addi sp, sp, 12
    mv s1, a0

    li a0, 9
    li a1, 9
    addi sp, sp, -12
    jal difference
    addi sp, sp, 12
    mv s2, a0
```

</details>
