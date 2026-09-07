Twelve bytes in order, and the program finds which one holds 91 by halving the range it is looking
in until nothing is left. It leaves the index in `e`, or `FF` when the value is not in the array.
Two elements are read out of the twelve, where walking the array would read ten.

Bubble sort left an array in order. This is what being in order is worth: every comparison throws
away half of what is left, so an array of a thousand elements takes about ten reads and one of a
million takes about twenty.

**You need to know:** the "Bubble sort" Example and the "Addressing on the Z80" lecture. What is new
here is a loop that jumps straight to an element instead of walking to it, which on this machine is
an address worked out by hand every time round.

```z80|playground|memory|no-flags|allow-open
count equ 12

    .org 0x8000
    ld d, 91            ; the value we are looking for
    ld b, 0             ; low = 0
    ld c, count         ; high = count, one past the last element
    ld e, 0xFF          ; found = -1, meaning not there
search:
    ld a, b
    cp c
    jr nc, search_done  ; while(low < high)
    add a, c            ; low + high
    srl a               ; mid = (low + high) / 2
    push af             ; mid, kept while a is used for the element
    ld hl, numbers
    add a, l
    ld l, a
    jr nc, addressed
    inc h               ; the carry into the high byte
addressed:
    ld a, (hl)          ; numbers[mid]
    cp d                ; numbers[mid] - target
    jr z, hit
    jr c, go_right      ; it was too small, look above it
    pop af              ; mid back
    ld c, a             ; high = mid
    jr search
go_right:
    pop af
    inc a
    ld b, a             ; low = mid + 1
    jr search
hit:
    pop af
    ld e, a             ; found = mid
search_done:
    halt

    .org 0x9000
numbers: .db 2, 5, 8, 12, 16, 23, 38, 56, 72, 91, 100, 127
```

`srl a` is the halving: shifting a number one place right divides it by two and throws the remainder
away, which is the rounding down that `(low + high) / 2` wants. It is the unsigned shift, which is
right here because an index is never negative.

`high` is **one past** the range it is looking in, so it starts at `count` and the loop runs while
`low < high`. The M68K page keeps the last index instead and lets it go down to -1, which it can
afford because it is working in longs. Here `low` and `high` are bytes, and a byte that goes below
zero comes back as 255, which as an unsigned comparison is the largest number there is and would
keep the loop going forever. Nothing in the program ever subtracts past zero now.

The four instructions after `ld hl, numbers` are how a byte gets added to a pair, because there is
no `add hl, a`: the low half is added in `a`, and the carry out of that addition is what `inc h`
puts into the high half. It is two instructions when the array cannot cross a 256 byte boundary and
four when it might, and this one keeps the `jr nc` because you cannot see from the source where the
assembler put the array.

`push af` and `pop af` are there because `a` has two jobs in one pass. It carries the middle index
into the address arithmetic and then has to hold the element that was read, so the index goes on the
stack for the two instructions in between and comes back in whichever branch is taken. Every path
through the loop pops exactly once, which is what keeps `sp` where it started.

The two probes are 38 and then 91. Each one either matches, or moves `low` past the middle, or
brings `high` down to it, and the loop ends when `low` catches `high` up. `e` comes out at `09`,
which is the index of 91, so `de` reads `5B09`: the target in `d` and the answer in `e`.

Try changing `ld d, 91` to `ld d, 90`, which is not in the array. `de` comes out at `5AFF`, the `FF`
that `ld e, 0xFF` put there before the loop started, because a search that finds nothing has to say
so and 0 is a perfectly good index.
