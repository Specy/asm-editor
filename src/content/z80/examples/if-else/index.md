Two numbers sit in registers, and the program leaves the larger of them in `d` and the distance
between them in `e`. Both answers come out of the same pair of instructions, a `cp` that subtracts
and keeps the flags and a `jr` that reads them.

The two programs before this one ran every instruction they had, top to bottom. This is the first
one where some instructions are skipped, and stepping through it is how you watch which ones.

**You need to know:** the "jp, jr and the conditions" lecture and the "The F register" lecture. What
is new here is that a jump chooses between two pieces of code, so the piece that runs first has to
jump over the one that follows it.

```z80|playground|no-flags|allow-open
    .org 0x8000
    ld b, 37        ; x = 37
    ld c, 64        ; y = 64

    ld a, b
    cp c                ; x - y
    jr nc, x_is_bigger  ; if(x >= y) goto x_is_bigger
    ld d, c             ; bigger = y
    jr done
x_is_bigger:
    ld d, b             ; bigger = x
done:

    ld a, b
    sub c           ; distance = x - y
    jr nc, positive ; if it did not borrow it is the answer already
    neg             ; otherwise flip its sign
positive:
    ld e, a
    halt
```

`cp c` computes `a - c` and throws the answer away, so it needs `x` in `a` first: the accumulator is
the only register `cp` compares against, which is why the `ld a, b` above it is there and why it
comes back a second time before the subtraction.

`C` is set when the subtraction had to borrow, which is exactly when `a` was the smaller of the two,
so `jr nc` under the `cp` means "if `x` is greater than or equal to `y`". That is the **unsigned**
comparison. The M68K writes `bge` here and gets the signed one for the same price; the Z80 has no
signed condition at all, and the five instruction `S` against `P/V` test from the F register lecture
is what a program writes when its numbers can go below zero. These two cannot, so `jr nc` is the
whole test.

The `jr done` is the difference between the two halves. An `if` with an `else` has two pieces of
code and only one of them may run, so the first one ends by jumping over the second; leave the `jr`
out and the program falls through into `x_is_bigger` and overwrites the answer it just wrote. An
`if` with no `else`, like the `neg` below it, has nothing to jump over.

`d` comes out at `40`, which is 64, and `e` at `1B`, which is 27, so the panel shows `de` as `401B`.
The `sub c` sets `C` itself, so no second comparison is needed before the `jr nc`: an instruction
that computed something has already said whether it borrowed.

Try changing `ld b, 37` to `ld b, 99`. `de` comes out at `6323`, which is 99 and 35, and the two
jumps that were not taken are now the ones that are.
