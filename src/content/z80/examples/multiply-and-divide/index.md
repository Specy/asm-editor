The Z80 has no instruction that multiplies or divides two numbers. This program uses shifts and
loops to turn 365 days into 8760 hours, then 1000 seconds into 16 minutes with 40 seconds left
over. Open it in the editor, choose **Build**, then **Run** to see both answers in the registers
panel. The panel shows hexadecimal values; numbers such as `365` in the program are decimal.

```z80|playground|no-flags|allow-open
    .org 0x8000
; hours = days * 24, by shift and add
    ld de, 365      ; the number to multiply
    ld a, 24        ; look at its bits from right to left
    ld hl, 0        ; the growing product
    ld b, 8         ; one pass for each bit of a
multiply:
    srl a           ; lowest bit of a goes into the C flag
    jr nc, no_add   ; skip the addition if that bit was 0
    add hl, de      ; add de to the product if it was 1
no_add:
    sla e           ; double the 16-bit value in de
    rl d
    djnz multiply
    ex de, hl       ; keep the product in de

; minutes = seconds / 60; a will hold the seconds left over
    ld hl, 1000     ; the number to divide
    ld c, 60        ; the divisor
    xor a           ; remainder = 0
    ld b, 16        ; one pass for each bit of hl
divide:
    add hl, hl      ; shift the next dividend bit into the C flag
    rla             ; bring that bit into the remainder in a
    cp c            ; is the remainder at least the divisor?
    jr c, no_sub    ; if it is smaller, the next quotient bit is 0
    sub c           ; otherwise subtract the divisor
    inc l           ; set the new quotient bit to 1
no_sub:
    djnz divide
    halt
```

For multiplication, `24` is `00011000` in binary. `srl a` sends its lowest bit into the **C
flag** (the carry flag). `jr nc` means “jump if C is zero.” The first three bits are zero, so
there is no addition on those passes. On the fourth pass, `de` has doubled three times from 365
to 2920, and the multiplier bit is one, so `add hl, de` adds 2920. The fifth pass adds 5840. That gives
8760. `sla e` shifts the low byte of `de` first and places its outgoing bit in the C flag;
`rl d` brings that bit into the high byte. Together they double the 16-bit value. After eight
passes, `ex de, hl` moves the product to `de` so the division can use `hl`.

Division works like written long division: take the next bit from the dividend, attach it to
the remainder, and ask whether the divisor fits. If it does, subtract it and write a 1 in the
quotient; otherwise write a 0. Here `hl` starts with the dividend, `a` holds the remainder, and
register `c` holds the divisor. Register `c` and the **C flag** are different things: `cp c`
compares `a` with register `c`, then sets the C flag if `a` is smaller.

Think of the working value as `a : hl`: `a` holds the remainder on the left, and `hl` holds
the unread dividend bits followed by the quotient bits already written. Each `add hl, hl`
shifts `hl` left. Its top bit leaves `hl` through the C flag, and the new
bottom bit of `hl` is zero. `rla` takes that outgoing bit from C into the bottom of `a`, while
shifting the old remainder left. If `a` is at least the divisor, `sub c` removes one divisor
and `inc l` changes the new bottom bit of `hl` from 0 to 1. If it is smaller, the bottom bit
stays 0. The old dividend bits leave at the top while quotient bits accumulate at the bottom.

To see this with small numbers, change the division inputs to `ld hl, 13` and `ld c, 3`, then
use **Step**. The loop still runs 16 times. The first 12 passes move leading zero bits out of
the way, leaving `hl = D000` and `a = 00`. The final four passes are:

| Pass | Bit taken from `hl` | `hl` after shift | `a` after `rla` | Compare with 3 | `hl` after quotient bit | `a` after pass |
| ---- | ------------------- | ---------------- | --------------- | -------------- | ----------------------- | -------------- |
| 13   | 1                   | `A000`           | `01`            | smaller: write 0 | `A000`                 | `01`           |
| 14   | 1                   | `4000`           | `03`            | equal: subtract, write 1 | `4001`        | `00`           |
| 15   | 0                   | `8002`           | `00`            | smaller: write 0 | `8002`                 | `00`           |
| 16   | 1                   | `0004`           | `01`            | smaller: write 0 | `0004`                 | `01`           |

So `13 ÷ 3` leaves quotient 4 in `hl` and remainder 1 in `a`. Restore `1000` and `60`:
after 16 passes, `hl = 0010` (16 minutes) and `a = 28` (40 seconds). The multiplication
product remains in `de = 2238` (8760 hours). These register values are hexadecimal.

The remainder stays below 60 after each division pass: whenever it reaches 60, the program
subtracts 60. Before the next comparison, shifting in one bit can make it at most 119, which
fits in `a`'s eight bits. This is why the byte-sized remainder works for this example.

Try changing only `ld b, 8` in the multiplication to `ld b, 4`. Predict `de` after **Run**.
The loop then looks at only the lowest four bits of 24, which are `1000`: it multiplies 365
by 8 and leaves `de = 0B68` (2920). The bits above the fourth were never read.
