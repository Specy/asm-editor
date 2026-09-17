You might expect a register to be a register: somewhere to keep a number, and it makes no difference
which one you pick. On the Z80 the choice is rarely free. A great many instructions exist in exactly
one form, and that form names a particular register, so where you put a value decides what you are
allowed to do with it next. Getting this right early saves a lot of code that goes round the
houses.

## The eight bit registers

There are seven, and they are all one byte wide: `a`, `b`, `c`, `d`, `e`, `h` and `l`. Any of them
can be copied into any other with `ld`, which is 49 instructions that all do the same kind of thing.

`a` is the **accumulator**, and it is the odd one out. Every 8 bit arithmetic and logic instruction
reads `a` and writes its answer back into `a`. It never says so: the instruction names only the
**operand**, which is the other value it works with, and `a` is taken for granted.

| written    | what actually happens                                      |
| ---------- | ---------------------------------------------------------- |
| `add a, b` | `a` becomes `a` plus `b`                                   |
| `sub b`    | `a` becomes `a` minus `b`                                  |
| `and b`    | `a` becomes `a` with only the bits both of them had set    |
| `or 0x40`  | `a` becomes `a` with bit 6 forced on                       |
| `xor 1`    | `a` becomes `a` with its lowest bit flipped                |
| `cp 5`     | `a` minus 5 is worked out and thrown away; only flags stay |

Notice the second row onwards name one thing where you would expect two. `sub b` means "subtract `b`
from `a`", because there is nowhere else the answer could go.

Write `add b, c` and the build fails with "no variant found for add". There is no such instruction.
`b = b + c` has to be routed through the accumulator, and the same goes for `and`, `or`, `xor`, `cp`
and `sub`.

```z80|playground
    .org 0x8000
    ld a, 0x0F      ; a = 0x0F
    ld b, 0x33      ; b = 0x33
    and b           ; a = a & b, which is 0x03
    or 0x40         ; a = a | 0x40, which is 0x43
    xor 1           ; a = a ^ 1, which is 0x42
    halt
```

`a` comes out at `42` and `bc` at `3300`: `b` was read three times and never written.

The other six are general purpose in the sense that you can move anything into them, and each of
them is also the one register some instruction insists on:

- **`b`** is the counter. `djnz` decrements it and jumps while it is not zero, and the block
  instructions count in `bc`.
- **`c`** is the port number, when a program talks to a device.
- **`d`** and **`e`** are the two halves of `de`, which is the destination pointer of the block copy
  instructions.
- **`h`** and **`l`** are the two halves of `hl`, which is _the_ pointer register on this machine.

## The pairs

`bc`, `de` and `hl` are those same registers read two at a time, high byte first: `b` is the high
byte of `bc` and `c` is the low one. There is no separate storage. `ld b, 0x12` followed by
`ld c, 0x34` leaves `bc` reading `1234`, and `ld bc, 0x1234` gets there in one instruction.

A pair is what holds an address, since an address is 16 bits and a register is 8. It is also the
only way to hold a number over 255. What you can do with one is a short list:

```z80|playground
    .org 0x8000
    ld hl, 0x1000
    ld de, 0x0234
    add hl, de      ; hl = hl + de
    inc hl          ; hl = hl + 1
    dec de          ; de = de - 1
    ld bc, 0x00FF
    inc bc          ; the carry from c into b happens for you
    halt
```

**`add hl, rr` is the only 16 bit addition.** Its destination is always `hl` (there is an
`add ix, rr` and an `add iy, rr` as well, and that is the whole list). There is no `sub hl, de`, no
16 bit `and`, and no 16 bit comparison.

`inc` and `dec` on a pair change no flag whatsoever, which is what makes them awkward. After
`dec bc` there is nothing recording whether the answer was zero, so you cannot simply jump on it;
finding out takes an `ld a, b` and an `or c` to squash the two halves together first.

## hl, the pointer

Writing `(hl)` in an instruction means "not `hl` itself, but the byte in memory at the address `hl`
holds". The parentheses are the whole of the notation.

What makes `hl` special is that **`(hl)` can stand wherever an 8 bit register can**. It is not one
addressing mode bolted onto a couple of instructions; it is a kind of eighth register that happens
to live out in memory.

```z80|playground|memory
    .org 0x8000
    ld hl, data     ; hl = the address of the first byte
    ld a, (hl)      ; a = the byte hl points at
    inc (hl)        ; add one to that byte, in memory
    add a, (hl)     ; add it to a, now that it has changed
    ld (hl), 0x55   ; overwrite it
    ld b, (hl)      ; and read it back
    halt
data:   .db 7, 8
```

Five different instructions there, and every one of them is the ordinary register form with `(hl)`
written where the register would be. `inc (hl)` is worth a second look: it increments a byte of
memory in place, without loading it anywhere first.

`bc` and `de` can point too, but only at `a`, and only in one direction each: `ld a, (de)` reads,
`ld (bc), a` writes. That is why a loop that copies bytes keeps its source in `hl` and its
destination in `de`, and why the pointer you are about to work through belongs in `hl`.

The accumulator has one more privilege. `ld a, (0x9000)` reads the byte at a fixed address written
into the instruction, and no other 8 bit register can: `ld b, (0x9000)` does not assemble. The pairs
can do it too, with `ld hl, (0x9000)` and friends, reading two bytes.

## ix and iy

`ix` and `iy` are two more 16 bit registers, and they are addressed differently: `(ix+dd)`, where
`dd` is a **displacement**, a small signed number from -128 to 127 that is written into the
instruction itself rather than held anywhere.

That is what they are for. Park `ix` at the start of a small bundle of related bytes and reach each
one by its distance from the start, without ever changing `ix`.

```z80|playground|memory
    .org 0x8000
    ld ix, player   ; ix = the address of the first byte of player
    ld a, (ix+0)    ; a = x
    ld b, (ix+1)    ; b = y
    ld (ix+2), 3    ; lives = 3
    halt
player:
    .db 10          ; x
    .db 20          ; y
    .db 0           ; lives
```

`a` comes out at `0A` and `b` at `14`, and the byte at `player + 2` becomes 3. A displacement can be
negative, so `(ix-1)` is the byte just before the one `ix` points at.

The price is speed and size. `(hl)` is one byte of instruction and `(ix+dd)` is three, because it
needs a prefix byte to say "`ix`, not `hl`" and another byte for the displacement. On a real Z80
that is roughly twice the **clock cycles**, the ticks of the CPU's clock that every instruction is
counted in. So `ix` is for structured data and `hl` is for the tight loop.

## af, and where the flags live

`f` is the flags register. It is not in the registers panel, because the flags panel above it _is_
`f`, drawn one bit at a time. No instruction loads or stores `f` on its own; it only ever moves as
the low half of the pair `af`, and only three instructions use that pair.

Two of them are `push` and `pop`, which put a pair somewhere safe and take it back again. There is a
whole lecture on where "somewhere safe" is, later in the course; for now all you need is that `push`
saves two bytes and `pop` restores them in the reverse order.

```z80|playground
    .org 0x8000
    ld a, 0x42
    cp 0x42         ; Z goes to 1, N goes to 1, so f becomes 0x42
    push af         ; both bytes put away
    ld a, 0
    pop bc          ; and brought back into bc, where we can look at them
    halt
```

`bc` comes out at `4242`. The high byte is `a`, which was `0x42`. The low byte is `f`: `Z` is bit 6
and `N` is bit 1, so `0x40` plus `0x02`, and the two halves matching is a coincidence of the number
picked. The useful part is that `push af` and `pop af` are how a subroutine borrows the flags and
gives them back.

## When you run out of registers

Here is a loop that copies bytes and counts them. The source address is in `hl`, the destination is
in `de`, the number of bytes left is in `bc`, and the byte in transit is in `a`.

That is every pair and the accumulator, all in use, and the loop has not done anything interesting
yet. Suppose you now want it to keep a running total, or to walk a second table at the same time.
There is nothing left to walk it with. Saving `hl` to memory and reloading it every time round the
loop works, and it doubles the cost of the loop.

The Z80's answer is a **second copy** of `af`, `bc`, `de` and `hl`, sitting inside the CPU, written
`af'`, `bc'`, `de'` and `hl'`. You cannot name them: no instruction reads `hl'` or writes `b'`. What
you can do is swap them with the ones you are using, and the swap costs almost nothing.

- **`exx`** swaps `bc` with `bc'`, `de` with `de'` and `hl` with `hl'`, all three at once, in four
  clock cycles.
- **`ex af, af'`** swaps `af` with `af'`, which takes the flags along with the accumulator.

So the inner loop does its work, `exx`, does its other work on a completely fresh set of three
pairs, `exx` again, and the outer loop finds everything exactly where it left it. Eight bytes of
storage that no memory access can reach and no address can name.

Two more exchanges live next to these and have nothing to do with the shadow set. **`ex de, hl`**
swaps those two pairs in one instruction, which is how a copy loop turns round: point `hl` at the
source, do the work, then `ex de, hl` and `hl` is the destination. **`ex (sp), hl`** swaps `hl` with
the two bytes most recently pushed, leaving the stack pointer where it was.

```z80|playground|memory
    .org 0x8000
    ld bc, 0x1111
    ld de, 0x2222
    ld hl, 0x3333
    exx             ; the three pairs go away and three others arrive
    ld bc, 0x4444
    exx             ; and the first three come back

    ld de, 0x1234
    ld hl, 0x5678
    ex de, hl       ; de and hl trade places
    ld bc, 0xAABB
    push bc
    ex (sp), hl     ; hl trades places with the top of the stack
    pop de
    halt
```

Step it with the registers panel open. After the first `exx` the panel shows `bc`, `de` and `hl` at
zero and `bc'`, `de'` and `hl'` holding `1111`, `2222` and `3333`. The `ld bc, 0x4444` writes
whichever copy is currently in front, so after the second `exx` the panel has `bc` back at `1111`
and `4444` sitting in `bc'`.

The second half is the two other exchanges. `ex de, hl` leaves `de` at `5678` and `hl` at `1234`.
Then `push bc` puts `AABB` away, `ex (sp), hl` swaps that with `hl`, so `hl` becomes `AABB` and the
`1234` takes its place, and `pop de` brings the `1234` back into `de`.

The reason the shadow set is in the chip at all is interrupts: a handler that has to give every
register back can do it in two instructions instead of eight pushes. Nothing here raises an
interrupt, which the "Interrupts" lecture goes into, so what you get out of it is a second `hl` for
an inner loop.

## Two to write

The test starts `bc` at `0x1111`, `de` at `0x2222` and `hl` at `0x3333`. Put all three away in the
shadow set and leave the three main pairs at zero. One instruction.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "bc": "0x1111", "de": "0x2222", "hl": "0x3333" },
    "expectedRegisters": {
        "bc": 0,
        "de": 0,
        "hl": 0,
        "bc'": "0x1111",
        "de'": "0x2222",
        "hl'": "0x3333"
    }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    exx             ; the three pairs and their shadows trade places
    halt
```

</details>

The second starts `hl` at `0x8100` and wants the sum of the three bytes at `0x8100`, `0x8101` and
`0x8102` left in `a`. They are 5, 7 and 9, so the answer is 21, which is `15` in hexadecimal. Read
them through `(hl)` and step `hl` along with `inc hl`.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "hl": "0x8100" },
    "startingMemory": [{ "type": "number-chunk", "address": "0x8100", "bytes": 1, "expected": [5, 7, 9] }],
    "expectedRegisters": { "a": "0x15" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld a, (hl)      ; the first byte
    inc hl          ; on to the next
    add a, (hl)
    inc hl
    add a, (hl)
    halt
```

</details>
