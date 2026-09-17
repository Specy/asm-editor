`sum_of_squares(a, b)` takes its two arguments on the stack, calls a second subroutine twice to
square them, and returns their sum in `d0`. It needs a local variable to hold the first square while
the second call runs, and that local lives on the stack too, in a frame `link` builds for it.

Passing arguments in registers works until a subroutine has to hold on to something **across** a
call. Whatever it calls is free to destroy any register it likes, so the value has to be somewhere
the callee will not reach.

```m68k|playground|memory|no-flags|allow-open
    move.l #4, -(sp)        ; the second argument, b
    move.l #3, -(sp)        ; the first argument, a
    bsr sum_of_squares
    add.l #8, sp            ; the caller takes the two arguments back off
    move.l d0, d7           ; the answer
    bra end

* sum_of_squares(a, b): a at 8(a6), b at 12(a6), the answer leaves in d0
sum_of_squares:
    link a6, #-4            ; a frame with four bytes of local room
    move.l 8(a6), d0        ; a
    bsr square
    move.l d0, -4(a6)       ; local = a * a, kept across the next call
    move.l 12(a6), d0       ; b
    bsr square
    add.l -4(a6), d0        ; a * a + b * b
    unlk a6
    rts

* square(x): x in d0, the answer in d0, and d1 is given back as it was found
square:
    move.l d1, -(sp)        ; the caller's d1, saved
    move.l d0, d1
    mulu d1, d0             ; x * x
    move.l (sp)+, d1        ; and given back
    rts

end:
```

`link a6, #-4` pushes `a6`, copies `sp` into it and then takes four more bytes of stack. Once it has
run, the frame is this, with 🟢 on the stack pointer:

|   address |    value    | reached as | what it is                                   |
| --------: | :---------: | ---------- | -------------------------------------------- |
| `$FFFFEC` | 🟢 00000009 | `-4(a6)`   | the local, `a * a`                           |
| `$FFFFF0` |  00000000   | `(a6)`     | the caller's `a6`, and where `a6` now points |
| `$FFFFF4` |  0000100C   | `4(a6)`    | the return address                           |
| `$FFFFF8` |  00000003   | `8(a6)`    | `a`                                          |
| `$FFFFFC` |  00000004   | `12(a6)`   | `b`                                          |

The arguments are above `a6` because the caller pushed them before the `bsr`, and the locals are
below it in the room the `#-4` reserved. Type `FFFFE0` in the memory panel after running and the five
longs are still lying there, since popping moves a pointer and erases nothing.

`square` keeps to a smaller agreement of its own: it uses `d1` and puts it back, so a caller in the
middle of a computation does not lose what it was holding. `unlk a6` puts `sp` back to the return
address and pops the old `a6`, and the `add.l #8, sp` in the caller is the eight bytes of arguments
being given back. `d0` and `d7` come out at `00000019`, which is 25, from 9 plus 16.

Change `add.l #8, sp` to `add.l #4, sp` and run it. The answer is still 25, every register is still
right, and nothing reports anything. The only sign is `a7`, which ends at `00FFFFFC` instead of
`01000000`: four bytes of stack that the program can never get back. Do that inside a loop and it
eats the stack a little at a time until something important is underneath it.
