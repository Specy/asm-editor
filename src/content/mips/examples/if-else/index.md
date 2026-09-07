Two numbers sit in registers, and the program leaves the larger of them in `$t2` and the distance
between them in `$t4`. Both answers come out of the same pair of instructions, one that works a
condition out into a register and a branch that reads it.

The two programs before this one ran every instruction they had, top to bottom. This is the first
one where some instructions are skipped, and stepping through it is how you watch which ones.

**You need to know:** the "Branch on compare" lecture and the "Comparing without flags" lecture.
What is new here is that a branch chooses between two pieces of code, so the piece that runs first
has to jump over the one that follows it.

```mips|playground|allow-open
.text
main:
    li $t0, 37          # a = 37
    li $t1, 64          # b = 64

    slt $t3, $t0, $t1   # is a < b?
    beqz $t3, a_is_bigger
    move $t2, $t1       # bigger = b
    j done
a_is_bigger:
    move $t2, $t0       # bigger = a
done:

    sub $t4, $t0, $t1   # distance = a - b
    bgez $t4, positive  # if(distance >= 0) it is already the answer
    sub $t4, $zero, $t4 # otherwise flip its sign
positive:
```

`slt $t3, $t0, $t1` writes 1 into `$t3` when `$t0` is less than `$t1` and 0 when it is not, which is
C's `t3 = (a < b)`. There is no flags register to leave the answer in, so it goes into a register
you named, and `beqz $t3, a_is_bigger` under it branches when that register came out 0. The M68K
writes the same two lines as `cmp.l d1, d0` and `bge`, with the answer in the condition codes and
nothing naming where it went.

The `j done` is the whole difference between the two halves. An `if` with an `else` has two pieces
of code and only one of them may run, so the first one ends by jumping over the second; leave the
`j` out and the program falls through into `a_is_bigger` and overwrites the answer it just wrote. An
`if` with no `else`, like the second `sub` below it, has nothing to jump over.

`$t2` comes out at `00000040`, which is 64, and `$t4` at `0000001B`, which is 27. `bgez` reads the
register the `sub` above it wrote, so no second comparison is needed: the subtraction that computed
the difference has already put it somewhere a branch can look at.

`sub $t4, $zero, $t4` is how a sign is flipped, since 0 minus a number is its negative.
`neg $t4, $t4` is the assembler's name for that same instruction.

`slt` and the branches are the **signed** family, which is the one you want for numbers that can go
below zero. Writing `sltu` there would read both registers as unsigned, and a negative `$t0` would
then be a very large number.

Try changing `li $t0, 37` to `li $t0, 99`. `$t2` comes out at 99 and `$t4` at 35, and the two
branches that were not taken are now the ones that are.
