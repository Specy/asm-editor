This program prints two lines in the console panel below the editor:

```text
Hello, world!
The answer is 42
```

Open it in the editor, choose **Build**, then **Run** to see the output. Earlier examples left
their results in registers or memory. Here, the CPU sends bytes to console ports. A reminder:
`out (port), a` sends the byte in register `a` to the named port. Port `0x10` displays that byte
as a character; port `0x11` displays it as an unsigned decimal number.

```z80|playground|console|no-registers|no-flags|allow-open
P_CHAR  equ 0x10        ; writing a byte here prints it as a character
P_NUM   equ 0x11        ; and here as an unsigned decimal number

    .org 0x8000
    ld hl, greeting
    call print          ; print the greeting one character at a time
    ld a, 10
    out (P_CHAR), a     ; and a new line

    ld hl, question
    call print
    ld a, 42
    out (P_NUM), a      ; print the number as 42
    ld a, 10
    out (P_CHAR), a
    halt

; print the zero-terminated string pointed to by hl
print:
    ld a, (hl)
    or a
    ret z               ; the terminator, and the string is done
    out (P_CHAR), a
    inc hl
    jr print

    .org 0x9000
greeting: .asciz "Hello, world!"
question: .asciz "The answer is "
```

`print` starts with `hl` pointing to the first byte of a zero-terminated string. `ld a, (hl)` reads
that byte; `or a` sets the Z flag if it is zero. When it is zero, `ret z` returns to the instruction
after `call print`. Otherwise, `out (P_CHAR), a` sends the character to the console, `inc hl` moves
to the next byte, and `jr print` repeats the read, test, output, and advance. Each `out` sends one
byte, so the loop prints the string one character at a time. `.asciz` adds the zero byte that ends
each string.

Sending 42 to port `0x10` would print `*`, the character with code 42. Sending the same byte to
port `0x11` prints `42`: that port converts the number into decimal digits for the console.

After each line, `ld a, 10` and `out (P_CHAR), a` print a newline. You can put that byte in a
string instead: `.db "Hello", 10, 0` stores five letters, the newline, and the terminating zero.
