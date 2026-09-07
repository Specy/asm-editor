The string at `$2000` is turned back to front where it lies, with no second buffer to copy it into.
Two address registers start at the two ends and walk towards each other, swapping the bytes they
point at until they meet.

Length of a string walked to the terminator to measure something. This one walks to the terminator to
find the far end and then does its work on the way back, so there are two pointers moving at once and
neither of them is a counter.

**You need to know:** the "Length of a string" Example and the "Addressing modes" lecture. What is
new here is comparing two addresses, `cmp.l a0, a1` and a branch is what tells the loop that the two
pointers have met.

```m68k|playground|memory|no-flags|allow-open
    lea text, a0        ; left = text
    move.l a0, a1       ; right = text
find_end:
    tst.b (a1)+         ; walk to the terminator
    bne find_end
    subq.l #2, a1       ; back onto the last character
swap_loop:
    cmp.l a0, a1        ; right - left
    bls done            ; while(left < right)
    move.b (a0), d0     ; t = *left
    move.b (a1), d1     ; u = *right
    move.b d1, (a0)+    ; *left++ = u
    move.b d0, (a1)     ; *right = t
    subq.l #1, a1       ; right--
    bra swap_loop
done:

    org $2000
text: dc.b 'Assembly', 0
```

The `subq.l #2, a1` is the awkward line. When `find_end` falls out, `a1` has already stepped past the
zero byte, so it is two bytes beyond the last character: one for the step it took over the
terminator, and one for the terminator itself.

The swap needs both bytes in registers before either is written, which is why `d0` and `d1` are both
loaded first. `move.b d1, (a0)+` writes and steps the left pointer in one instruction, and the right
pointer is written with a plain `(a1)` and moved by the `subq` under it, because `-(a1)` would
subtract **before** the write and put the byte in the wrong place.

`bls` is the unsigned condition, which is the right family for addresses: they are 24 bit numbers
that are never negative. The loop stops as soon as `a1` is no longer above `a0`, so a string with an
odd number of characters leaves its middle one alone, which is what you want.

Run it with the memory panel on `2000` and the eight bytes read `79 6C 62 6D 65 73 73 41`, which is
`ylbmessA`. Try changing the string to `dc.b 'Level', 0`: five characters, the `v` in the middle
stays where it is, and the memory panel reads `leveL`.
