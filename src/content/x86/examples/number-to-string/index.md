A number in a register, printed as digits, in any base up to 36. `write` sends bytes and nothing else,
so a program that wants to print 12345 has to produce the five characters itself.

The method is repeated division. Dividing by the base gives a quotient and a remainder, the remainder
is the last digit, and doing it again to the quotient gives the one before it. So the digits arrive
**backwards**, and the program writes them backwards into the end of a buffer.

**You need to know:** the "Arithmetic, logic and bits" lecture and the "syscall and the Linux ABI"
lecture. What is new here is a subroutine that prints, and a buffer filled from the far end.

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

The console reads `12345`, then `3039`, then `11000000111001`: one number written three ways.

`rcx` starts at the address **after** the buffer and moves down, so the digits end up in the right
order with no reversing afterwards. When the loop stops, `rcx` points at the first character and
`buffer + 64` minus `rcx` is how many there are, which is exactly what `write` wants.

`div rsi` reads `rdx:rax` and writes the quotient to `rax` and the remainder to `rdx`, so one
instruction produces both halves of what the loop needs. The `xor rdx, rdx` at the top of each pass
is not optional: `rdx` holds the remainder from the pass before, and leaving it there makes the
dividend enormous and stops the program with a divide error.

`digits` turns a remainder into a character. For base 10 the first ten bytes would do, and having all
thirty six is what makes the base an argument rather than a constant.

The zero case is separate because the loop is a `do while` that runs at least once only when the
value is not zero already. Without those three lines, `print_number(0, 10)` prints nothing at all.

Try changing the base to 36 and the number to 1295. The answer is `zz`, the largest two digit number
that base has.
