`sum_of_squares(a, b)` returns `a * a + b * b` in `a0`. This example deliberately passes its two
inputs on the stack. That is a teaching convention here, not the usual rule: normally the first
eight RISC-V arguments go in `a0` through `a7`. Stack arguments become necessary when there are
more inputs than those registers can hold.

The stack also has a separate job. `sum_of_squares` calls `square` twice, so it must keep its own
return address and its first answer somewhere safe while the second call runs. Its frame holds
those values. `fp` is another name for `s0`; since `s0` is callee-saved, a subroutine using `fp`
must save and restore the caller's `s0` value.

```riscv|playground|memory|allow-open
.text
.globl main

# square(x): x arrives in a0 and its square leaves in a0.
# This frame exists only because this version deliberately uses s1.
square:
    addi sp, sp, -16
    sw s1, 0(sp)            # preserve the caller's callee-saved s1
    mv s1, a0
    mul a0, s1, s1
    lw s1, 0(sp)
    addi sp, sp, 16
    ret

# Teaching convention: a is at 0(fp), b is at 4(fp); result leaves in a0.
sum_of_squares:
    addi sp, sp, -16        # local at 0(sp), saved fp and ra above it
    sw fp, 8(sp)
    sw ra, 12(sp)           # nested jal instructions will overwrite ra
    addi fp, sp, 16         # fp (s0) now points to the caller's arguments

    lw a0, 0(fp)
    jal square
    sw a0, 0(sp)            # retain a * a across the next call
    lw a0, 4(fp)
    jal square
    lw t0, 0(sp)
    add a0, a0, t0

    lw fp, 8(sp)
    lw ra, 12(sp)
    addi sp, sp, 16
    ret

main:
    li s0, 123              # sentinels prove that both saved registers come back unchanged
    li s1, 456
    addi sp, sp, -12        # 0x7fffeffc -> 0x7fffeff0, aligned for jal
    li t0, 3
    sw t0, 0(sp)            # a
    li t0, 4
    sw t0, 4(sp)            # b
    jal sum_of_squares
    addi sp, sp, 12         # give back the two arguments and four padding bytes
    mv s2, a0               # 25; s0 is 123 and s1 is 456 again
```

The Playground begins with `sp = 0x7fffeffc`, which is 12 modulo 16. `main` subtracts 12, so its
`jal` sees `sp = 0x7fffeff0`, a multiple of 16. The two 4-byte arguments occupy the first eight
bytes; the remaining four bytes are padding. `sum_of_squares` and `square` each subtract 16, so
their frames keep that alignment. Every subtraction has the matching addition before its `ret` or
before `main` finishes.

Here is one exact snapshot: the second call of `square`, after `square` has made its frame and
computed `4 * 4`, but before it returns. `sp` is `0x7fffefd0`; `fp` is still `0x7fffeff0` in
`sum_of_squares`.

| Address                   | Reached as                   | Value                      | Meaning                                        |
| ------------------------- | ---------------------------- | -------------------------- | ---------------------------------------------- |
| `0x7fffefd0`              | `0(sp)` in `square`          | `456`                      | `square`'s saved caller `s1`                   |
| `0x7fffefd4`–`0x7fffefdf` | `4(sp)`–`12(sp)` in `square` | unused                     | remaining bytes of `square`'s 16-byte frame    |
| `0x7fffefe0`              | `0(sp)` in `sum_of_squares`  | `9`                        | local first square, `3 * 3`                    |
| `0x7fffefe4`              | `4(sp)` in `sum_of_squares`  | unused                     | spare frame word                               |
| `0x7fffefe8`              | `8(sp)` in `sum_of_squares`  | `123`                      | caller's `fp`/`s0`                             |
| `0x7fffefec`              | `12(sp)` in `sum_of_squares` | return address into `main` | incoming `ra`, saved before either nested call |
| `0x7fffeff0`              | `0(fp)`                      | `3`                        | stack argument `a`                             |
| `0x7fffeff4`              | `4(fp)`                      | `4`                        | stack argument `b`                             |
| `0x7fffeff8`–`0x7fffeffb` | caller's `8(sp)`–`11(sp)`    | unused                     | alignment padding in `main`'s 12-byte area     |

`jal` does not push anything: it places the return address in `ra`. The second `jal square`
changes `ra`, which is why `sum_of_squares` saved the address needed to return to `main`. `square`
does not call another subroutine, so its incoming `ra` remains in the register and `ret` can use it
directly. Its frame is only to demonstrate using and preserving `s1`; a shorter `square` could use
`mul a0, a0, a0` and need no frame at all.

The prologue claims the words a subroutine needs and saves its callee-saved registers or `ra` when a
nested call would overwrite it. The epilogue restores them in reverse: restore saved values, put
`sp` back, then `ret`. Popping a frame only moves `sp`; old words can remain visible in the memory
panel, but they are no longer yours to use.

## Your turn: finish the frame

Complete `sum_of_squares`. Keep the same stack-argument teaching convention: its inputs are 5 and
12 at `0(fp)` and `4(fp)`. It must return 169 in `a0`, preserve `s0` and `s1`, and leave `sp` at the
Playground's initial `0x7fffeffc`. `square` may change `a0` and temporary registers, but must give
`s1` back unchanged. Use a 16-byte frame in `sum_of_squares` for its local, saved `fp`, and saved
`ra`.

```riscv|playground|exercise
.text
.globl main

square:
    addi sp, sp, -16
    sw s1, 0(sp)
    mv s1, a0
    mul a0, s1, s1
    lw s1, 0(sp)
    addi sp, sp, 16
    ret

sum_of_squares:
    # Build the 16-byte frame, save fp and ra, and set fp.
    # Call square for each stack argument. Put the first answer in the local.
    # Restore fp, ra, and sp before ret.
    ret

main:
    li s0, 314
    li s1, 2718
    addi sp, sp, -12
    li t0, 5
    sw t0, 0(sp)
    li t0, 12
    sw t0, 4(sp)
    jal sum_of_squares
    addi sp, sp, 12
    mv s2, a0
```

```testcase
{
    "expectedRegisters": {
        "s0": 314,
        "s1": 2718,
        "s2": 169,
        "sp": "0x7fffeffc"
    }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
.globl main

square:
    addi sp, sp, -16
    sw s1, 0(sp)
    mv s1, a0
    mul a0, s1, s1
    lw s1, 0(sp)
    addi sp, sp, 16
    ret

sum_of_squares:
    addi sp, sp, -16
    sw fp, 8(sp)
    sw ra, 12(sp)
    addi fp, sp, 16
    lw a0, 0(fp)
    jal square
    sw a0, 0(sp)
    lw a0, 4(fp)
    jal square
    lw t0, 0(sp)
    add a0, a0, t0
    lw fp, 8(sp)
    lw ra, 12(sp)
    addi sp, sp, 16
    ret

main:
    li s0, 314
    li s1, 2718
    addi sp, sp, -12
    li t0, 5
    sw t0, 0(sp)
    li t0, 12
    sw t0, 4(sp)
    jal sum_of_squares
    addi sp, sp, 12
    mv s2, a0
```

</details>
