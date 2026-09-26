A string sits at `0x9000` with a zero byte after it. The program walks to that zero, then subtracts
the starting address from the address it reached. The answer, 15, ends up in `hl`.

There is no separate length or count for this string. Its zero byte marks where it ends. Open the
program in the editor, choose **Build**, then use **Step** to watch `hl` move through memory. You
can also choose **Run** to see the final length in the registers panel.

```z80|playground|memory|no-flags|allow-open
    .org 0x8000
    ld hl, text     ; hl = the start of the string
    ld d, h
    ld e, l         ; keep where the string starts
scan:
    ld a, (hl)      ; the byte hl points at
    or a            ; set Z if a is zero; clear C
    jr z, found
    inc hl          ; on to the next byte
    jr scan
found:
    sbc hl, de      ; hl = end address - start address
    halt

    .org 0x9000
text:   .asciz "Assembly is fun"
more:   .asciz "!"
```

`.asciz` writes the characters in `"Assembly is fun"` followed by a zero byte. `ld a, (hl)` reads
one byte at the address in `hl`. `or a` leaves `a` unchanged and sets the Z flag when that byte is
zero. If it is not zero, `inc hl` advances to the next byte and the loop repeats. If it is zero,
`jr z, found` jumps to the subtraction without advancing `hl`.

Before the loop, `ld d, h` and `ld e, l` copy the starting address from `hl` into `de`. These are
16-bit register pairs: `h` and `d` hold their high bytes, while `l` and `e` hold their low bytes.
When the loop finds the zero, `hl` holds `900F`, the address of that zero byte, and `de` still holds
`9000`. Subtracting the addresses gives `900F - 9000 = 000F`. The registers panel shows `hl = 000F`
in hexadecimal, which is 15 in decimal. The zero is not counted because `hl` stops on it.

The Z80 has no `sub hl, de` instruction. For a 16-bit subtraction, `sbc hl, de` calculates
`hl - de - C`, where `C` is the carry flag. The `or a` used to test the byte also clears `C`, and
`jr z` does not change it. So when the jump reaches `found`, `C` is already zero and `sbc hl, de`
subtracts just the starting address. No second `or a` is needed.

Try changing `text: .asciz "Assembly is fun"` to `text: .db "Assembly is fun"`, then build and
run again. `.db` writes those characters without the ending zero. `more` begins immediately after
them, so the loop reads its `!` and stops at *its* zero byte. The result becomes `hl = 0010`, or 16,
one too many. Restore `.asciz` afterwards: the scan needs a zero byte to know where this string
ends.
