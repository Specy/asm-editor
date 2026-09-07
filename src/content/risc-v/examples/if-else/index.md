Two numbers sit in registers, and the program leaves the larger of them in `t2` and the distance
between them in `t4`. The comparison is inside the branch, so choosing between the two numbers takes
one instruction and no flags register anywhere.

The two programs before this one ran every instruction they had, top to bottom. This is the first
one where some instructions are skipped, and stepping through it is how you watch which ones.

**You need to know:** the "Branch on compare" lecture and the "Comparing without flags" lecture.
What is new here is that a branch chooses between two pieces of code, so the piece that runs first
has to jump over the one that follows it.

```riscv|playground|allow-open
.text
main:
    li t0, 37               # a = 37
    li t1, 64               # b = 64

    blt t1, t0, a_is_bigger # if(b < a) the answer is a
    mv t2, t1               # bigger = b
    j done
a_is_bigger:
    mv t2, t0               # bigger = a
done:

    slt t3, t0, t1          # the same question as a number: is a < b?

    sub t4, t0, t1          # distance = a - b
    bgez t4, positive       # if(distance >= 0) it is already the answer
    sub t4, zero, t4        # otherwise flip its sign
positive:
```

`blt t1, t0, a_is_bigger` is C's `if (b < a) goto a_is_bigger`, and both of the numbers it compares
are registers it names. The M68K writes the same line as a `cmp.l d1, d0` and a `bge`, with the
answer in the condition codes and nothing saying where it went; MIPS has no branch that compares two
registers for less than, so it writes an `slt` into a register and a `beqz` under it.

That `slt` exists here too, and `slt t3, t0, t1` is what to write when you want the answer as a
value instead of as a jump: `t3` comes out at 1, which is C's `t3 = (a < b)`. The branch is the one
to reach for when the next thing to do is choose between two pieces of code.

The `j done` is what separates the two halves. An `if` with an `else` has two pieces of code and
only one of them may run, so the first one ends by jumping over the second; leave the `j` out and
the program falls through into `a_is_bigger` and overwrites the answer it just wrote. An `if` with
no `else`, like the second `sub` below it, has nothing to jump over.

`t2` comes out at `00000040`, which is 64, and `t4` at `0000001B`, which is 27. `bgez` reads the
register the `sub` above it wrote, so no second comparison is needed: the subtraction that computed
the difference has already put it somewhere a branch can look at. `bgez t4, positive` is
`bge t4, zero, positive` written short, since `zero` is what a comparison against nothing uses.

`sub t4, zero, t4` is how a sign is flipped, since 0 minus a number is its negative. `neg t4, t4` is
the assembler's name for that same instruction.

`blt` and `bgez` are the **signed** branches, which is the family you want for numbers that can go
below zero. Writing `bltu` there would read both registers as unsigned, and a negative `t0` would
then be a very large number.

Try changing `li t0, 37` to `li t0, 99`. `t2` comes out at 99 and `t4` at 35, and the two branches
that were not taken are now the ones that are.
