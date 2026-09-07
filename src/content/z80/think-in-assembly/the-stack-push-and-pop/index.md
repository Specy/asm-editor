The general course described the stack as a region of memory that you push values onto and pop them
back off, with one register keeping track of the top. On the Z80 that register is `sp`, it starts at
`0xFFFF`, and there are exactly two instructions.

## push and pop

- **`push rr`** subtracts 2 from `sp` and writes the pair there, high byte at the higher address.
- **`pop rr`** reads two bytes from `sp` and adds 2 to it.

Both of them move **sixteen bits at a time**, and both name a **pair**: `af`, `bc`, `de`, `hl`, `ix`
or `iy`. There is no `push a` and no `push sp`, and the build fails on either.

Build this one, type `fff8` into the memory panel's address box and press **Step** through it.

```z80|playground|memory|no-flags
    .org 0x8000
    ld hl, 0x1111
    ld bc, 0x2222
    ld de, 0x3333
    push hl
    push bc
    push de
    pop hl          ; whatever went on last comes off first
    halt
```

`sp` starts at `FFFF` and the stack is empty (🟢 is where `sp` points, `????` is memory nobody has
written):

| address  | value |
| -------- | :---: |
| `0xFFF9` | ????  |
| `0xFFFB` | ????  |
| `0xFFFD` | ????  |
| `0xFFFF` |  🟢   |

`push hl` takes `sp` down to `FFFD` and writes `1111` there:

| address  |   value   |
| -------- | :-------: |
| `0xFFF9` |   ????    |
| `0xFFFB` |   ????    |
| `0xFFFD` | 🟢 `1111` |
| `0xFFFF` |           |

`push bc` and `push de` do the same twice more, so after the third one `sp` is at `FFF9`:

| address  |   value   |
| -------- | :-------: |
| `0xFFF9` | 🟢 `3333` |
| `0xFFFB` |  `2222`   |
| `0xFFFD` |  `1111`   |
| `0xFFFF` |           |

`pop hl` reads the two bytes at `sp` into `hl` and puts `sp` back up to `FFFB`, so `hl` comes out at
`3333`, the value pushed **last**:

| address  |   value   |
| -------- | :-------: |
| `0xFFF9` |  `3333`   |
| `0xFFFB` | 🟢 `2222` |
| `0xFFFD` |  `1111`   |
| `0xFFFF` |           |

The `3333` is still in memory. Nothing erases it, and the only thing that changed is that `sp` no
longer claims it, so the next `push` will write over it. Last in, first out, which means **you pop in
the reverse order of the pushes**, and a program that pushes `bc` and then `de` gets them back with
`pop de` and then `pop bc`.

Look at the bytes rather than the words and you can see the little endian order: `0xFFFD` holds `11`
and `0xFFFE` holds `11` as well, and for `0x1234` it would be `34` at the lower address and `12` at
the higher one. `sp` always points at the low byte.

The top byte of memory, `0xFFFF`, is never written by the stack: the first `push` moves `sp` down
before it writes, so the highest byte the stack ever touches is `0xFFFE`.

## Two registers swapped, for free

Because `push` and `pop` name any pair, they are also how a value moves from one pair to another
without going through the 8 bit halves:

```z80|playground|no-flags
    .org 0x8000
    ld bc, 0x1111
    ld de, 0x2222
    push bc
    push de
    pop bc          ; bc gets what de pushed
    pop de          ; and de gets what bc pushed
    halt
```

`bc` comes out at `2222` and `de` at `1111`, and `sp` is back at `FFFF` because every push was
matched by a pop. Popping the two in the same order as the pushes is what swapped them; popping them
in reverse would have put each one back where it came from.

`push hl` and `pop de` is a two instruction copy of `hl` into `de`, which is the same length as
`ld d, h` and `ld e, l` and is what you write when the halves are awkward to name.

## Saving the flags

`af` is the pair whose low half is the flags register, and pushing it is the only way to keep a
comparison across work that would destroy it.

```z80|playground
    .org 0x8000
    ld a, 5
    cp 5            ; Z goes to 1
    push af         ; the accumulator and the flags, both kept
    ld a, 200
    add a, 100      ; which destroys both of them
    pop af          ; and back they come
    halt
```

`a` comes out at `05` and `Z` at 1, exactly as the `cp` left them. Step through it with the flags
panel open and watch `Z` go to 1, then to 0 at the `add`, then back to 1 at the `pop`.

`pop af` writes the flags register directly, so a program can also build a flags byte itself and
`push bc` / `pop af` it in, which is what a program does when it wants a particular carry.

## Saving a register round a loop

The loops lecture pushed `bc` around a nested `djnz` for exactly this reason. The general shape is:
push whatever you are about to destroy, do the work, pop it back.

```z80|playground|no-flags
    .org 0x8000
    ld hl, 0        ; the value that has to survive the inner loop
    ld b, 3
outer:
    push hl         ; both of them saved
    push bc
    ld b, 4         ; the inner loop takes b over
inner:
    djnz inner
    pop bc          ; last in, first out
    pop hl
    inc hl
    djnz outer
    halt
```

`hl` comes out at `0003` and `sp` at `FFFF`. The two pops are in the reverse order of the two pushes,
and getting that backwards is the bug you will write most often on this machine: the program keeps
running, the values are swapped, and nothing complains.

Every push has to have its pop on **every path** out of the code, an early `jr` included. A push that
is not popped leaves `sp` two bytes lower than it started, which is harmless once and fatal in a loop,
since the stack walks down through memory until it reaches your data.

## Moving the stack

`sp` is a register like any other pair, and it can be written: `ld sp, 0x9000` or `ld sp, hl` puts
the stack somewhere else. There is no reason to do it in a program on this page, since `0xFFFF` is as
far from your code as it gets, and it is how a real machine gave the stack a known place before
calling anything.

`ex (sp), hl` swaps `hl` with the two bytes on top of the stack without moving `sp`, which is how you
reach the top of the stack without disturbing what is under it.

```z80|playground|memory|no-flags
    .org 0x8000
    ld sp, 0x9000   ; the stack now grows down from 0x9000
    ld hl, 0xABCD
    push hl         ; so this lands at 0x8FFE
    ld hl, 0x1234
    ex (sp), hl     ; hl and the top of the stack trade places
    pop de
    halt
```

Type `8ff8` into the memory panel. `hl` comes out at `ABCD`, the value that was on the stack, and
`de` at `1234`, the value that went onto it. `sp` is back at `9000`.

## Your turn

The test starts `bc` at `0x1111` and `de` at `0x2222`. Swap them, using only the stack: four
instructions and no `ld`.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "bc": "0x1111", "de": "0x2222" },
    "expectedRegisters": { "bc": "0x2222", "de": "0x1111" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    push bc
    push de
    pop bc          ; popped in the same order as the pushes, so they cross
    pop de
    halt
```

</details>

The second one starts `hl` at `0xBEEF`. Copy it into `bc` with two instructions and neither of them an
`ld`.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "hl": "0xBEEF" },
    "expectedRegisters": { "bc": "0xBEEF", "hl": "0xBEEF" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    push hl         ; sixteen bits onto the stack
    pop bc          ; and off again into another pair
    halt
```

</details>
