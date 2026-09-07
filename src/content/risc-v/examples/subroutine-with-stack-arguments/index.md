`sum_of_squares(a, b)` takes its two arguments on the stack, calls a second subroutine twice to
square them, and returns their sum in `a0`. It needs a local variable to hold the first square while
the second call runs, and that local lives on the stack too, in a frame the subroutine builds for
itself.

A subroutine with its arguments in registers passed everything in `a0` and `a1` and kept nothing.
That works until a subroutine has to hold something across a call, because there is only one `ra`
and the call is free to destroy any temporary it likes.

**You need to know:** the "The stack and `sp`" lecture and the "jal, ret and the calling convention"
lecture. What is new here is `fp` as a frame pointer, it stays still while `sp` keeps moving, so
`0(fp)` names the same argument from the first instruction to the last.

```riscv|playground|memory|allow-open
.text
.globl main

# square(x): x in a0, the answer in a0, and s1 is given back as it was found
square:
    addi sp, sp, -16
    sw s1, 0(sp)            # the caller's s1, saved
    mv s1, a0
    mul a0, s1, s1          # x * x
    lw s1, 0(sp)            # and given back
    addi sp, sp, 16
    ret

# sum_of_squares(a, b): a at 0(fp), b at 4(fp), the answer in a0
sum_of_squares:
    addi sp, sp, -16        # a frame: one local, the old fp and ra
    sw ra, 12(sp)
    sw fp, 8(sp)
    addi fp, sp, 16         # fp points at the arguments, and stays still
    lw a0, 0(fp)            # a
    jal square
    sw a0, 0(sp)            # local = a * a, kept across the next call
    lw a0, 4(fp)            # b
    jal square
    lw t0, 0(sp)
    add a0, a0, t0          # a * a + b * b
    lw ra, 12(sp)
    lw fp, 8(sp)
    addi sp, sp, 16
    ret

main:
    addi sp, sp, -16
    li t0, 3
    sw t0, 0(sp)            # the first argument, a
    li t0, 4
    sw t0, 4(sp)            # the second, b
    jal sum_of_squares
    addi sp, sp, 16         # the caller takes the two arguments back off
    mv s2, a0               # the answer
```

There is no `link` here and no `unlk`, and no `push` and no `pop` either. The M68K builds and takes
down a frame with one instruction each; on RISC-V the prologue is an `addi` that moves `sp` down and
a `sw` for everything the subroutine promised to give back, and the epilogue is the same lines the
other way round.

While the second `jal square` is running, the stack looks like this, with 🟢 on the stack pointer:

|      address |    value    | reached as | what it is                               |
| -----------: | :---------: | ---------- | ---------------------------------------- |
| `0x7FFFEFDC` | 🟢 00000009 | `0(sp)`    | the local, `a * a`                       |
| `0x7FFFEFE0` |  00000000   | `4(sp)`    | room the frame asked for and did not use |
| `0x7FFFEFE4` |  00000000   | `8(sp)`    | the caller's `fp`                        |
| `0x7FFFEFE8` |  00400070   | `12(sp)`   | the return address into `main`           |
| `0x7FFFEFEC` |  00000003   | `0(fp)`    | `a`                                      |
| `0x7FFFEFF0` |  00000004   | `4(fp)`    | `b`                                      |

Type `7FFFEFD0` in the memory panel after running and those words are still lying there, since
popping moves a pointer and erases nothing.

Both frames are sixteen bytes for two or three words, because the ABI asks the stack pointer to move
in multiples of 16 and `sp` starts at `0x7FFFEFFC`, so every frame keeps the alignment the one before
it had. The `4(sp)` in the middle of the table is room nothing was put in.

The arguments are the two words the caller pushed and nothing sits between them and the frame,
because `jal` pushed no return address: `sum_of_squares` saved its own. `addi fp, sp, 16` is what
makes them reachable by a name that does not move, and `fp` is `s0`, a saved register, so the
caller's copy goes on the stack first.

`square` keeps to a smaller agreement of its own. It borrows `s1`, which is a saved register, so it
puts the caller's value back before returning; `t0` in `main` it destroys freely, and that is why
`main` reads the answer out of `a0` and not out of anything it was holding.

`a0` and `s2` both come out at `00000019`, which is 25, from 9 plus 16.

Try changing `addi sp, sp, 16` in `main` to `addi sp, sp, 8`. The answer is still right, and `sp`
ends at `7FFFEFF4` instead of `7FFFEFFC`: eight bytes of stack the program will never get back,
which in a loop is how a program runs out of it.
