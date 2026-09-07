Four questions about one number, none of them answered with arithmetic. Is 182 odd, what is it times
eight, what are its bottom four bits, and how many of its eight bits are ones. The answers land in
`d`, `hl`, `e` and `c`.

The instructions of the Example before this one treat a register as a number. These four treat the
same register as eight bits side by side, which is the other way to read one and often the cheaper
way.

**You need to know:** the "8-bit and 16-bit arithmetic, logic and bits" lecture and the "jp, jr and
the conditions" lecture. What is new here is the carry flag as a way out of a register, `srl` drops
the bit that falls off the bottom into `C` and a jump reads it.

```z80|playground|no-flags|allow-open
N   equ 182

    .org 0x8000
    ld a, N         ; n = 182, which is 0b10110110

    ld d, 0
    bit 0, a        ; is the lowest bit set?
    jr z, even      ; Z is 1 when the bit is 0
    ld d, 1         ; d = 1 when n is odd
even:

    ld l, a
    ld h, 0         ; hl = n, widened, since n * 8 does not fit in a byte
    add hl, hl
    add hl, hl
    add hl, hl      ; n * 8, three doublings

    ld c, 0         ; bits = 0
    ld b, 8         ; eight of them
count:
    srl a           ; the lowest bit falls into C
    jr nc, no_bit
    inc c           ; bits++
no_bit:
    djnz count

    ld a, N
    and 0x0F        ; the low nibble on its own
    ld e, a
    halt
```

`bit 0, a` is C's `n & 1` without building the mask and without changing `a`, and it sets `Z` from
the bit it found **backwards**: `Z` goes to 1 when the bit was 0, which is the opposite of what you
expect the first time. So `jr z` means "the bit was clear", and `d` comes out at `00` here because
182 is even.

Multiplying by eight is three doublings, since every place a bit moves left doubles what it is
worth, and 182 times 8 is 1456, which no byte holds. So the number is widened into `hl` first, two
instructions with `ld h, 0` because the byte is unsigned, and then `add hl, hl` doubles the whole
pair in one instruction. `hl` comes out at `05B0`, which is 1456. There is no shift that takes a
pair, so `add hl, hl` is what a program writes when it is `hl` being doubled.

`and 0x0F` keeps the four bits the mask has set and clears everything else, so `e` is 6, the `6` of
`0xB6`. That is how any field is taken out of a packed value: mask what you want, then shift it down
to the bottom if it was not there already.

The loop runs eight times, once per bit, and does C's `count += n & 1; n >>= 1;` with the `& 1` done
by the shift itself. `srl a` moves every bit one place down and the bit that falls off the bottom
lands in `C`, so `jr nc` skips the `inc` when it was a zero. `c` comes out at `05`, which is the
number of ones in `10110110`, and `a` is empty by the time the loop ends, since eight shifts push
every bit out of it.

Try changing `N equ 182` to `N equ 183`, one more. `d` becomes `01` because the number is now odd,
`hl` becomes `05B8`, which is 1464, `c` becomes 6 and `e` becomes 7.
