`call label` pushes the address of the next instruction onto the stack and jumps to the label. `ret`
pops it back into the program counter. That pair is the whole of calling and returning on the Z80,
and it uses the stack from the previous lecture with no new machinery at all.

Getting the arguments in and the answer out is where the work is, because the CPU has no opinion
about it at all. Nothing in the instruction set says where an argument goes. It is an agreement
between two pieces of code, and you write both of them.

## The call, and arguments in registers

The simplest agreement between a caller and a subroutine is that the argument arrives in a register
and the answer leaves in one.

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, 10        ; x = 10
    call triple     ; x = triple(x)
    ld b, a         ; y = x
    jp done

; triple(x): x arrives in a, the answer leaves in a
triple:
    ld c, a
    add a, c
    add a, c
    ret

done:
    halt
```

`a` and `b` both come out at `1E`, which is 30. Type `fff8` into the memory panel and step through it:
at the `call`, `sp` drops from `FFFF` to `FFFD` and the two bytes there become `05 80`, which is
`0x8005`, the address of the `ld b, a` that follows the call.

| address  |    value     | what it is         |
| -------- | :----------: | ------------------ |
| `0xFFFD` | 🟢 `05` `80` | the return address |
| `0xFFFF` |              |                    |

`ret` reads those two bytes into `pc` and puts `sp` back to `FFFF`, so the program carries on at
`0x8005`.

The `jp done` above `triple` is there because a subroutine is code like any other and the program
would otherwise walk straight into it after the `ld b, a`. Falling into a subroutine gives you a `ret`
with nothing of yours on the stack, which pops whatever is there and jumps to it.

There is no `call (hl)`. If you want to call a subroutine whose address the program worked out while
it was running, rather than one you named in the source, you have to push a return address yourself
and then `jp (hl)`. Most Z80 code avoids the whole question by using a jump table and `jp (hl)`.

## Conditional calls and returns

`call` and `ret` both take the same conditions a jump does, so a subroutine can return early without
a jump over a `ret`, and a call can be made only when a flag says so.

```z80|playground|no-flags
    .org 0x8000
    ld a, 0
    or a
    call z, mark    ; only called when a is zero
    ld a, 1
    or a
    call z, mark    ; and this time it is not

    ld a, 0
    call check      ; a is zero, so check leaves at once
    ld a, 5
    call check      ; and this time it does the work
    jp done

mark:
    inc c
    ret

; check(x): counts in b, and does nothing at all for zero
check:
    or a
    ret z           ; nothing to do when x is zero
    inc b
    ret

done:
    halt
```

`c` comes out at `01`, so `mark` ran once out of two `call z` instructions, and `b` comes out at `01`
as well, so `check` did its work once out of two calls.

`ret cc` is the more useful of the two, because it turns an early exit into a single byte. A
subroutine that has nothing to do when its argument is zero starts with `or a` and `ret z`, and that
is the whole guard.

## Saving registers

A subroutine that uses a register destroys what the caller had in it. Which registers a subroutine
must give back and which it is free to destroy is the **calling convention**, and here both sides are
yours, so the convention is whatever you write in the comment above the label. Writing it down is the
point.

```z80|playground|no-flags
    .org 0x8000
    ld bc, 0x1111
    ld de, 0x2222
    ld hl, 0x3333
    ld a, 5
    call work
    call shadow
    jp done

; work(x): x in a, the answer in a. Leaves bc and de as it found them.
work:
    push bc
    push de
    ld bc, 0x9999   ; scratch nobody outside will see
    ld de, 0x8888
    add a, a
    pop de          ; in the reverse order of the pushes
    pop bc
    ret

; shadow(): the same job through the alternate registers, in two instructions
shadow:
    exx             ; the caller's three go away
    ld bc, 0x9999
    ld hl, 0x7777
    exx             ; and come back
    ret

done:
    halt
```

`a` comes out at `0A`, and `bc`, `de` and `hl` come out at `1111`, `2222` and `3333`, the values the
caller had.

`work` and `shadow` save the same three pairs two different ways. The second one is the shadow set
from the registers lecture: `exx` gives a subroutine a private `bc`, `de` and `hl` in four clock
cycles, where three pushes and three pops are sixty-six. The catch is that there is only one shadow
set, so a subroutine that uses it and then calls something else that also uses it gets its own values
destroyed. `exx` works for a leaf routine and the stack works everywhere.

## Arguments on the stack

Registers run out. When a subroutine takes more arguments than you want to spend registers on, the
caller pushes them and the subroutine reads them where they landed.

This is the point where people lose the thread, so it is worth drawing. Watch the stack through the
three instructions that set the call up, with 🟢 marking where `sp` points and `????` meaning memory
nobody has written.

Before anything is pushed, `sp` is at the top of memory:

| address  | value |
| -------- | :---: |
| `0xFFF9` | ????  |
| `0xFFFB` | ????  |
| `0xFFFD` | ????  |
| `0xFFFF` |  🟢   |

The caller pushes `y` and then `x`, so the **last** argument pushed ends up nearest the top:

| address  |   value   |
| -------- | :-------: |
| `0xFFF9` |   ????    |
| `0xFFFB` | 🟢 `0016` |
| `0xFFFD` |  `0014`   |
| `0xFFFF` |           |

Then `call` pushes the return address on top of both of them, and jumps:

| address  |   value   | what it is                   |
| -------- | :-------: | ---------------------------- |
| `0xFFF9` | 🟢 `800B` | where to carry on afterwards |
| `0xFFFB` |  `0016`   | `x`, 22                      |
| `0xFFFD` |  `0014`   | `y`, 20                      |
| `0xFFFF` |           |                              |

So from inside the subroutine, `sp` itself is the return address, `sp + 2` is `x` and `sp + 4` is
`y`. The subroutine did not have to be told where they are; the order of the pushes decided it.

Now the awkward part. You know `x` is at `sp + 2`, and there is **no way to write that**. No
instruction reads memory at an offset from `sp`, and `(sp+2)` does not assemble. The address has to
be built in `hl` first, and then read through `(hl)`.

```z80|playground|no-flags
    .org 0x8000
    ld hl, 20
    push hl         ; the second argument
    ld hl, 22
    push hl         ; the first argument
    call add_two
    pop bc          ; the caller takes the four bytes back
    pop bc
    jp done

; add_two(x, y): x at sp+2 and y at sp+4 once we are inside, the answer in hl
add_two:
    ld hl, 2
    add hl, sp      ; hl points at x
    ld e, (hl)
    inc hl
    ld d, (hl)      ; de = x
    inc hl
    ld c, (hl)
    inc hl
    ld b, (hl)      ; bc = y
    ld h, b
    ld l, c         ; hl = y
    add hl, de      ; hl = x + y
    ret

done:
    halt
```

`ld hl, 2` then `add hl, sp` is the whole idiom, and it is worth memorising: `hl` now holds `sp + 2`,
which by the table above is the address of `x`. From there `inc hl` between reads walks up through
the arguments in the order they were pushed.

The two `pop bc` after the call are the caller taking its four bytes back. Somebody has to, or `sp`
creeps a little further down at every call until it eventually reaches your data and starts writing
over it. Here the caller does it, which is one of the two possible agreements; the subroutine could
do it instead, as long as both sides agree which.

## ix as a frame pointer

The catch with `sp + 2` is that `sp` moves. Push anything inside the subroutine and every offset you
worked out is suddenly two bytes wrong, and you have to keep count in your head of how deep you
currently are. The fix is to copy `sp` once, at the top, into a register that will then sit still for
the rest of the subroutine. `ix` is the register for it, because `(ix+dd)` reads memory at a fixed
offset from it, which is exactly the mode `sp` lacks.

```z80|playground|no-flags
    .org 0x8000
    ld hl, 20
    push hl
    ld hl, 22
    push hl
    call add_two
    pop de          ; the caller takes the arguments back
    pop de
    jp done

; add_two(x, y): x at (ix+4), y at (ix+6), the answer in hl
add_two:
    push ix         ; the caller's ix, kept
    ld ix, 0
    add ix, sp      ; ix = sp, and now it stops moving
    ld l, (ix+4)    ; x
    ld h, (ix+5)
    ld e, (ix+6)    ; y
    ld d, (ix+7)
    add hl, de
    pop ix
    ret

done:
    halt
```

`hl` comes out at `002A` again. While the subroutine is running, the stack looks like this:

| address  |   value   | reached as | what it is         |
| -------- | :-------: | ---------- | ------------------ |
| `0xFFF7` | 🟢 `0000` | `(ix+0)`   | the caller's `ix`  |
| `0xFFF9` |  `800B`   | `(ix+2)`   | the return address |
| `0xFFFB` |  `0016`   | `(ix+4)`   | `x`, which is 22   |
| `0xFFFD` |  `0014`   | `(ix+6)`   | `y`, which is 20   |

That block is a **stack frame**: everything one call needs, in one stretch of stack, at known
distances from a single fixed point. `ix` holding that point is the **frame pointer**. Local
variables go below it, at negative displacements, made room for with a `ld hl, -4` and
`add hl, sp` before `ld sp, hl`.

`ld ix, 0` and `add ix, sp` is two instructions for what one `ld ix, sp` would do, and there is no
`ld ix, sp`, which is the sort of gap that makes Z80 code long.

## Recursion needs nothing new

A subroutine that calls itself gets a fresh return address at a fresh place on the stack every time,
because every `call` pushes at wherever `sp` happens to be. Whatever the subroutine pushes is private
to that call for the same reason.

```z80|playground|no-flags
    .org 0x8000
    ld a, 5
    call sumto
    jp done

; sumto(n): n in a, the answer in hl. Adds up 1 to n by calling itself.
sumto:
    or a
    jr nz, more
    ld hl, 0        ; sumto(0) is 0
    ret
more:
    push af         ; n, private to this call
    dec a
    call sumto      ; hl = sumto(n - 1)
    pop af          ; n back
    ld d, 0
    ld e, a
    add hl, de      ; hl = sumto(n - 1) + n
    ret

done:
    halt
```

`hl` comes out at `000F`, which is 15, the sum of 1 to 5. Six calls are on the stack at the deepest
point, each with its own return address and its own pushed `af`, and the `pop af` in each one takes
back the `n` that call pushed.

The `push af` is what makes it work. `a` is one register and every call needs its own copy of `n`, so
the copy goes on the stack, where every call gets a different address for free.

## Two subroutines to write

Write a subroutine called `square` that squares the number in `a` and leaves the answer in `hl`. The
test starts `a` at 7, so `hl` comes back at 49, which is `0031`. The Z80 has no multiply, so add `a`
to a total `a` times, and remember that a zero has to come out at zero rather than going round 256
times.

```z80|playground|exercise
    .org 0x8000
    call square
    jp done

; square(x): x arrives in a, the answer leaves in hl
square:
    ret

done:
    halt
```

```testcase
{
    "startingRegisters": { "a": 7 },
    "expectedRegisters": { "hl": "0x0031" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    call square
    jp done

; square(x): x arrives in a, the answer leaves in hl
square:
    ld e, a
    ld d, 0         ; de = x, widened
    ld hl, 0        ; the total
    or a
    ret z           ; zero times zero, and no loop at all
    ld b, a
loop:
    add hl, de      ; total = total + x
    djnz loop       ; x times
    ret

done:
    halt
```

</details>

The second one hands you the caller. It pushes 20 and then 22, calls `add_two`, and takes the four
bytes back. Write the body of `add_two`, which must leave 42 in `hl` without moving `sp`.

```z80|playground|exercise
    .org 0x8000
    ld hl, 20
    push hl         ; the second argument
    ld hl, 22
    push hl         ; the first argument
    call add_two
    pop bc          ; the caller gives the room back
    pop bc
    jp done

; add_two(x, y): x at sp+2 and y at sp+4, the answer in hl
add_two:
    ret

done:
    halt
```

```testcase
{
    "expectedRegisters": { "hl": 42 }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld hl, 20
    push hl
    ld hl, 22
    push hl
    call add_two
    pop bc
    pop bc
    jp done

; add_two(x, y): x at sp+2 and y at sp+4, the answer in hl
add_two:
    ld hl, 2
    add hl, sp      ; hl points at x
    ld e, (hl)
    inc hl
    ld d, (hl)      ; de = x
    inc hl
    ld c, (hl)
    inc hl
    ld b, (hl)      ; bc = y
    ld h, b
    ld l, c
    add hl, de      ; hl = x + y
    ret

done:
    halt
```

</details>
