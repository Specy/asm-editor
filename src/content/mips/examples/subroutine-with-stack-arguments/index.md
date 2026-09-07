`sum_of_squares(a, b)` takes its two arguments on the stack, calls a second subroutine twice to
square them, and returns their sum in `$v0`. It needs a local variable to hold the first square
while the second call runs, and that local lives on the stack too, in a frame the subroutine builds
for itself.

A subroutine with its arguments in registers passed everything in `$a0` and `$a1` and kept nothing.
That works until a subroutine has to hold something across a call, because there is only one `$ra`
and the call is free to destroy any temporary it likes.

**You need to know:** the "The stack and `$sp`" lecture and the "jal, jr and the calling convention"
lecture. What is new here is `$fp` as a frame pointer, it stays still while `$sp` keeps moving, so
`0($fp)` names the same argument from the first instruction to the last.

```mips|playground|memory|allow-open
.text
.globl main

# square(x): x in $a0, the answer in $v0, and $s0 is given back as it was found
square:
    addi $sp, $sp, -4
    sw $s0, 0($sp)          # the caller's $s0, saved
    move $s0, $a0
    mul $v0, $s0, $s0       # x * x
    lw $s0, 0($sp)          # and given back
    addi $sp, $sp, 4
    jr $ra

# sum_of_squares(a, b): a at 0($fp), b at 4($fp), the answer in $v0
sum_of_squares:
    addi $sp, $sp, -12      # a frame: one local, the old $fp and $ra
    sw $ra, 8($sp)
    sw $fp, 4($sp)
    addi $fp, $sp, 12       # $fp points at the arguments, and stays still
    lw $a0, 0($fp)          # a
    jal square
    sw $v0, 0($sp)          # local = a * a, kept across the next call
    lw $a0, 4($fp)          # b
    jal square
    lw $t0, 0($sp)
    add $v0, $v0, $t0       # a * a + b * b
    lw $ra, 8($sp)
    lw $fp, 4($sp)
    addi $sp, $sp, 12
    jr $ra

main:
    addi $sp, $sp, -8
    li $t0, 3
    sw $t0, 0($sp)          # the first argument, a
    li $t0, 4
    sw $t0, 4($sp)          # the second, b
    jal sum_of_squares
    addi $sp, $sp, 8        # the caller takes the two arguments back off
    move $s1, $v0           # the answer
```

There is no `link` here and no `unlk`. The M68K builds and takes down a frame with one instruction
each; on MIPS the prologue is an `addi` that moves `$sp` down and a `sw` for everything the
subroutine promised to give back, and the epilogue is the same lines the other way round.

While the second `jal square` is running, the stack looks like this, with 🟢 on the stack pointer:

|      address |    value    | reached as | what it is                     |
| -----------: | :---------: | ---------- | ------------------------------ |
| `0x7FFFEFE8` | 🟢 00000009 | `0($sp)`   | the local, `a * a`             |
| `0x7FFFEFEC` |  00000000   | `4($sp)`   | the caller's `$fp`             |
| `0x7FFFEFF0` |  00400070   | `8($sp)`   | the return address into `main` |
| `0x7FFFEFF4` |  00000003   | `0($fp)`   | `a`                            |
| `0x7FFFEFF8` |  00000004   | `4($fp)`   | `b`                            |

Type `7FFFEFE0` in the memory panel after running and those five words are still lying there, since
popping moves a pointer and erases nothing.

The arguments are the two words the caller pushed and nothing sits between them and the frame,
because `jal` pushed no return address: `sum_of_squares` saved its own. `addi $fp, $sp, 12` is what
makes them reachable by a name that does not move, and `$fp` is a saved register, so the caller's
copy goes on the stack first.

`square` keeps to a smaller agreement of its own. It borrows `$s0`, which is a saved register, so it
puts the caller's value back before returning; `$t0` in `main` it destroys freely, and that is why
`main` reads the answer out of `$v0` and not out of anything it was holding.

`$v0` and `$s1` both come out at `00000019`, which is 25, from 9 plus 16.

Try changing `addi $sp, $sp, 8` in `main` to `addi $sp, $sp, 4`. The answer is still right, and
`$sp` ends at `7FFFEFF8` instead of `7FFFEFFC`: four bytes of stack the program will never get back,
which in a loop is how a program runs out of it.
