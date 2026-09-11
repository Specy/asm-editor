The first program of the ladder that anybody outside the editor could see the result of. It prints a
line, then prints a second line with a number at the end of it, and stops. The answer is in the
console panel under the program instead of in a register.

Everything up to here left its result in the registers or in memory, because printing is a request
to the environment. The M68K has `trap #15` for making requests, MIPS has `syscall` and RISC-V has
`ecall`; the Z80 has no such instruction and reaches its console through I/O ports.

**You need to know:** the "Ports: in and out" lecture and the "call, ret and passing values"
lecture. What is new here is the whole shape of a request, `out (n), a` writes the byte in `a` to
port `n`, and the port number is the only thing that says what is meant to happen to it.

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
machine prints is printed a character at a time by a loop you wrote. The M68K hands the whole
address to task 13 and gets the loop for nothing.

`ret z` ends the loop and the subroutine in one instruction: `or a` sets `Z` from the byte that was
read, and the terminator is the only byte that sets it.

Sending 42 to port `0x10` would print `*`, which is the character whose code is 42. Sending it to
port `0x11` prints `42`, two characters, because that port reads the byte as an unsigned number and
does the work of turning it into digits. One byte, two ports, two answers, and choosing the port is
choosing how the bits are read.

The newline is a byte you write yourself, `ld a, 10` and an `out` to the character port, since no
port adds one for you. It can also go inside the string: `.db "Hello", 10, 0` is one string of seven
bytes whose sixth is the line break, and `.asciz` is the same directive with the zero added for you.

Try changing `out (P_NUM), a` to `out (0x13), a`, the hexadecimal port. The console reads
`The answer is 2A`, which is 42 written in base 16, from exactly the same byte.
