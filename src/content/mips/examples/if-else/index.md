Two numbers sit in registers, and the program leaves the larger of them in `$t2` and the distance
between them in `$t4`. Both answers come out of the same pair of instructions, one that works a
condition out into a register and a branch that reads it.

This is the first program here where some instructions are skipped, which makes it the first one
worth stepping through slowly: you get to watch which lines the `pc` jumps over.

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

`slt $t3, $t0, $t1` asks whether `$t0` is less than `$t1` and writes the answer, a 1 or a 0, into
`$t3`. It is an ordinary instruction with an ordinary destination, so you can see where the answer
went and read it whenever you like. `beqz $t3, a_is_bigger` on the next line is what acts on it, and
it jumps when the answer was 0.

The `j done` is what separates the two halves. Only one of them may run, so the first one has to
jump over the second. Delete that line and run it: the program does `move $t2, $t1`, walks straight
into `a_is_bigger`, and overwrites the answer it just worked out. An `if` with no `else`, like the
second `sub` below it, has nothing to jump over and needs no such line.

`bgez` further down reads the register the `sub` above it wrote, which saves a comparison
altogether: the subtraction that worked out the difference has already left its sign in a register,
and `bgez` looks straight at it.

`sub $t4, $zero, $t4` is how a sign is flipped, since 0 minus a number is its negative.
`neg $t4, $t4` is the assembler's name for that same instruction.

`slt` and the branches are the **signed** family, which is the one you want for numbers that can go
below zero. Writing `sltu` there would read both registers as unsigned, and a negative `$t0` would
then be a very large number.

Change `li $t0, 37` to `li $t0, 99` and step through it again. The answers become 99 and 35, and
the two branches that were not taken the first time are the ones that are taken now, which is easier
to follow on the `pc` than to read off the page.
