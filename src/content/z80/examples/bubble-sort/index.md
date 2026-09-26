This program sorts eight bytes in memory into ascending order, in place: it changes the array
itself rather than making a second array. The inner loop compares neighbouring bytes and swaps a
pair that is out of order. One full pass moves the largest remaining byte to the right end. Later
passes need fewer comparisons because those rightmost bytes are already in place.

Before running it, look only at the first pair, `42, 8`. Will the first inner-loop comparison swap
them? If so, what will the first two bytes at `9000` be immediately afterwards? Then choose
**Build** and use **Step** until execution reaches `in_order` for the first time.

```z80|playground|memory|no-flags|allow-open
count equ 8

    .org 0x8000
    ld c, count-1       ; the outer loop runs count-1 times
outer:
    ld hl, numbers      ; back to the first element
    ld b, c             ; the inner loop is one shorter every pass
inner:
    ld a, (hl)          ; left = numbers[i]
    inc hl
    cp (hl)             ; left - right
    jr c, in_order      ; already in order, so leave them
    ld d, (hl)          ; otherwise swap them
    ld (hl), a
    dec hl
    ld (hl), d
    inc hl
in_order:
    djnz inner
    dec c
    jr nz, outer
    halt

    .org 0x9000
numbers: .db 42, 8, 15, 4, 23, 16, 99, 1
```

There are two counters. `c` starts at 7 and records how many passes, and therefore how many
comparisons in the next pass, remain. At `outer`, `ld b, c` makes `b` the inner-loop count.
`djnz inner` decrements `b` and jumps back while `b` is not zero, so it consumes `b` completely.
Afterward, `dec c` and `jr nz, outer` start the next, shorter pass. Here `c` is a register; the
**C flag** mentioned by the comparison is a separate thing.

The pointer moves inside each comparison. `ld a, (hl)` reads the left byte, then `inc hl` moves
`hl` onto the right byte. Thus `cp (hl)` compares the left byte in `a` with the right byte in
memory. When execution reaches `in_order`, `hl` is already at the right byte, ready for that byte
to be the left byte of the next comparison.

For example, with `hl = 9000` and the pair `42, 8`, the swap takes these steps:

| Point in the code | `hl` | Bytes at `9000 9001` |
| --- | --- | --- |
| Before `ld a, (hl)` | `9000` | `2A 08` |
| After `inc hl` | `9001` | `2A 08` |
| After `ld (hl), a` | `9001` | `2A 2A` |
| After `dec hl`; `ld (hl), d`; `inc hl` | `9001` | `08 2A` |

`cp (hl)` sets the C flag when the unsigned left byte is strictly smaller than the right byte.
Then `jr c, in_order` skips the swap because the pair is already ascending. Equal bytes do not set
C, so this program swaps them, but it writes the same two values back and leaves the array
unchanged.

Both `ld hl, numbers` and `ld b, c` belong inside the outer loop. By the end of a pass, `hl` has
walked to the last byte compared, so the next pass must start at `numbers` again. Also, `djnz` has
left `b` as `00`; reloading it from the still-useful `c` gives the next pass its correct length.

Choose **Run**, then open the memory panel at `9000`. The eight bytes should read
`01 04 08 0F 10 17 2A 63`: 1, 4, 8, 15, 16, 23, 42, and 99.

<details>
<summary>Check the first-pair prediction</summary>

`42` is greater than `8`, so C is clear and the jump does not skip the swap. The first two bytes
become `08 2A`.

</details>
