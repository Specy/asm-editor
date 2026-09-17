Two numbers sit in registers, and the program leaves the larger of them in `d2` and the distance
between them in `d3`. Both answers come out of the same pair of instructions, a `cmp` that subtracts
and keeps the flags and a `b<cc>` that reads them.

Step through it rather than running it. Some of these instructions never run at all, and which ones
depends entirely on the two numbers at the top.

```m68k|playground|no-flags|allow-open
    move.l #37, d0      ; a = 37
    move.l #64, d1      ; b = 64

    cmp.l d1, d0        ; a - b
    bge a_is_bigger     ; a is at least b, so a is the answer
    move.l d1, d2       ; bigger = b
    bra done
a_is_bigger:
    move.l d0, d2       ; bigger = a
done:

    move.l d0, d3       ; distance = a
    sub.l d1, d3        ; distance = distance - b
    bpl positive        ; not negative, so it is already the answer
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

There is no `cmp` in front of that `bpl`, and there does not need to be one. `sub.l` set `N` itself
when it computed the difference, so the branch reads the flag the arithmetic already left behind.
