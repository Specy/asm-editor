This program asks for two numbers and prints their sum. Open it in the editor, choose **Build** and
then **Run**. At each prompt, type a number in the console and press Enter. The run waits at
`in a, (P_NUM)` until you do.

Port `0x11` handles decimal numbers in both directions: reading it parses the line you typed and
puts the resulting byte in `a`; writing a byte to it prints that byte as an unsigned decimal
number. This program reads through `0x11`, then uses the 16-bit output port for a sum that might
exceed 255.

```z80|playground|console|no-flags|allow-open
P_CHAR  equ 0x10
P_NUM   equ 0x11        ; read decimal input; write an unsigned decimal byte
P_WORD  equ 0x14        ; write an unsigned 16-bit number, high byte in b

    .org 0x8000
    ld hl, first
    call print
    in a, (P_NUM)       ; decimal input parsed into one byte
    ld e, a
    ld d, 0             ; de = first number as a 16-bit value

    ld hl, second
    call print
    in a, (P_NUM)       ; and a second one
    ld l, a
    ld h, 0             ; hl = second number as a 16-bit value
    add hl, de          ; sum in hl

    push hl
    ld hl, answer
    call print
    pop hl
    ld b, h             ; high byte of the sum
    ld c, P_WORD
    out (c), l          ; print b:l through port c
    ld a, 10
    out (P_CHAR), a
    halt

; print(p): the zero terminated string at hl, one character at a time
print:
    ld a, (hl)
    or a
    ret z
    out (P_CHAR), a
    inc hl
    jr print

    .org 0x9000
first:  .asciz "First number: "
second: .db 10, "Second number: ", 0
answer: .db 10, "The sum is ", 0
```

```testcase
{ "input": ["17", "25"] }
```

Type 17 and 25 and the console shows `The sum is 42`. The port converts each typed decimal line
into a byte for `a`; the program does not have to read the digits one character at a time. Invalid
decimal input ends the run with an error. If you enter a value above 255, only its low byte reaches
`a`.

Two bytes can add up to 510, which does not fit in one byte. The program puts zero in `d` and `h`
to turn each input into a 16-bit value, then `add hl, de` leaves the sum in `hl`. To print it,
`ld b, h` puts the high byte in `b`, `ld c, P_WORD` selects port `0x14`, and `out (c), l` sends
the low byte in `l`. The port combines `b` and `l` into one unsigned decimal number. In this form
of `out`, `b` supplies the high byte of the I/O address bus while `c` supplies the port number;
port `0x14` uses that high address byte as part of the number it prints.

The third `call print` needs `hl` to point at the answer text, but `hl` currently holds the sum.
`push hl` saves the sum on the stack before the call, and `pop hl` restores it afterward. The
`print` routine can then move `hl` through the text without losing the answer.

The `10` at the front of `second` and `answer` is the character code for a newline. For example,
`.db 10, "Second number: ", 0` stores a line break, the prompt, and the zero that ends the string.

Try changing `ld c, P_WORD` to `ld c, P_NUM` and running again with 17 and 25. That sends only
`l` to the byte output port, so the displayed answer is still 42. Now enter 200 and 100. Before
you press Enter for the second number, predict what the console will print. Check your prediction
against the low byte of the sum in `hl`, then restore `P_WORD` and run the same inputs again.
