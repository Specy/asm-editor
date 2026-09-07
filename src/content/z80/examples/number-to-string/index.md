48879 printed three times, as `BEEF`, as `48879` and as `1011111011101111`, by a subroutine that
turns a number into characters itself. Port `0x01` does the same job for a byte in one instruction;
this is what it does inside, and it is the program every language writes once and then hides in a
library.

Read two numbers and print their sum handed a number to a port and got text back. Here the only port
used is the character one, and everything between the number and the characters is yours, including
the division, which this machine has no instruction for.

**You need to know:** the "Multiply and divide, with the remainder" Example and the "Ports: in and
out" lecture. What is new here is that the digits come out backwards, the lowest one first, so the
buffer is filled from its end towards its front.

```z80|playground|console|no-flags|allow-open
P_CHAR  equ 0x00

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

; print_in_base(n, base): n in hl, base in c
print_in_base:
    ld de, buffer_end
    dec de
    xor a
    ld (de), a          ; the terminator goes down first
digit:
    xor a               ; the remainder, which becomes the digit
    ld b, 16            ; sixteen bits of n
divide:
    add hl, hl          ; the top bit of what is left of n
    rla                 ; comes in at the bottom of the remainder
    cp c
    jr c, no_sub
    sub c               ; the divisor goes in once
    inc l               ; and a 1 goes into the quotient
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

Dividing by the base and keeping the remainder gives you one digit, and it is the **lowest** one:
48879 divided by 16 is 3054 with 15 left over, and 15 is the `F` at the right hand end of `BEEF`. So
the digits arrive in the opposite order to the one they are printed in, and the two ways round that
are to reverse the buffer afterwards or to write it backwards in the first place. `dec de` before
every `ld (de), a` does the second one: each digit lands in front of the ones already there, and
`de` is left pointing at the first character.

The block from `digit` down to `djnz divide` is the shift and subtract division from Multiply and
divide, whole, and it runs sixteen passes to produce one digit. The M68K writes one `divu` there, so
where its version costs one instruction per character, this one costs a loop, and the three numbers
together come to 2704 instructions.

`inc l` puts the quotient bit into `hl` as the dividend leaves it, so at the end of the sixteen
passes `hl` is `n / base` and `a` is `n % base`, which is the digit. Then `ld a, h` and `or l` ask
whether anything is left of `n`, since `h | l` is zero exactly when both halves are. Asking it that
way is the only way: **the instructions that work on a pair set no flags at all**, so a `dec hl`
leaves nothing to jump on and a pair is tested by putting its two bytes together in `a`.

A digit is a number from 0 to `base - 1` and it has to become a character. `'0'` is `0x30`, so
adding it turns 0 to 9 into `'0'` to `'9'`; `'A'` is `0x41` and a 10 has to become that, so the
amount added is `'A' - 10`, worked out by the assembler while it assembles. `cp 10` and `jr c` pick
between the two, which is what makes any base up to 36 work.

The buffer has 18 bytes because the longest answer is a 16 bit number in base 2. After the binary
run the string starts at `9001`, seventeen bytes below `buffer_end`: sixteen digits and the zero
that ends them.

Try changing `ld c, 2` to `ld c, 36`, the largest base the digits reach. The third line of the
console becomes `11PR`.
