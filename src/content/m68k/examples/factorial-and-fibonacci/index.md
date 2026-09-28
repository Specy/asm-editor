`factorial(8)` calls `factorial(7)`, which calls `factorial(6)`, and so on until it reaches 1.
On the way back, each call multiplies the answer by its own `n`. `fib(10)` also calls itself,
but each call above 1 needs two answers: `fib(n - 1)` and `fib(n - 2)`.

Both routines take a nonnegative long argument on the stack and return a long in `d0`. Each
invocation gets its own stack frame, so it can still find its argument after a deeper call returns.

```m68k|playground|memory|no-flags|allow-open
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

## Run both calls

Select **Build**, then **Run**. The registers panel shows `d6 = 00009D80` (40320) and
`d7 = 00000037` (55). It also shows `a7`, the stack pointer, back at `01000000`.
The caller removes each argument after its subroutine returns, while `unlk` restores that
invocation's frame before `rts` returns to the caller.

## Follow a factorial call

Select **Build** again, then use **Step**. The playground begins with `a7 = 01000000`.
Step through the first `link a6, #0`: the caller's argument, the return address from `bsr`,
and the saved `a6` occupy three longs. At this point `a7` and `a6` are `00FFFFF4`, and
`8(a6)` contains 8. Each recursive invocation uses another 12 bytes for those same three
longs. At the `link` for `n = 1`, `a7` reaches `00FFFFA0`.

Step back out until you reach `move.l 8(a6), d1` in the call where `n = 2`. Its inner call
returned 1 in `d0`. Reading `8(a6)` retrieves this invocation's 2, so `mulu` makes `d0 = 2`.
The same pattern continues for 3 through 8. Each invocation has its own argument and saved
`a6`; `unlk` restores the caller's `a6` as the calls return.

## Follow the two Fibonacci calls

In `fib`, `link a6, #-4` also reserves one local long at `-4(a6)`. Step through a call with
`n = 2`. The first inner call returns `fib(1) = 1`, which is stored at `-4(a6)`. The next
inner call returns `fib(0) = 0` in `d0`. The final `add.l` reads the saved 1 and returns
`fib(2) = 1`. The local belongs to this invocation, so deeper calls can use their own
`-4(a6)` without changing it. Including the argument, return address, saved `a6`, and local,
each active `fib` invocation uses 16 bytes of stack.

These two recursive calls repeat some work: for example, `fib(10)` reaches `fib(8)` both
through `fib(9)` and through its direct `fib(n - 2)` call.

## Try a different factorial

Change the first push to `move.l #9, -(sp)`. Before running, predict `d6` and whether `a7`
will finish at its starting value. Select **Build**, then **Run** to check.

<details>
<summary>Show answer</summary>

`d6` is `00058980` (362880), and `a7` is `01000000`.

</details>

Nine is the largest input for which this routine gives the mathematical factorial. `mulu`
multiplies only the low 16-bit word of each operand, then writes the 32-bit product to `d0`.
For `9!`, the input from `8!` is 40320, which still fits in a word. For `10!`, the input from
`9!` is 362880 (`00058980`): its low word is only `8980` (35200). The last multiplication
therefore computes `10 × 35200 = 352000`, leaving `d6 = 00055F00` instead of `10!`.
