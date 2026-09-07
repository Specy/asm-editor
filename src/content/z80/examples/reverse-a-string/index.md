The string at `0x9000` is turned back to front where it lies, with no second buffer to copy it into.
Two pointers start at the two ends and walk towards each other, swapping the bytes they point at.

Length of a string walked to the terminator to measure something. This one walks to the terminator
to find the far end and then does its work on the way back, so there are two pointers moving at
once, and the length it measured on the way is what says when to stop.

**You need to know:** the "Length of a string" Example and the "Addressing on the Z80" lecture. What
is new here is a second pointer in `de`, which can be written through with `ld (de), a` and nothing
else, so the byte being moved has to pass through the accumulator.

```z80|playground|memory|no-flags|allow-open
    .org 0x8000
    ld hl, text     ; p = text
find_end:
    ld a, (hl)
    or a
    jr z, at_end    ; hl stops on the terminator
    inc hl
    jr find_end
at_end:
    ld d, h
    ld e, l
    dec de          ; right = the last character
    ld bc, text
    or a            ; C = 0 before the only 16 bit subtraction there is
    sbc hl, bc      ; hl = the length
    ld a, l
    srl a           ; half of it, which is how many swaps there are
    jr z, done      ; a string of one character has none
    ld b, a
    ld hl, text     ; left = text, again
swap:
    ld a, (de)      ; u = *right
    ld c, a
    ld a, (hl)      ; t = *left
    ld (hl), c      ; *left = u
    ld (de), a      ; *right = t
    inc hl          ; left++
    dec de          ; right--
    djnz swap
done:
    halt

    .org 0x9000
text:   .asciz "Assembly"
```

The M68K writes this loop as "while `left` is below `right`", one `cmp.l a0, a1` per pass. The Z80
has no comparison on a pair at all: `cp` compares against `a` and `a` is eight bits, and the only 16
bit subtraction, `sbc hl, de`, writes over `hl`, which here is one of the two pointers. So the loop
counts instead. The length is measured once, `srl a` halves it, and `djnz` runs exactly that many
swaps.

Halving with a shift is where the odd lengths are taken care of: `srl a` throws the bottom bit away,
so a string of five characters gives two swaps and its middle character is never touched, which is
what you want.

The swap needs both bytes in registers before either is written, which is why `c` holds one of them
while `a` carries the other. `ld a, (de)` and `ld (de), a` are the only two instructions that reach
memory through `de`, and neither of them will name any register but `a`, so the byte from the right
hand end goes into `a` first and then into `c` to get out of the way.

Run it with the memory panel on `9000` and the eight bytes read `79 6C 62 6D 65 73 73 41`. Press the
text button in the panel's corner and they read `ylbmessA`.

Try changing the string to `.asciz "Level"`: five characters, two swaps, the `v` in the middle stays
where it is, and the memory panel reads `leveL`.
