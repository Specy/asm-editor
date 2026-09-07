The first lecture listed the registers. Let's now go through what each of them is for, because on
the Z80 the choice is rarely free: a lot of instructions exist in one form only, and that form names
a particular register.

## The eight bit registers

There are seven, and they are all one byte wide: `a`, `b`, `c`, `d`, `e`, `h` and `l`. Any of them
can be loaded from any other with `ld`, which gives you 49 instructions that all do the same kind of
thing.

`a` is the **accumulator**. Every 8 bit arithmetic and logic instruction reads it and writes it, and
the instruction only names the _other_ operand:

| written    | what it does        | in C            |
| ---------- | ------------------- | --------------- |
| `add a, b` | `a = a + b`         | `a += b;`       |
| `sub b`    | `a = a - b`         | `a -= b;`       |
| `and b`    | `a = a & b`         | `a &= b;`       |
| `or 0x40`  | `a = a \| 0x40`     | `a \|= 0x40;`   |
| `xor 1`    | `a = a ^ 1`         | `a ^= 1;`       |
| `cp 5`     | `a - 5`, flags only | `a == 5` etc... |

Write `add b, c` and the build fails with "no variant found for add", because there is no such
instruction: `b = b + c` has to go through `a`. The same goes for `and`, `or`, `xor`, `cp` and `sub`,
which take one operand because the other one is always `a`.

```z80|playground
    .org 0x8000
    ld a, 0x0F      ; a = 0x0F
    ld b, 0x33      ; b = 0x33
    and b           ; a = a & b, which is 0x03
    or 0x40         ; a = a | 0x40, which is 0x43
    xor 1           ; a = a ^ 1, which is 0x42
    halt
```

`a` comes out at `42` and `bc` at `3300`, because `b` was only ever read. Try adding `and c` at the
end: `c` is zero, so `a` becomes zero too and the `Z` flag goes to 1.

The other six are general purpose, and each of them is also the operand of some instruction that
names it and nothing else:

- **`b`** is the counter. `djnz` decrements it and jumps while it is not zero, the block instructions
  count in `bc`, and `in r,(c)` puts `b` on the high half of the address bus.
- **`c`** is the port number of `in r,(c)` and `out (c),r`.
- **`d`** and **`e`** are the two halves of `de`, which the block copy instructions use as their
  destination pointer.
- **`h`** and **`l`** are the two halves of `hl`, which is the pointer register.

## The pairs

`bc`, `de` and `hl` are those same registers read two at a time, high byte first: `b` is the high
byte of `bc`, `c` is the low one. There is no separate storage, `ld b, 0x12` and `ld c, 0x34` leave
`bc` reading `1234`, and `ld bc, 0x1234` does it in one instruction.

A pair is what holds an address, since an address is 16 bits and a register is 8. It is also the only
way to hold a number over 255, and there are exactly four 16 bit operations to work on one with:

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

`hl` comes out at `1235`, `de` at `0233` and `bc` at `0100`. **`add hl, rr` is the only 16 bit
addition**, and its destination is always `hl` (there is an `add ix, rr` and an `add iy, rr` too, and
that is the whole list). `inc` and `dec` on a pair change no flag whatsoever, which is what makes
them awkward: after `dec bc` there is nothing to branch on, and telling whether `bc` reached zero
takes an extra `ld a, b` / `or c`.

## hl, the pointer

`(hl)` means "the byte in memory at the address in `hl`", which is `*p` in C. What makes it more than
an addressing mode is that **`(hl)` can stand in wherever an 8 bit register can**, so it is a kind of
eighth register that happens to live in RAM.

```z80|playground|memory
    .org 0x8000
    ld hl, data     ; p = &data[0]
    ld a, (hl)      ; a = *p
    inc (hl)        ; (*p)++
    add a, (hl)     ; a = a + *p
    ld (hl), 0x55   ; *p = 0x55
    ld b, (hl)      ; b = *p
    halt
data:   .db 7, 8
```

`a` comes out at `0F`, which is 7 plus 8, and `b` at `55`. Five different instructions, each of them
the register form with `(hl)` written where the register would be.

`bc` and `de` can point too, but only for `a` and only in the two directions: `ld a, (de)` and
`ld (bc), a`. That is why a loop that copies bytes keeps its source in `hl` and its destination in
`de`, and why `hl` is where you put the pointer you are about to work through.

The accumulator has one more thing to itself. `ld a, (0x9000)` reads the byte at a fixed address, and
no other 8 bit register can do that: `ld b, (0x9000)` does not assemble. The pairs can, with
`ld hl, (0x9000)` and friends, which read two bytes.

## ix and iy

`ix` and `iy` are 16 bit registers that are addressed as `(ix+dd)`, where `dd` is a signed
displacement from -128 to 127 written into the instruction. In C that is `p->field`, a fixed offset
from a pointer, and it is what `ix` is for: park it at the start of a record and reach the fields by
name.

```z80|playground|memory
    .org 0x8000
    ld ix, player   ; p = &player
    ld a, (ix+0)    ; a = p->x
    ld b, (ix+1)    ; b = p->y
    ld (ix+2), 3    ; p->lives = 3
    halt
player:
    .db 10          ; x
    .db 20          ; y
    .db 0           ; lives
```

`a` comes out at `0A` and `b` at `14`, and the byte at `player + 2` becomes 3. The displacement can
be negative, so `(ix-1)` is the byte before the one `ix` points at.

The price is speed and size. `(hl)` is one byte of instruction, `(ix+dd)` is three, because it needs a
prefix byte to say "this is `ix`, not `hl`" and another byte for the displacement. On a real Z80 that
is roughly twice the clock cycles, so `ix` is for structured data and `hl` is for the tight loop.

## af, and the flags in a register

`f` is the flags register, and it is not in the registers panel because the flags panel above it _is_
`f`, drawn one bit at a time. No instruction loads or stores `f` on its own. It moves as the low half
of the pair `af`, and only three instructions use that pair: `push af`, `pop af` and `ex af, af'`.

```z80|playground
    .org 0x8000
    ld a, 0x42
    cp 0x42         ; Z goes to 1, N goes to 1, so f becomes 0x42
    push af         ; both bytes onto the stack
    ld a, 0
    pop bc          ; and back off into bc, to look at them
    halt
```

`bc` comes out at `4242`: the high byte is `a`, which was `0x42`, and the low byte is `f`. `Z` is bit
6 and `N` is bit 1, so `0x40` plus `0x02` is `0x42`, and the two halves reading the same is a
coincidence of the number picked. `push af` and `pop af` are how a subroutine saves the flags across
work that would destroy them.

## The shadow set and the exchanges

The Z80 has a **second copy** of `af`, `bc`, `de` and `hl` inside the CPU, written `af'`, `bc'`, `de'`
and `hl'`, and no other machine in this editor has anything like it. It is not addressable: no
instruction can name `b'` or read `hl'`. Two instructions swap the copies over.

- **`exx`** swaps `bc` with `bc'`, `de` with `de'` and `hl` with `hl'`, all three at once.
- **`ex af, af'`** swaps `af` with `af'`, which takes the flags along with the accumulator.

Two more exchanges go with them and swap things that are not the shadow set. **`ex de, hl`** swaps
those two pairs in one instruction and four clock cycles, which is how a copy loop turns round: point
`hl` at the source, work, then `ex de, hl` and `hl` is the destination. **`ex (sp), hl`** swaps `hl`
with the two bytes on top of the stack, leaving the stack pointer where it was.

Build this one and step through it with the registers panel open.

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

After the first `exx` the panel shows `bc`, `de` and `hl` at zero and `bc'`, `de'` and `hl'` holding
`1111`, `2222` and `3333`. The `ld bc, 0x4444` writes the copy that is currently in front, so after
the second `exx` the panel shows `bc` back at `1111` and `bc'` at `4444`.

Then `ex de, hl` leaves `de` at `5678` and `hl` at `1234`. The `push bc` puts `AABB` on the stack,
`ex (sp), hl` swaps it with `hl`, so `hl` becomes `AABB` and `1234` is what is on the stack now, and
the `pop de` takes that `1234` into `de`. Try deleting the `ex (sp), hl` and see `de` come back at
`AABB` instead.

The reason the shadow set exists is interrupts. A handler runs between two instructions of a program
that knows nothing about it, so it has to give back every register it touches, and pushing four pairs
and popping them again is over eighty clock cycles. `exx` and `ex af, af'` together are eight, and
the handler gets a whole private set of registers for the price. Nothing in this editor raises an
interrupt (the "Interrupts" lecture says why), so here the shadow set is eight bytes of very fast
storage that no memory access can reach, which is how you get a second `hl` for an inner loop.

## Your turn

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

The second one starts `hl` at `0x8100` and asks for the sum of the three bytes at `0x8100`, `0x8101`
and `0x8102`, left in `a`. They are 5, 7 and 9, so the answer is 21, which is `15` in hexadecimal.
Read them through `(hl)` and step `hl` along with `inc hl`.

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
    ld a, (hl)      ; a = *p
    inc hl          ; p++
    add a, (hl)     ; a = a + *p
    inc hl
    add a, (hl)
    halt
```

</details>
