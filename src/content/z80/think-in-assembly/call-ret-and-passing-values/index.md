`call label` pushes the address of the next instruction onto the stack and jumps to the label. `ret`
pops it back into the program counter. That pair is the whole of calling and returning on the Z80,
and it uses the stack from the previous lecture with no new machinery at all.

Getting the arguments in and the answer out takes more, and this is where the Z80 is thinner than the
other machines in this editor.

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

There is no `call (hl)`. Calling through a pointer, which is `f()` in C where `f` is a variable,
means pushing a return address of your own and then `jp (hl)`, and most Z80 code reaches for a jump
table and `jp (hl)` instead.

## Conditional calls and returns

`call` and `ret` both take the eight conditions from the F register lecture, which the M68K and MIPS
have no equivalent of.

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
    ret z           ; if(x == 0) return;
    inc b
    ret

done:
    halt
```

`c` comes out at `01`, so `mark` ran once out of two `call z` instructions, and `b` comes out at `01`
as well, so `check` did its work once out of two calls.

`ret cc` is the more useful of the two forms, because it turns an early exit into one byte. `ret z`
is the `if (x == 0) return;` guard that starts half the functions you have written in C.

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

The return address is on top of them, because `call` pushed it last, so from inside the subroutine
`sp` is the return address, `sp + 2` is the last argument pushed and `sp + 4` the one before it.

And here is the thin part. **The Z80 cannot address memory at an offset from `sp`.** The M68K writes
`4(sp)`, MIPS writes `8($sp)`, and this machine has no such mode: the address has to be worked out in
`hl` first.

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

`hl` comes out at `002A`, which is 42. `ld hl, 2` and `add hl, sp` is the whole idiom: `hl` now holds
`sp + 2`, and reading through `(hl)` with `inc hl` between reads walks up the arguments.

The two `pop bc` after the call are the caller giving the four bytes back, and somebody has to do it
or `sp` walks downwards a little further at every call until it reaches your data. Here the caller
does it, which is the convention C uses.

## ix as a frame pointer

The catch with `sp + 2` is that `sp` moves: push anything inside the subroutine and every offset
changes. The M68K has `link` and `unlk` to build a fixed frame pointer; the Z80 has no such
instruction, and `ix` is used for it by hand.

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

That block is a **stack frame**, and `ix` holding its bottom is the **frame pointer**, which is what a
C compiler builds for every function that has local variables and parameters on the stack. Local
variables would go below it, at negative displacements, made room for with a `ld hl, -4` and
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

## Your turn

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
