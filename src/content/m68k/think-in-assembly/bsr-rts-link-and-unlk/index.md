A subroutine is code you can get to from more than one place, which means it has to come back to a
different place each time. The M68K does that with the stack. `bsr label` pushes the address of the
instruction after it and jumps to the label; `rts` pops that address back into the program counter
and carries on from there.

That pair is the whole of calling and returning. Getting the arguments in, getting the answer out,
and giving a subroutine variables of its own is the rest of this lecture.

## The call, and arguments in registers

The simplest agreement between a caller and a subroutine is that the argument arrives in a register
and the answer leaves in one.

```m68k|playground|pc|no-flags
    move.l #10, d0      ; x = 10
    bsr triple          ; x = triple(x)
    move.l d0, d1       ; y = x
    bra end

* triple(x): x arrives in d0, the answer leaves in d0
triple:
    move.l d0, d2
    add.l d2, d0
    add.l d2, d0
    rts

end:
```

Step through it and watch two things at once: `a7` drops by 4 at the `bsr` and climbs back at the
`rts`, and the program counter jumps to `$1010` and then back to `$1008`. The four bytes that
appeared on the stack are the `$1008`.

The `bra end` above `triple` is there because a subroutine is code like any other, and without it the
program would walk straight into `triple` after the `move.l d0, d1`. Falling into a subroutine that
way gives you an `rts` with nothing of yours on the stack, so it pops whatever happens to be there
and jumps to it.

`jsr` is the other call instruction. `bsr` takes a label; `jsr` takes an address the way `lea` does,
so `jsr (a0)` calls whatever address `a0` is holding, which is how you call a subroutine you picked
while the program was running.

```m68k|playground|no-flags
    move.l #5, d0
    lea double, a0
    jsr (a0)            ; call the address in a0
    move.l d0, d1
    bra end

* double(x): saves the registers it works with
double:
    movem.l d2/d3, -(sp)    ; the caller's d2 and d3, kept
    move.l d0, d2
    add.l d2, d0
    move.l #$FF, d3         ; scratch nobody outside will see
    movem.l (sp)+, d2/d3    ; and given back
    rts

end:
```

`d2` and `d3` come out holding what the caller left in them, not what `double` put there, and the
`movem.l` pair at the two ends of `double` is the only reason. An agreement of that kind is called a
**calling convention**: a list of registers a subroutine must leave as it found them, and a list it
is free to destroy. Both sides here are yours, so the convention is whatever you write in the comment
above the label, and writing it down is the point of writing it at all.

## Arguments on the stack

Registers run out. When a subroutine takes more arguments than you want to spend registers on, the
caller pushes them and the subroutine reads them where they landed.

The return address is on top of them, because `bsr` pushed it last. So inside the subroutine, before
anything else is pushed, `(sp)` is the return address, `4(sp)` is the last argument pushed and
`8(sp)` the one before it.

```m68k|playground|memory|no-flags
    move.l #20, -(sp)   ; the second argument
    move.l #22, -(sp)   ; the first argument
    bsr add_two
    add.l #8, sp        ; the caller takes the arguments back off
    bra end

* add_two(a, b): a at 4(sp), b at 8(sp), the answer in d0
add_two:
    move.l 4(sp), d0    ; a
    add.l 8(sp), d0     ; + b
    rts

end:
```

At the moment `add_two` starts, the stack holds:

|   address |    value    | reached as | what it is         |
| --------: | :---------: | ---------- | ------------------ |
| `$FFFFF4` | 🟢 00001008 | `(sp)`     | the return address |
| `$FFFFF8` |  00000016   | `4(sp)`    | `a`, which is 22   |
| `$FFFFFC` |  00000014   | `8(sp)`    | `b`, which is 20   |

`add.l #8, sp` after the call is the caller giving those eight bytes back. Somebody has to, or the
stack pointer creeps downwards a little further at every call until it reaches your data.

## link and unlk

Here is the problem with `4(sp)`.

Suppose `add_two` needs `d2` for something and has to save it first, so it starts with
`move.l d2, -(sp)`. That push moved `sp` down by four, so `a` is no longer at `4(sp)`, it is at
`8(sp)`, and `b` has moved to `12(sp)`. Every offset in the subroutine has to be rewritten. Add a
second push later and they all move again. Push in one branch of an `if` and not the other and there
is no number that is right in both places.

What you want is one landmark that stays where it is for the whole call, and then to measure
everything from that instead of from `sp`. That is all a frame pointer is, and `link` sets one up:

`link a6, #-8` does three things in one instruction.

1. It pushes `a6`, saving whatever the caller had in it.
2. It copies `sp` into `a6`. That is the landmark, planted, and nothing after this moves it.
3. It subtracts 8 from `sp`, which reserves eight bytes of room below the landmark for your own
   variables.

`unlk a6` undoes all three: it copies `a6` back into `sp`, which throws away the room in one go, and
then pops the caller's `a6`.

Once the landmark is planted, everything has a fixed name. The arguments are **above** it, at
`8(a6)`, `12(a6)` and so on. Your own variables are **below** it, at `-4(a6)`, `-8(a6)`, in the room
the `#-8` reserved. Push as much as you like in between and not one of those numbers changes.

```m68k|playground|memory|no-flags
    move.l #7, -(sp)    ; the argument
    bsr squares
    add.l #4, sp
    bra end

* squares(n): n sits at 8(a6) once the frame is up
squares:
    link a6, #-8        ; a frame with eight bytes of locals
    move.l 8(a6), d0    ; n
    move.l d0, -4(a6)   ; local1 = n
    mulu d0, d0
    move.l d0, -8(a6)   ; local2 = n * n
    move.l -4(a6), d1
    move.l -8(a6), d2
    unlk a6
    rts

end:
```

Step through it and watch the stack in three states. 🟢 marks where `sp` is pointing and 🔷 where
`a6` is.

**At `squares:`, before the `link`.** The caller pushed the argument, then `bsr` pushed the return
address on top of it. `a6` is still the caller's and has nothing to do with this.

|   address |    value    | what it is         |
| --------: | :---------: | ------------------ |
| `$FFFFF8` | 🟢 00001008 | the return address |
| `$FFFFFC` |  00000007   | `n`, the argument  |

**After `link a6, #-8`.** The old `a6` has been pushed, `a6` now points at where it went, and `sp` has
dropped eight bytes below that to leave room. The two reserved longs still read `FFFFFFFF`, because
nobody has written them yet.

|   address |    value    | reached as | what it is                 |
| --------: | :---------: | ---------- | -------------------------- |
| `$FFFFEC` | 🟢 FFFFFFFF | `-8(a6)`   | `local2`, room only so far |
| `$FFFFF0` |  FFFFFFFF   | `-4(a6)`   | `local1`, room only so far |
| `$FFFFF4` | 🔷 00000000 | `(a6)`     | the caller's `a6`, saved   |
| `$FFFFF8` |  00001008   | `4(a6)`    | the return address         |
| `$FFFFFC` |  00000007   | `8(a6)`    | `n`, the argument          |

From here to the `unlk`, `a6` does not move again. `sp` is free to.

The body then runs entirely against those names. `move.l 8(a6), d0` fetches `n` and
`move.l d0, -8(a6)` writes a local, and by that point `sp` could have been pushed anywhere further
down without a single one of those offsets needing to change.

**After `unlk a6`.** `sp` jumped back up to where `a6` was and then popped it, which puts `sp` exactly
where it was when the subroutine started: on the return address, ready for `rts`.

|   address |    value    | what it is                  |
| --------: | :---------: | --------------------------- |
| `$FFFFF8` | 🟢 00001008 | the return address, next up |
| `$FFFFFC` |  00000007   | `n`, still the caller's     |

That block from the arguments down to the last local is a **stack frame**, and `a6` holding the
middle of it is the **frame pointer**. The saved `a6` at `(a6)` is the previous frame's landmark, so
the frames are a chain, each one pointing at the one that called it. The editor's call stack tab is
reading that chain.

`unlk a6` before `rts` is not optional. Take it out and `sp` is still eight bytes below the return
address, so the `rts` pops a local variable and jumps to it.

## Recursion needs nothing new

A subroutine that calls itself gets a fresh frame at a fresh address every time, because every `link`
subtracts from wherever `sp` has got to. Nothing has to be reserved and nothing has to be named in
advance: the same `-4(a6)` in the source is a different address on every call.

That is the reason locals go on the stack rather than in a fixed place in memory. A fixed address
would be shared by every call at once, so the second call would destroy the first call's variables
before the first call had finished with them.

## Your turn

Write a subroutine, called with `bsr`, that squares the number in `d0` and leaves the answer in `d0`.
`d0` starts at 7.

Remember the `bra` over the subroutine, or the program will run into it a second time.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": 7 },
    "expectedRegisters": { "d0": 49 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    bsr square
    bra end

* square(x): x arrives in d0, the answer leaves in d0
square:
    move.l d0, d1
    mulu d1, d0
    rts

end:
```

</details>

This time the caller is written for you. It pushes 20 and then 22, calls `add_two`, and takes the
eight bytes back afterwards. Fill in the body of `add_two` so that it leaves 42 in `d0`, and leave
the stack pointer exactly as you found it.

```m68k|playground|exercise
    move.l #20, -(sp)   ; the second argument
    move.l #22, -(sp)   ; the first argument
    bsr add_two
    add.l #8, sp        ; the caller gives the room back
    bra end

* add_two(a, b): a is at 4(sp) and b at 8(sp), the answer leaves in d0
add_two:
    rts

end:
```

```testcase
{
    "expectedRegisters": { "d0": 42 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l #20, -(sp)   ; the second argument
    move.l #22, -(sp)   ; the first argument
    bsr add_two
    add.l #8, sp        ; the caller gives the room back
    bra end

* add_two(a, b): a is at 4(sp) and b at 8(sp), the answer leaves in d0
add_two:
    move.l 4(sp), d0    ; a
    add.l 8(sp), d0     ; + b
    rts

end:
```

</details>
