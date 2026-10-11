This program reverses the zero-terminated string at `0x9000` in the same memory it already
occupies. `hl` starts at the left end, `de` is set to the right end, and each pass swaps their two
bytes before the pointers move inwards.

Open the program in the editor, choose **Build**, then **Run**. In the memory panel, enter `9000`.
After execution, the eight bytes are `79 6C 62 6D 65 73 73 41`, which spell `ylbmessA`.

```z80|playground|memory|no-flags|allow-open
    .org 0x8000
    ld hl, text     ; hl = the start of the string
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
    or a            ; C = 0 before subtraction
    sbc hl, bc      ; hl = the length
    ld a, l
    srl a           ; half of it = number of swaps
    jr z, done
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

The first loop is the usual scan for a zero byte. `.asciz` places that zero after the last
character. When `find_end` finishes, `hl` holds the terminator's address, `9008`; copying it to
`de` and decreasing `de` makes `de` point at the last character, `y`, at `9007`.

The program also uses that terminator address to find the length. `hl` currently holds the
terminator address, so subtracting `text` gives the number of characters: `9008 - 9000 = 0008`.
`sbc hl, bc` calculates `hl - bc - C`, so its carry input must be zero. The `or a` immediately
before it clears C while leaving the useful address in `hl` untouched. The result is eight in
`hl`; `ld a, l` takes its low byte, and `srl a` halves it to four swaps.

This version is for strings shorter than 256 characters: it takes the length from `l`. Four swaps
are enough because each one fixes a pair of positions, one at each end. For an odd length, the
shift drops the leftover one: five characters need two swaps, leaving the middle character alone.

At the start of `swap`, both old bytes are read before either memory location is written. `a` first
holds the right byte and `c` saves it; `a` then receives the left byte. The two stores put those
saved values at the opposite ends. `inc hl` and `dec de` move the pointers towards the next pair,
and `djnz` repeats for the count in `b`.

An empty string is safe here. `dec de` does make `de` point before the terminator, but the computed
length is zero, so `srl a` leaves zero and `jr z, done` stops before `swap` reads through `de`.

Try changing the data line to `text: .asciz "Hello"`. Before building and running, predict the
text shown at `9000` afterwards.

<details>
<summary>Check your answer</summary>

It is `olleH`. The length is five, so the shifted count is two: the first and last characters swap,
then the second and second-last swap. The middle `l` stays where it is.

</details>
