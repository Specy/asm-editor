The stack lecture of Assembly basics pushed by hand, with a `sub #4, sp` and then a
`move.l #$33333333, (sp)`. On the M68K you do not have to: `-(sp)` and `(sp)+` are the predecrement
and postincrement addressing modes applied to `a7`, and they are a push and a pop.

## Push and pop

`move.l d0, -(sp)` subtracts 4 from `sp` and writes `d0` at the new address, which is a push.
`move.l (sp)+, d0` reads at `sp` and then adds 4, which is a pop. The 4 is the `.l`, so the stack
pointer moves by the size of what you put on it.

The stack pointer starts at `$1000000`, one byte past the end of memory, and grows downwards.

```m68k|playground|memory|no-flags
    move.l #$11111111, d0
    move.l #$22222222, d1
    move.l d0, -(sp)    ; push d0
    move.l d1, -(sp)    ; push d1
    move.l (sp)+, d2    ; pop into d2
    move.l (sp)+, d3    ; pop into d3
```

Step through it and watch `a7` in the registers panel. Before the first push the stack is empty and
`a7` holds `01000000` (🟢 is the stack pointer, `????????` is memory nobody has written):

|    address |  value   |
| ---------: | :------: |
|  `$FFFFF8` | ???????? |
|  `$FFFFFC` | ???????? |
| `$1000000` |    🟢    |

`move.l d0, -(sp)` drops `a7` to `$FFFFFC` and writes there:

|    address |    value    |
| ---------: | :---------: |
|  `$FFFFF8` |  ????????   |
|  `$FFFFFC` | 🟢 11111111 |
| `$1000000` |             |

`move.l d1, -(sp)` drops it another 4 and writes underneath:

|    address |    value    |
| ---------: | :---------: |
|  `$FFFFF8` | 🟢 22222222 |
|  `$FFFFFC` |  11111111   |
| `$1000000` |             |

Then the two pops read them back in the other order, so `d2` gets `22222222` and `d3` gets
`11111111`, and `a7` climbs back to `01000000`. Last in, first out, and the two values are still in
memory afterwards: popping moves the pointer and erases nothing.

Type `FFFFF8` in the memory panel's address box after running and both longs are still there.

## The size on the push

The stack pointer moves by the size of the instruction, so `move.w d0, -(sp)` takes two bytes and
`move.b d0, -(sp)` takes one. That last one leaves `sp` on an **odd address**, and the next
`move.l something, -(sp)` writes a long at an odd address, which ends the run with an address error.

So push longs. When you have a byte to keep, push it as a long with `move.l` and take the low byte
back out, or push two bytes as a word. A real 68000 goes further and quietly adjusts `a7` by 2 for a
byte push to keep the stack even; this simulator moves it by 1, so the rule here is simply never to
push a byte.

## movem saves a list at once

`movem.l d0-d2/a0, -(sp)` pushes four registers in one instruction. The list is written with `-` for
a range and `/` between items, in any order you like, and `movem.l (sp)+, d0-d2/a0` brings them back.

```m68k|playground|memory|no-flags
    move.l #$11111111, d0
    move.l #$22222222, d1
    move.l #$33333333, d2
    move.l #$AAAAAAAA, a0
    movem.l d0-d2/a0, -(sp)     ; four registers, one instruction
    move.l #$FF, d0             ; now destroy all four
    move.l #$FF, d1
    move.l #$FF, d2
    move.l #$FF, a0
    movem.l (sp)+, d0-d2/a0     ; and take them back
```

All four registers end at the values they started with. After the first `movem`, `a7` is at
`$FFFFF0`, sixteen bytes down, and the stack looks like this:

|   address |    value    | register |
| --------: | :---------: | -------- |
| `$FFFFF0` | 🟢 11111111 | `d0`     |
| `$FFFFF4` |  22222222   | `d1`     |
| `$FFFFF8` |  33333333   | `d2`     |
| `$FFFFFC` |  AAAAAAAA   | `a0`     |

The order is the instruction's, not your list's: with `-(sp)` the registers go down from `a7` to
`a0` and then `d7` to `d0`, so the lowest numbered data register ends up nearest the stack pointer.
Write `movem.l a0/d2/d1/d0, -(sp)` and you get exactly the same four longs in exactly the same
places. What matters is that the pop form reverses it, so the two lines are always each other's
opposite as long as the lists match.

`movem` writes no flags at all, which is why it can sit between a comparison and its branch.

## pea and scratch space

`pea label` pushes an **address** without loading it into a register first, which is `lea` and a push
in one instruction.

```m68k|playground|memory|no-flags
    pea target          ; push the address of target
    move.l (sp), d0     ; read it back without popping
    move.l (sp)+, a0    ; and now pop it into an address register
    move.l (a0), d1     ; what is at that address

    org $2000
target: dc.l $DEADBEEF
```

`d0` and `a0` both come out at `00002000` and `d1` at `DEADBEEF`. `(sp)` with no `+` and no `-` reads
the top of the stack and leaves the pointer where it is, which is how you look at what you pushed
without giving it up.

The other use of the stack is room. `sub.l #16, sp` takes sixteen bytes of scratch space, which you
then reach as `(sp)`, `4(sp)`, `8(sp)` and `12(sp)`, and `add.l #16, sp` gives it back. Nothing
allocates it and nothing checks it: the stack is memory, and the stack pointer is the only record of
which part of it is yours.

Every byte you take has to be given back before the subroutine you are in returns, because the return
address is sitting under everything you pushed. That is the subject of the next lecture.

## Your turn

The test starts `d0` at `$11111111` and `d1` at `$22222222`, and wants them exchanged. Do it with
the stack holding one of them, in three instructions, without `exg` and without a third register.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": "0x11111111", "d1": "0x22222222" },
    "expectedRegisters": { "d0": "0x22222222", "d1": "0x11111111" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l d0, -(sp)    ; push the old d0
    move.l d1, d0       ; d0 = d1
    move.l (sp)+, d1    ; d1 = the old d0
```

</details>

The second one starts `d0`, `d1` and `d2` at 1, 2 and 3, and the three `move.l #$FF` lines in the
middle are not yours to change. Save the three registers before them and put them back afterwards,
in one instruction each way.

```m68k|playground|exercise
* save d0, d1 and d2 here

    move.l #$FF, d0
    move.l #$FF, d1
    move.l #$FF, d2

* and bring them back here
```

```testcase
{
    "startingRegisters": { "d0": 1, "d1": 2, "d2": 3 },
    "expectedRegisters": { "d0": 1, "d1": 2, "d2": 3 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    movem.l d0-d2, -(sp)    ; three registers pushed

    move.l #$FF, d0
    move.l #$FF, d1
    move.l #$FF, d2

    movem.l (sp)+, d0-d2    ; and popped back
```

</details>
