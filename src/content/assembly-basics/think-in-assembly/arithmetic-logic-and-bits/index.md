The loops and the branches we wrote counted with `add` and compared with `cmp`, which is most of what
a program does between two jumps. Let's look at the rest of the instructions that compute.

## Arithmetic

`add` and `sub` are what they look like. Multiplication and division are the ones with a catch,
because multiplying two 32 bit numbers can need 64 bits for the answer and dividing gives back two
answers, a quotient and a remainder.

The M68K's answer is to work on halves: `mulu` multiplies the low 16 bits of a data register by a 16
bit operand and writes the 32 bit product over the whole register, and `divu` divides the whole 32
bit register by a 16 bit operand and packs both answers into it, the quotient in the low word and the
remainder in the high word. The `u` is for unsigned, `muls` and `divs` are the signed pair.

```m68k|playground|no-flags
    move.l #7, d0       ; x = 7
    add.l #5, d0        ; x = x + 5
    sub.l #2, d0        ; x = x - 2
    move.w #6, d1       ; y = 6
    mulu #7, d1         ; y = y * 7
    move.l #45, d2      ; z = 45
    divu #7, d2         ; z = 45 / 7 and 45 % 7, both at once
```

`d0` ends at 10 and `d1` at `0000002A`, which is 42. `d2` ends at `00030006`: read it as two words
and the low one is `0006`, the quotient, and the high one is `0003`, the remainder, because 45 is
7 times 6 with 3 left over. Press **W** in the registers panel and the two words are drawn apart.

RISC-V has 32 bit registers and a separate instruction per answer, so it reads much closer to the C:

```riscv|playground
    li t0, 7            # x = 7
    addi t0, t0, 5      # x = x + 5
    li t1, 6            # y = 6
    li t2, 7            # k = 7
    mul t3, t1, t2      # a = y * k
    li t4, 45           # z = 45
    div t5, t4, t2      # b = z / k
    rem t6, t4, t2      # c = z % k
```

`t3` is 42, `t5` is 6 and `t6` is 3. Every one of these takes three operands, destination first,
which is the shape of nearly every RISC-V and MIPS instruction: the two it reads and the one it
writes are all named, and none of them is overwritten unless you say so.

## Logic, one bit at a time

`and`, `or`, `xor` and `not` are the C operators `&`, `|`, `^` and `~`, and they work on each of the
32 bit positions on its own, with no carrying between them.

| a   | b   | a AND b | a OR b | a XOR b |
| --- | --- | ------- | ------ | ------- |
| 0   | 0   | 0       | 0      | 0       |
| 0   | 1   | 0       | 1      | 1       |
| 1   | 0   | 0       | 1      | 1       |
| 1   | 1   | 1       | 1      | 0       |

The M68K spells xor `eor`, for exclusive or, and the versions that take a plain number as their first
operand end in `i`, for immediate: `andi`, `ori`, `eori`. RISC-V and MIPS call them `and`, `or`,
`xor` and the immediate forms `andi`, `ori`, `xori`, and get `not` by exclusive-oring with -1.

```m68k|playground|no-flags
    move.l #%1100, d0   ; a = 0b1100
    andi.l #%1010, d0   ; a = a & 0b1010
    move.l #%1100, d1   ; b = 0b1100
    ori.l #%1010, d1    ; b = b | 0b1010
    move.l #%1100, d2   ; c = 0b1100
    eori.l #%1010, d2   ; c = c ^ 0b1010
    move.l #%1100, d3   ; d = 0b1100
    not.l d3            ; d = ~d
```

`d0` is `1000`, which is 8, `d1` is `1110`, which is 14, and `d2` is `0110`, which is 6. `d3` comes
out at `FFFFFFF3`, because `not` flipped all 32 bits and not only the four you wrote.

## Masks, shifts and one bit

A **mask** is a number whose bits are what you want from it, and the three operators above are the
three things you do with one:

- `and` with a mask **keeps** the bits the mask has set and clears the rest. `x & 0xFF` in C.
- `or` with a mask **sets** those bits and leaves the rest alone. `x | 4`.
- `xor` with a mask **flips** them. `x ^ 2`.

A **shift** slides every bit sideways, which is `x << 2` and `x >> 2` in C. Shifting left by `n`
multiplies by 2 to the `n` and shifting right by `n` divides by it, which is why they turn up
wherever an index has to be scaled to a byte offset. The M68K writes them `lsl` and `lsr`, and has
`asr` for the signed shift right, which drags the sign bit along instead of feeding in zeroes, so
`asr.l #2` on -20 gives -5 where `lsr.l #2` would give a huge positive number. MIPS and RISC-V call
the same three `sll`, `srl` and `sra`.

Together they read a piece out of the middle of a value: slide it down to the bottom, then mask off
what is above it.

```m68k|playground
    move.l #$12345678, d0   ; x = 0x12345678
    andi.l #$FF, d0         ; x = x & 0xFF, the lowest byte on its own
    move.l #$12345678, d1   ; y = 0x12345678
    lsr.l #8, d1            ; y = y >> 8
    andi.l #$FF, d1         ; y = y & 0xFF, the second byte on its own
    move.l #%1010, d2       ; z = 0b1010
    ori.l #%0100, d2        ; z = z | 0b0100, set bit 2
    eori.l #%0010, d2       ; z = z ^ 0b0010, flip bit 1
    btst #0, d2             ; is bit 0 of z set?
```

`d0` comes out at `00000078` and `d1` at `00000056`, the two lowest bytes of `12345678` pulled out
one at a time. `d2` goes `1010`, then `1110`, then `1100`, which is 12.

The last line is how a program asks about one bit. In C you write `if (z & 1)`, and on the M68K
`btst #0, d2` does the `and` and throws the answer away, keeping only the zero flag, exactly like
`cmp` does with a subtraction. It sets `Z` to 1 when the bit is **0**, so `beq` after it means "the
bit was clear" and `bne` means "the bit was set". Here bit 0 of `1100` is 0, so `Z` is 1.

Try changing `btst #0, d2` to `btst #2, d2` and watch `Z` go to 0, because bit 2 of `1100` is set.
