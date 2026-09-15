The first program of the ladder that anybody outside the editor could see the result of. It prints a
line, then prints a second line with a number at the end of it, and stops. The answer is in the
console panel under the program instead of in a register.

Everything up to here left its result in the registers or in memory. Printing is different: the
answer has to leave the CPU entirely and reach a device, and on this machine the way out is an I/O
port.

```z80|playground|console|no-registers|no-flags|allow-open
P_CHAR  equ 0x10        ; writing a byte here prints it as a character
P_NUM   equ 0x11        ; and here as an unsigned decimal number

    .org 0x8000
    ld hl, greeting
    call print          ; the string, one character per out
    ld a, 10
    out (P_CHAR), a     ; and a new line

    ld hl, question
    call print
    ld a, 42
    out (P_NUM), a      ; the number, printed as 42 and not as '*'
    ld a, 10
    out (P_CHAR), a
    halt

; print(p): the zero terminated string at hl, one character at a time
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

**There is no port that prints a string**, because an `out` carries exactly one byte. So `print` is
the string walk from Length of a string with an `out` where the work goes, and every string this
machine prints is printed a character at a time by a loop you wrote.

`ret z` ends the loop and the subroutine in one instruction: `or a` sets `Z` from the byte that was
read, and the terminator is the only byte that sets it.

Sending 42 to port `0x10` would print `*`, which is the character whose code is 42. Sending it to
port `0x11` prints `42`, two characters, because that port reads the byte as an unsigned number and
does the work of turning it into digits. One byte, two ports, two answers, and choosing the port is
choosing how the bits are read.

The newline is a byte you write yourself, `ld a, 10` and an `out` to the character port, since no
port adds one for you. It can also go inside the string: `.db "Hello", 10, 0` is one string of seven
bytes whose sixth is the line break, and `.asciz` is the same directive with the zero added for you.
