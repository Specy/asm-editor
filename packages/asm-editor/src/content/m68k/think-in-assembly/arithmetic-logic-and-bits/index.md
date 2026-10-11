# Arithmetic, logic and bits

`add` and `sub` use the byte, word or long size written on the instruction. On a base 68000,
multiplication takes two word-sized inputs and produces a long result. Division takes a long
dividend and a word divisor, then packs a word-sized quotient and remainder into a data register.
After those operations, this lesson moves from whole numbers to the individual bits inside them.

## Multiply two words into one long

The unsigned multiply form is:

```text
mulu.w source, Dn
```

`mulu.w` multiplies the unsigned low word of `Dn` by the unsigned word from `source`. It replaces
all 32 bits of `Dn` with the product. The old high word of `Dn` does not take part.

`muls.w` has the same form, but reads both words as signed two's-complement values. Its 32-bit
product is signed.

```m68k|playground|no-flags
    move.l #$ABCD03E8, d0   ; low word is unsigned 1000
    move.w #300, d1
    mulu.w d1, d0           ; 1000 * 300

    move.l #$1234FF38, d2   ; low word $FF38 is signed -200
    move.w #30, d3
    muls.w d3, d2           ; -200 * 30
```

`d0` becomes `$000493E0`, or 300000. Its original high word `$ABCD` was ignored and then replaced.
`d2` becomes `$FFFFE890`, the 32-bit representation of -6000. In both cases the two 16-bit inputs
fit in one 32-bit product.

## Division packs two words into one register

Unsigned division has this form:

```text
divu.w source, Dn
```

`divu.w` divides the unsigned 32-bit value in `Dn` by the unsigned 16-bit word from `source`. When
the quotient fits in 16 bits, the instruction packs two results into `Dn`:

- the quotient goes in the low word;
- the remainder goes in the high word.

`divs.w` uses a signed 32-bit dividend and a signed 16-bit divisor. Its signed quotient and signed
remainder each occupy one word. The quotient is truncated toward zero. The remainder has the same
sign as the dividend, or is zero, and its magnitude is smaller than the divisor's magnitude.

Before running this example, predict the two words in `d2` from the equation
`-20 = 6 * quotient + remainder`:

```m68k|playground|no-flags
    move.l #1000, d0
    move.w #7, d1
    divu.w d1, d0           ; 1000 / 7

    move.l #-20, d2
    move.w #6, d3
    divs.w d3, d2           ; -20 / 6
```

`d0` becomes `$0006008E`: `$008E` is quotient 142 and `$0006` is remainder 6. The signed division
gives quotient -3 and remainder -2, so `d2` becomes `$FFFEFFFD`. The high word `$FFFE` is -2 and
the low word `$FFFD` is -3. This also shows why signed division and an arithmetic right shift are
not interchangeable for every negative value.

### Exchange the two words with `swap`

`swap Dn` exchanges the high and low 16-bit words of one data register. It has no size suffix:

```m68k|playground|no-flags
    move.l #$0006008E, d0
    swap d0                    ; d0 becomes $008E0006
```

After the swap, the remainder 6 is in the low word. A second `swap d0` would restore
`$0006008E`. `swap` sets `N` and `Z` from the new 32-bit value, clears `V` and `C`, and preserves
`X`.

### Check both division failure cases

The divisor's low word must be checked before `divu.w` or `divs.w`. A zero divisor causes a
division-by-zero exception, so the playground stops at the division and cannot reach a branch
afterward.

The quotient must also fit in its 16-bit destination. A quotient overflow sets `V`. The new branch
`bvs label` means **branch when `V` is 1**. Put it immediately after the division so that it reads
the flags from that division, and do not use the packed result on the overflow path.

This complete shape checks zero first and quotient overflow second:

```m68k|playground
    move.l #100000, d0
    move.w #3, d1

    tst.w d1
    beq zero_divisor
    divu.w d1, d0
    bvs quotient_overflow     ; V=1 means the quotient did not fit

    move.l #1, d2             ; the packed result in d0 is valid
    bra done
zero_divisor:
    move.l #0, d2             ; division was not attempted
    bra done
quotient_overflow:
    move.l #-1, d2            ; do not use d0 as a packed result
done:
```

Here the divisor is 3 and the quotient is 33333, so neither branch is taken. `d0` ends at
`$00018235`, which packs remainder 1 above quotient `$8235`, and `d2` ends at 1.

## Boolean logic and masks

`and`, `or`, `eor` and `not` calculate each bit position independently. No carry moves from one
position to the next. `eor` is the M68K spelling of exclusive or.

| `a` | `b` | `a AND b` | `a OR b` | `a EOR b` |
| --: | --: | --------: | -------: | --------: |
|   0 |   0 |         0 |        0 |         0 |
|   0 |   1 |         0 |        1 |         1 |
|   1 |   0 |         0 |        1 |         1 |
|   1 |   1 |         1 |        1 |         0 |

For the register-to-register forms used here, write `and.size Dn,Dm`, `or.size Dn,Dm`, or
`eor.size Dn,Dm`. The first data register is the source and the second is the destination; `n` and
`m` stand for register numbers and can be different. A literal source uses the immediate forms
`andi.size #value,Dn`, `ori.size #value,Dn`, and `eori.size #value,Dn`. `not.size Dn` has one
operand and flips every selected bit.

In this assembler, `%` before a number marks a binary literal. In `%1100`, the four digits from
left to right are bits 3, 2, 1, and 0. Bits 3 and 2 are 1, while bits 1 and 0 are 0; the rightmost
digit is always the lowest-numbered bit.

```m68k|playground|no-flags
    move.l #%1100, d0
    andi.l #%1010, d0        ; d0 = %1000

    move.l #%1100, d1
    ori.l #%1010, d1         ; d1 = %1110

    move.l #%1100, d2
    eori.l #%1010, d2        ; d2 = %0110

    move.l #%1100, d3
    not.l d3                 ; d3 = $FFFFFFF3
```

A **mask** is a value chosen for its bit pattern. The operation decides what the mask does:

- `and` keeps positions where the mask has 1 and clears positions where it has 0;
- `or` sets positions where the mask has 1 and leaves the others unchanged;
- `eor` flips positions where the mask has 1 and leaves the others unchanged.

For example, `andi.l #$000000FF,d0` keeps only the low byte. `ori.l #$00000004,d1` sets bit 2.
`eori.l #$00000003,d2` flips bits 1 and 0. Writing masks in hex or binary makes the selected
positions visible.

## Shifts and rotates

Shifts and rotates move the bits within a data register. The six instructions form three pairs:

| pair         | movement                                                                  |
| ------------ | ------------------------------------------------------------------------- |
| `lsl`, `lsr` | logical shift; zero bits enter the space opened at the other end          |
| `asl`, `asr` | arithmetic shift; `asr` copies the sign bit into the opened high bits     |
| `rol`, `ror` | rotate; each bit leaving one end wraps around and enters at the other end |

`asl` moves bits in the same direction as `lsl`, but also uses `V` to report signed overflow.
`asr` preserves a negative sign as it shifts right.

For a data-register destination, write a byte, word or long size and give the count in either of two
ways:

```text
lsl.l #4, d0
lsl.l d1, d0
```

An immediate count can be from 1 through 8. A count held in a data register uses only that
register's low six bits on a base 68000, so the effective count is from 0 through 63. For example,
a register count of 64 acts as 0, and 65 acts as 1.

```m68k|playground
    move.l #1, d0
    lsl.l #4, d0            ; d0 = 16

    move.l #$80000001, d1
    ror.l #1, d1            ; d1 = $C0000000

    move.l #-7, d2
    asr.l #1, d2            ; d2 = -4

    move.l #1, d3
    move.l #65, d4
    lsl.l d4, d3            ; low six count bits give a shift of 1
```

`asr.l #1` on -7 produces -4. An arithmetic right shift of a negative odd value rounds toward
negative infinity. Signed `divs.w` instead truncates its quotient toward zero, so -7 divided by 2
has quotient -3 and remainder -1.

For a nonzero logical or arithmetic shift, `C` receives the last bit shifted out and `X` receives
the same bit. For `rol` and `ror`, `C` still receives the last bit rotated out, but `X` is
unchanged. Two branch names make the carry result usable:

| branch      | taken when |
| ----------- | ---------- |
| `bcs label` | `C = 1`    |
| `bcc label` | `C = 0`    |

Because the branch must read the shift's carry, place it immediately after the shift.

### Extract and assemble fields

Once shifts are defined, a mask and a shift can isolate a field inside a value. Shift the field
down to the low end, then clear everything above it:

```m68k|playground|no-flags
    move.l #$12345678, d0
    lsr.l #8, d0
    andi.l #$000000FF, d0   ; d0 = $00000056

    move.l #$000000AB, d1
    lsl.l #8, d1
    ori.l #$000000CD, d1   ; d1 = $0000ABCD
```

The first pair extracts the second-lowest byte. The second pair opens eight low bits below `$AB`
and sets them from the mask `$CD`.

## Test or change one bit

Four instructions work on one numbered bit in a data register:

- `btst` tests the bit without changing it;
- `bset` changes the bit to 1;
- `bclr` changes the bit to 0;
- `bchg` flips the bit.

Bit 0 is the least-significant bit, at the right of a binary value. In the data-register forms used
here, bit numbers run from 0 through 31. A dynamic bit number can come from a data register, as in
`btst d1,d0`; the processor uses it modulo 32. Thus a value of 32 in `d1` selects bit 0, and 33
selects bit 1.

All four instructions set `Z` from the bit's **old** value:

- `Z = 1` when the bit was 0;
- `Z = 0` when the bit was 1.

That rule applies even when the instruction then changes the bit. After `btst #3,d0`, `beq` means
the tested bit was clear and `bne` means it was set.

```m68k|playground
    move.l #%1010, d0
    bset #0, d0             ; old bit 0 was 0; d0 becomes %1011
    bclr #3, d0             ; old bit 3 was 1; d0 becomes %0011
    bchg #1, d0             ; old bit 1 was 1; d0 becomes %0001
    btst #2, d0             ; old bit 2 is 0, so Z becomes 1
```

`d0` ends at 1. The final `btst` leaves it unchanged and sets `Z` to 1.

## Check your understanding

### 1. Separate a quotient and remainder

`d0` starts at 1000. Divide it by the known nonzero divisor 7. Leave quotient 142 in `d2` and
remainder 6 in `d3`, with zeroes in the upper part of both registers. Preserve `d0`.

The destination registers start with different sentinels, so both packed halves must be replaced.
Use `swap` to move the remainder into the low word and an `and` mask to clear each unwanted half.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": 1000,
        "d2": "0xDEADBEEF",
        "d3": "0xA5A55A5A"
    },
    "expectedRegisters": {
        "d0": 1000,
        "d2": 142,
        "d3": 6
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l d0, d2
    divu.w #7, d2           ; high word = remainder, low word = quotient
    move.l d2, d3
    andi.l #$0000FFFF, d2   ; keep and zero-extend the quotient
    swap d3
    andi.l #$0000FFFF, d3   ; keep and zero-extend the remainder
```

</details>

### 2. Count the set bits with carry

`d0` starts at `$F0F0F0F0`. Shift all 32 bits out to the right and count the 1 bits in `d1`.
Initialize `d1` with `move.l #0,d1`, and use `bcc` immediately after each shift to skip the add
when the bit entering `C` was 0.

Use `d2` as a `dbra` counter. Initialize only its low word for 32 passes, preserving the sentinel in
its high word. The finished values should show 16 set bits, an empty `d0`, and the normal `$FFFF`
ending word from `dbra`.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": "0xF0F0F0F0",
        "d1": "0xDEADBEEF",
        "d2": "0xA5A5BEEF"
    },
    "expectedRegisters": {
        "d0": 0,
        "d1": 16,
        "d2": "0xA5A5FFFF"
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l #0, d1
    move.w #31, d2          ; 32 passes: initial low word = 32 - 1
bit_loop:
    lsr.l #1, d0            ; low bit moves into C
    bcc bit_was_zero        ; C=0 means no increment
    add.l #1, d1
bit_was_zero:
    dbra d2, bit_loop
```

</details>
