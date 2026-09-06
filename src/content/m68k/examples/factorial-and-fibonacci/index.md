Two subroutines that call themselves. `factorial(8)` comes back as 40320 in `d6`, and `fib(10)` comes
back as 55 in `d7`, and neither of them has a loop anywhere: the repetition is the calls.

Stack arguments and a stack frame built one frame for one call. Recursion is the same instructions
with nothing added, because `link` subtracts from wherever `sp` happens to be, so every call gets a
frame of its own at a fresh address and `8(a6)` means this call's argument.

**You need to know:** the "Stack arguments and a stack frame" Example and the "bsr, rts, link and
unlk" lecture. What is new here is a subroutine calling itself, which needs no mechanism the previous
program did not already use.

```m68k|playground|memory|no-flags
    move.l #8, -(sp)        ; n = 8
    bsr factorial
    add.l #4, sp
    move.l d0, d6           ; 8!
    move.l #10, -(sp)       ; n = 10
    bsr fib
    add.l #4, sp
    move.l d0, d7           ; fib(10)
    bra end

* factorial(n): n at 8(a6), the answer in d0
factorial:
    link a6, #0             ; a frame with no locals, only the argument
    move.l 8(a6), d0        ; n
    cmp.l #1, d0
    ble one                 ; if(n <= 1) return 1
    subq.l #1, d0
    move.l d0, -(sp)
    bsr factorial           ; factorial(n - 1)
    add.l #4, sp
    move.l 8(a6), d1        ; n again, out of this call's own frame
    mulu d1, d0             ; n * factorial(n - 1)
    bra factorial_done
one:
    move.l #1, d0
factorial_done:
    unlk a6
    rts

* fib(n): n at 8(a6), one long of local room at -4(a6), the answer in d0
fib:
    link a6, #-4
    move.l 8(a6), d0        ; n
    cmp.l #2, d0
    blt fib_done            ; fib(0) is 0 and fib(1) is 1
    subq.l #1, d0
    move.l d0, -(sp)
    bsr fib                 ; fib(n - 1)
    add.l #4, sp
    move.l d0, -4(a6)       ; kept across the second call
    move.l 8(a6), d0
    subq.l #2, d0
    move.l d0, -(sp)
    bsr fib                 ; fib(n - 2)
    add.l #4, sp
    add.l -4(a6), d0        ; fib(n - 1) + fib(n - 2)
fib_done:
    unlk a6
    rts

end:
```

The `move.l 8(a6), d1` after the inner call is the line that shows what a frame is for. `n` was in
`d0` before the call and the call destroyed it, so the subroutine reads it again out of the frame
that belongs to this call, at an address seven other calls are not using. A local variable at a
fixed address would be shared by every call and overwritten by the second one.

`factorial` takes twelve bytes of stack per call: four for the argument the caller pushes, four for
the return address `bsr` pushes and four for the `a6` that `link` pushes. Step into the calls and
`a7` drops by twelve at each one, down to `00FFFFA0` at the deepest, where `n` is 1 and the recursion
turns round. `fib` takes sixteen, because of the long of local room it asked for.

`fib` is the expensive one: `fib(n)` calls itself twice, so the number of calls roughly doubles for
every 1 you add to `n`, and the whole program is 2137 instructions for a number you could get with a
loop and two registers. Recursion is written to be read, not to be quick.

Try changing `move.l #8, -(sp)` to `move.l #9, -(sp)` and `d6` comes out at `00058980`, which is the
right answer, 362880. Change it to `move.l #10, -(sp)` and `d6` comes out at `00055F00`, which is
352000 and simply wrong: `mulu` multiplies two **words**, and 362880 does not fit in one.
