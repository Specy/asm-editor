The greatest common divisor of two numbers, worked out by Euclid's method: replace the pair with the
smaller number and the remainder of the division, and go round until the remainder is zero. The
program calls it as a subroutine, with the two arguments in `$a0` and `$a1` and the answer coming
back in `$v0`.

This is the first program on the ladder that calls anything. Everything before it was one block of
code running once, and this one has a piece of code with a name that the rest of the program hands
work to.

**You need to know:** the "jal, jr and the calling convention" lecture and the "Multiply and divide,
with the remainder" Example. What is new here is the call itself, `jal` writes the address of the
next instruction into `$ra` and jumps, and `jr $ra` jumps back to it.

```mips|playground|allow-open
.text
.globl main

# gcd(a, b): a arrives in $a0 and b in $a1, the answer leaves in $v0.
# It works in $t0, which the caller has to expect.
gcd:
    beqz $a1, gcd_done  # while(b != 0)
    div $a0, $a1        # a / b, with a % b in hi
    mfhi $t0            # t = a % b
    move $a0, $a1       # a = b
    move $a1, $t0       # b = t
    j gcd
gcd_done:
    move $v0, $a0       # the answer is what is left in a
    jr $ra

main:
    li $a0, 84          # a = 84
    li $a1, 36          # b = 36
    jal gcd             # gcd(a, b)
    move $s0, $v0       # the answer, kept somewhere it will not be reused
```

Arguments in `$a0` to `$a3` and the answer in `$v0` is the standard MIPS convention, and this
program adds one line of its own to it: `gcd` destroys `$t0`, which a subroutine is entitled to do
without telling anyone, and the comment above the label says so. Nothing in the machine enforces any
of that. A **calling convention** is exactly this comment, agreed once for a whole program instead
of once per subroutine.

`gcd` is written **above** `main` and `.globl main` is what makes the program start at `main`
anyway. Execution begins at the first instruction in `.text` and a global `main` overrides that, so
a compute-only program with a subroutine puts the subroutine first and lets `main` run off the end
of the text section, which is how it stops. The M68K version puts the subroutine last and needs a
`bra` over it, because there is nothing like `.globl` there.

`jal` touches no memory at all: the return address goes into `$ra`, where a `bsr` on the M68K pushes
it onto the stack. Step through the call and `$ra` is 0 until the `jal` and `0040002C` after it,
which is the address of the `move` that follows the call, and `jr $ra` puts the `pc` back there.
This works because `gcd` calls nothing: with a second `jal` inside it the new return address would
land on top of the one it still needed, and the stack would have to hold it.

`$v0` and `$s0` both come out at `0000000C`, which is 12: 84 and 36 are both 12 times something and
nothing larger divides them both. `$a0` finishes at 12 as well and `$a1` at 0, since the loop works
by overwriting its own arguments.

Try changing the two numbers to 1071 and 462. The answer is 21, and the loop goes round one more
time to find it.
