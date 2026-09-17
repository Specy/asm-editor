`write` sends bytes. A register holding 12345 contains no bytes that a terminal would recognise as
`1`, `2`, `3`, `4` and `5`, so a program that wants to print a number has to manufacture those five
characters itself.

The method is repeated division, and it produces the digits in the wrong order. Divide 12345 by ten
and the remainder is 5, which is the **last** digit. Divide the quotient by ten and the remainder is 4,
the one before it. Keep going and the digits come out backwards, which is why this program fills its
buffer from the far end and works towards the front.

```x86|playground|console|allow-open
default rel
global _start

section .rodata
digits: db "0123456789abcdefghijklmnopqrstuvwxyz"
nl:     db 10

section .bss
buffer: resb 64

section .text
; print_number(value in rdi, base in rsi)
print_number:
    lea rcx, [buffer + 64]  ; one past the end of the buffer
    lea r8, [digits]
    mov rax, rdi
    test rax, rax
    jnz .divide
    dec rcx                 ; zero has no digits, so it is written by hand
    mov byte [rcx], '0'
    jmp .print
.divide:
    xor rdx, rdx            ; the high half of the dividend
    div rsi                 ; rax = value / base, rdx = value % base
    mov r9b, [r8 + rdx]     ; the character for that digit
    dec rcx
    mov [rcx], r9b          ; written backwards, from the end of the buffer
    test rax, rax
    jnz .divide             ; until there is nothing left to divide
.print:
    lea rdx, [buffer + 64]
    sub rdx, rcx            ; how many characters were written
    mov rsi, rcx            ; where they start
    mov rax, 1              ; write
    mov rdi, 1
    syscall

    mov rax, 1              ; and a newline after them
    mov rdi, 1
    lea rsi, [nl]
    mov rdx, 1
    syscall
    ret

_start:
    mov rdi, 12345
    mov rsi, 10             ; in decimal
    call print_number

    mov rdi, 12345
    mov rsi, 16             ; in hex
    call print_number

    mov rdi, 12345
    mov rsi, 2              ; and in binary
    call print_number

    mov rax, 60
    xor rdi, rdi
    syscall
```

The console reads `12345`, then `3039`, then `11000000111001`. One number, three bases, one
subroutine, and the only thing that changed between the three calls was `rsi`.

Walk the buffer. `rcx` starts at `buffer + 64`, one byte **past** the end, and every digit produced
moves it down by one and writes there. So the first digit produced, the last digit of the number, ends
up at the highest address; the last one produced ends up at the lowest; and when the loop finishes,
`rcx` is pointing at the first character of the answer with the rest of them in order in front of it.
Nothing has to be reversed afterwards. `buffer + 64` minus `rcx` is then the length, which is precisely
what `write` wants next.

```
 buffer                                        buffer + 64
   |                                                |
   |                             [ 1 2 3 4 5 ]      |
                                 ^
                                rcx when the loop stops
```

`div rsi` produces both halves of what the loop needs from one instruction: the quotient in `rax` to
go round again with, the remainder in `rdx` to turn into a character. The `xor rdx, rdx` at the top of
each pass is not optional, because `rdx` is still holding the remainder that pass produced, and
leaving it there makes the next dividend astronomically large and ends the program on a divide error.

`digits` is what turns a remainder into a character. Remainder 5 picks up the byte at `digits + 5`,
which is `'5'`. Remainder 11 picks up `'b'`. Having all thirty six of them there is the only reason the
base can be an argument instead of a constant. Ask for base 36 with the number 1295 and the answer is
`zz`, which is the largest two digit number that base has.
