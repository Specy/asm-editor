This program prints the number 48879 in hexadecimal, decimal, and binary. Open it in the editor,
choose **Build**, then **Run**. The console shows:

```text
BEEF
48879
1011111011101111
```

In Read two numbers and print their sum, a number output port converted a value into decimal
characters. Here the program does the conversion itself. It sends only characters to port `0x10`:
each `out (P_CHAR), a` prints the character whose code is in `a`.

```z80|playground|console|no-flags|allow-open
P_CHAR  equ 0x10

    .org 0x8000
    ld hl, 48879        ; n = 48879
    ld c, 16            ; in hexadecimal
    call print_in_base
    ld hl, 48879
    ld c, 10            ; in decimal
    call print_in_base
    ld hl, 48879
    ld c, 2             ; in binary
    call print_in_base
    halt

; print an unsigned 16-bit number in base 2 to 36: number in hl, base in c
print_in_base:
    ld de, buffer_end
    dec de
    xor a
    ld (de), a          ; put the zero terminator at the end
digit:
    xor a               ; the remainder, which becomes the digit
    ld b, 16            ; sixteen bits of n
divide:
    add hl, hl          ; shift the next dividend bit into the C flag
    rla                 ; bring that bit into the remainder
    cp c
    jr c, no_sub
    sub c               ; the divisor goes in once
    inc l               ; set the new quotient bit to 1
no_sub:
    djnz divide
    cp 10
    jr c, is_digit
    add a, 'A' - 10     ; 10 and up become 'A' and up
    jr store
is_digit:
    add a, '0'          ; 0 to 9 become '0' to '9'
store:
    dec de
    ld (de), a          ; in front of the digits we have already
    ld a, h
    or l                ; is anything left of n?
    jr nz, digit
    ex de, hl           ; the first character of the answer
    call print
    ld a, 10
    out (P_CHAR), a
    ret

; print(p): the zero terminated string at hl
print:
    ld a, (hl)
    or a
    ret z
    out (P_CHAR), a
    inc hl
    jr print

    .org 0x9000
buffer:     .ds 18      ; sixteen binary digits, the terminator and a spare byte
buffer_end:
```

Dividing by the base leaves one digit as the remainder, and it is the **rightmost** digit. For
example, 48879 divided by 16 is 3054 with 15 left over; 15 becomes the `F` at the right end of
`BEEF`. The next division works on 3054 and finds the digit to its left. Rather than reversing the
digits afterwards, the program fills the buffer backwards. It starts with a zero terminator near
`buffer_end`, then `dec de` places each new character in front of those already stored.

The `divide` loop uses the shift and subtract method from Multiply and divide, with the remainder.
Each division takes sixteen passes because `hl` holds a 16-bit number. Think of `hl` as unread
dividend bits followed by quotient bits being built. `add hl, hl` shifts the next dividend bit out
of the top of `hl` into the C flag and leaves a zero at the bottom. `rla` shifts that bit into the
remainder in `a`. If the remainder reaches the base in `c`, `sub c` removes one base and `inc l`
changes the new bottom bit of `hl` from zero to one. Otherwise it stays zero. After sixteen passes,
`hl` holds the quotient and `a` holds the remainder. This division works here because bases 2
through 36 keep the intermediate remainder within one byte.

The remainder becomes a character. Adding `'0'` converts values 0 through 9 to `'0'` through
`'9'`. For 10 through 35, adding `'A' - 10` converts them to `'A'` through `'Z'`; the assembler
calculates that constant. The routine expects a base from 2 to 36 in `c` and does not check it.

After storing a character, `ld a, h` and `or l` check whether the quotient in `hl` is zero: the
result is zero only when both bytes are zero. If it is not, the routine divides that quotient for
the next digit. It runs the division at least once, so an input of zero prints `0`. The code then
passes the completed zero-terminated string to `print` and sends character code 10 for a newline.

The buffer has 18 bytes: the longest answer is sixteen binary digits, followed by its zero
terminator, with one spare byte. In the binary run, the first digit is at `0x9001` and the
terminator is at `0x9011`.

Try changing all three `ld hl, 48879` lines to `ld hl, 31`. Predict the three lines before you
build and run. Hexadecimal uses two digits, but decimal and binary need different lengths; the
same routine handles all three.

<details>
<summary>Check your answer</summary>

The lines are `1F`, `31`, and `11111`. In base 16, 31 divided by 16 leaves 15 (`F`) and a
quotient of 1, so the next digit (`1`) is stored in front of it.

</details>
