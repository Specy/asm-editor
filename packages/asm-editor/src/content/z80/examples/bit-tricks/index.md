One byte can answer four questions. Is 183 odd, what is it times eight, what are its bottom four
bits, and how many of its eight bits are ones? The answers land in `d`, `hl`, `e`, and `c`.

Open in the editor, choose **Build**, then use **Run** for the final values or **Step** to follow
the flags and registers as they change. The registers panel displays hexadecimal.

```z80|playground|allow-open
N   equ 183

    .org 0x8000
    ld a, N         ; n = 183, which is 0b10110111

    ld d, 0
    bit 0, a        ; is the lowest bit set?
    jr z, even      ; Z is 1 when the bit is 0
    ld d, 1         ; d = 1 when n is odd
even:

    ld l, a
    ld h, 0         ; widen unsigned a into hl
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
    and 0x0F        ; the low four bits on their own
    ld e, a
    halt
```

`bit 0, a` asks whether the lowest bit is set without changing `a`. It sets `Z` backwards from
the question: `Z` is 1 when that bit is 0. Thus `jr z, even` takes the even route, while the
default value has its lowest bit set and leaves `d = 01`.

The two instructions `ld l, a` and `ld h, 0` widen unsigned `a` into `hl`. This is needed because
183 times 8 is 1464, too large for a byte. Each `add hl, hl` doubles the whole 16-bit pair, so
three of them leave `hl = 05B8`. The Z80's single-register shift instructions such as `srl` do
not take `hl`; `add hl, hl` is the short way to double this pair.

`and 0x0F` keeps only the bits where the mask has ones. For example, `0xB6 & 0x0F = 0x06`.
With this program's `0xB7`, the same mask leaves `07`, so `e = 07`. A mask can isolate any packed
field; a field above the low bits also needs shifting down afterward.

The loop counts one bit on each pass. On its first pass, `a` is `B7`; `srl a` changes it to `5B`
and puts the bit that fell off, `1`, in the C flag. `jr nc` therefore does not jump and `inc c`
makes the count `01`. On a pass where the outgoing bit is 0, C is clear, `jr nc` jumps, and the
count stays as it is. After eight shifts every bit has fallen out of `a`, and `c = 06` because
`10110111` has six ones.

Change `N equ 183` to `N equ 180`. Before you build and run, predict `d`, `hl`, `e`, and `c` in
hexadecimal.

<details>
<summary>Check your answer</summary>

`d = 00` because 180 is even. `hl = 05A0` because `0xB4 × 8 = 0x05A0`; `e = 04` from the low
four bits; and `c = 04` because `B4` has four set bits.

</details>
