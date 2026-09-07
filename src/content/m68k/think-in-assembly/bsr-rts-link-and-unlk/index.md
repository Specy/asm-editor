`bsr label` pushes the address of the next instruction onto the stack and jumps to the label. `rts`
pops it back into the program counter. That pair is the whole of calling and returning on the M68K.
Getting the arguments in and the answer out takes more, and so does giving a subroutine local
variables of its own.

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

`d0` and `d1` both come out at `0000001E`, which is 30. Step through it and watch `a7` drop by 4 at
the `bsr` and climb back at the `rts`, and the program counter jump to `$1010` and back to `$1008`.

The `bra end` above `triple` is there because a subroutine is code like any other and the program
would otherwise walk straight into it after the `move.l d0, d1`. Falling into a subroutine gives you
an `rts` with nothing of yours on the stack, which pops whatever is there and jumps to it.

`jsr` is the other call instruction. `bsr` takes a label; `jsr` takes an address the way `lea` does,
so `jsr (a0)` calls whatever address `a0` holds, which is how you call through a function pointer or
out of a jump table.

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

`d0` and `d1` come out at 10, and `d2` and `d3` come out at 0, the values the caller had. The
`movem.l` pair at the two ends of `double` is what makes that true, and it is what a **calling
convention** asks a subroutine to do: a list of registers it must leave as it found them, and a list
it is free to destroy. The two sides here are both yours, so the convention is whatever you write in
the comment above the label, and writing it down is the point.

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

`d0` comes out at `0000002A`, which is 42. At the moment `add_two` starts, the stack holds:

|   address |    value    | reached as | what it is         |
| --------: | :---------: | ---------- | ------------------ |
| `$FFFFF4` | 🟢 00001008 | `(sp)`     | the return address |
| `$FFFFF8` |  00000016   | `4(sp)`    | `a`, which is 22   |
| `$FFFFFC` |  00000014   | `8(sp)`    | `b`, which is 20   |

`add.l #8, sp` after the call is the caller giving the eight bytes back, and somebody has to do it
or the stack pointer walks downwards a little further at every call until it reaches your data. Here
the caller does it, which is the convention C uses, and the alternative is `rtd` on the later 68000s,
which the subroutine uses to return and drop the arguments in one instruction.

The catch with `4(sp)` is that `sp` moves. Push anything inside the subroutine and every offset
changes, which is what the next two instructions exist to avoid.

## link and unlk

`link a6, #-8` does three things: it pushes `a6`, it copies `sp` into `a6`, and it subtracts 8 from
`sp`. `unlk a6` undoes all three: it copies `a6` back into `sp` and pops the old `a6`.

What you get is `a6` sitting still in the middle of the frame while `sp` is free to move: the
arguments are above it at `8(a6)`, `12(a6)` and so on, and the local variables are below it at
`-4(a6)`, `-8(a6)`, in the room the `#-8` reserved.

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

`d0` and `d2` come out at `00000031`, which is 49, and `d1` at 7. While the subroutine is running,
the stack looks like this:

|   address |    value    | reached as | what it is                                   |
| --------: | :---------: | ---------- | -------------------------------------------- |
| `$FFFFEC` | 🟢 00000031 | `-8(a6)`   | `local2`, the square                         |
| `$FFFFF0` |  00000007   | `-4(a6)`   | `local1`, the argument copied                |
| `$FFFFF4` |  00000000   | `(a6)`     | the caller's `a6`, and where `a6` now points |
| `$FFFFF8` |  00001008   | `4(a6)`    | the return address                           |
| `$FFFFFC` |  00000007   | `8(a6)`    | `n`, the argument                            |

That block, from the arguments down to the last local, is a **stack frame**, and `a6` holding its
middle is the **frame pointer**. It is exactly what a C compiler builds for every function that has
local variables: `8(a6)` is the first parameter, `-4(a6)` is the first local, and the saved `a6` at
`(a6)` chains one frame to the one that called it, which is what a debugger walks to print a call
stack. The editor's call stack tab is reading the same chain.

`unlk a6` before `rts` is not optional. It puts `sp` back to where the return address is, and
without it the `rts` pops a local variable and jumps to it.

## Recursion needs nothing new

A subroutine that calls itself gets a fresh frame at a fresh address every time, because every `link`
subtracts from wherever `sp` happens to be. Nothing has to be reserved and nothing has to be named:
the same `-4(a6)` in the source is a different address in every call. Locals at a fixed address would
be shared by every call and destroyed by the second one, so the frame goes on the stack, and a
recursive program in assembly comes out no longer than a loop.

## Your turn

Write a subroutine called with `bsr` that squares the number in `d0` and leaves the answer in `d0`.
The test starts `d0` at 7, so it comes back at 49.

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

The second one hands you the caller. It pushes 20 and then 22, calls `add_two`, and takes the eight
bytes back. Write the body of `add_two`, which must leave 42 in `d0` without touching the stack
pointer.

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
