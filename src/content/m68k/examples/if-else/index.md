Two numbers sit in registers, and the program leaves the larger of them in `d2` and the distance
between them in `d3`. Both answers come out of the same pair of instructions, a `cmp` that subtracts
and keeps the flags and a `b<cc>` that reads them.

The two programs before this one ran every instruction they had, top to bottom. This is the first one
where some instructions are skipped, and stepping through it is how you watch which ones.

**You need to know:** the "Compare and branch" lecture and the "The condition code register"
lecture. What is new here is that a branch chooses between two pieces of code, so the piece that runs
first has to jump over the one that follows it.

```m68k|playground|no-flags|allow-open
    move.l #37, d0      ; a = 37
    move.l #64, d1      ; b = 64

    cmp.l d1, d0        ; a - b
    bge a_is_bigger     ; if(a >= b) goto a_is_bigger
    move.l d1, d2       ; bigger = b
    bra done
a_is_bigger:
    move.l d0, d2       ; bigger = a
done:

    move.l d0, d3       ; distance = a
    sub.l d1, d3        ; distance = distance - b
    bpl positive        ; if(distance >= 0) it is already the answer
    neg.l d3            ; otherwise flip its sign
positive:
```

`cmp.l d1, d0` computes `d0 - d1` and throws the answer away, so `bge` under it means "if `a` is
greater than or equal to `b`", with the operands read back in the order you would say them. `bge` is
the signed condition, which is the one you want for numbers that can go below zero.

The `bra done` is the whole difference between the two halves. An `if` with an `else` has two pieces
of code and only one of them may run, so the first one ends by jumping over the second; leave the
`bra` out and the program falls through into `a_is_bigger` and overwrites the answer it just wrote.
An `if` with no `else`, like the `neg.l` below it, has nothing to jump over.

`d2` comes out at `00000040`, which is 64, and `d3` at `0000001B`, which is 27. `bpl` reads the `N`
flag the `sub.l` left, so no second comparison is needed: an instruction that computed something has
already said whether the answer was negative.

Try changing `move.l #37, d0` to `move.l #99, d0`. `d2` comes out at 99 and `d3` at 35, and the two
branches that were not taken are now the ones that are.
