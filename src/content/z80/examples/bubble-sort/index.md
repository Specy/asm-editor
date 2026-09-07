Eight bytes in memory, sorted from smallest to largest where they lie. The inner loop compares each
pair of neighbours and swaps them when they are the wrong way round, and the outer loop keeps
sending it back, so the largest number reaches the end on the first pass and the rest follow.

Every loop up to here read an array once. This one reads it seven times, and the two counters have
to be kept apart, which on this machine means keeping them in different registers for a reason the
hardware imposes.

**You need to know:** the "Loops and djnz" lecture and the "Fill an array with the numbers from 1 to
10" Example. What is new here is nesting: the inner counter is set **inside** the outer loop,
because it has to start again from the top on every pass.

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
    jr c, in_order      ; if(left < right) leave them alone
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

**`djnz` counts in `b` and nothing else**, so the outer counter cannot be a `djnz` at all: it lives
in `c` and is written out as `dec c` and `jr nz`, three bytes in the loop instead of two. The other
way round it, from the loops lecture, is to `push bc` before the inner loop and `pop bc` after it,
and which is cheaper depends on how often the outer loop goes round.

The pointer moves inside the comparison. `ld a, (hl)` reads the left byte, `inc hl` steps onto the
right one, and `cp (hl)` compares them, so when the pass reaches `in_order` the pointer is already
on the next pair. The swap has to step back to write the left byte and step forward again, which is
what the `dec hl` and `inc hl` around it are for.

`cp (hl)` sets `C` when the left byte is the smaller, so `jr c` leaves the pair alone. Two equal
bytes have `C` at 0 and are therefore swapped, and the swap writes them back exactly as they were,
which is why one condition is enough where a strict test would need two.

Both the `ld hl, numbers` and the `ld b, c` belong inside the outer loop. `hl` has walked to the end
of the array by the time a pass finishes, so it goes back to the start; and `b` is `00` by then,
which as a `djnz` counter would run the inner loop 256 times. Copying `c` into it is also what makes
each pass shorter than the one before, since the last element is already in its place after the
first pass, the last two after the second, and so on.

Run it with the memory panel on `9000` and the eight bytes read `01 04 08 0F 10 17 2A 63`, which is
1, 4, 8, 15, 16, 23, 42 and 99. It took 245 instructions to sort eight numbers, and it would take
about four times as many to sort sixteen, because both loops grow with the array.

Try changing `jr c, in_order` to `jr nc, in_order`. The same program sorts the other way round,
largest first, because the only thing that says which order you wanted is that one condition.
