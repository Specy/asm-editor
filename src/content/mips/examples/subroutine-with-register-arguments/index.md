The greatest common divisor of two numbers, worked out by Euclid's method: replace the pair with the
smaller number and the remainder of the division, and go round until the remainder is zero. The
program calls it as a subroutine, with the two arguments in `$a0` and `$a1` and the answer coming
back in `$v0`.

This is the first program here that calls anything. Everything before it was one block of code
running once, top to bottom; this one has a named piece of code that the rest of the program hands
work to.

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

`gcd` is written **above** `main`, which should mean the program starts by running `gcd`. `.globl
main` is what stops that: execution begins at the first instruction in `.text` unless a global
`main` says otherwise. Putting the subroutine first and `main` last means `main` can simply run off
the end of the text section when it is done, which is how this program stops.

`jal` touches no memory at all. The return address goes into `$ra` and nowhere else. Step through
the call and watch it: `$ra` is 0 until the `jal`, then `0040002C`, which is the address of the
`move` on the line after the call, and `jr $ra` puts that straight back into `pc`.

That only works because `gcd` calls nothing itself. Put a second `jal` inside it and the new return
address would land on top of the one it still needed, and then the stack would have to hold it,
which is the next example on this list.

`$v0` and `$s0` both hold 12, the largest number that divides both 84 and 36. `$a0` finishes at 12
as well and `$a1` at 0, because the loop does its work by overwriting its own arguments.

Put 1071 and 462 in instead and the answer is 21, found in one more pass of the loop. The
subroutine itself does not change, because a subroutine is written once for every pair of numbers
there are.
