`write` sends bytes. A register holding 12345 contains no bytes that a terminal would recognise as
`1`, `2`, `3`, `4` and `5`, so a program that wants to print a number has to manufacture those five
characters itself.

The method is repeated division, and it produces the digits in the wrong order. Divide 12345 by ten
and the remainder is 5, which is the **last** digit. Divide the quotient by ten and the remainder is 4,
the one before it. Keep going and the digits come out backwards, which is why this program fills its
buffer from the far end and works towards the front.

`print_number` takes an **unsigned 64-bit value** in `rdi` and an integer base from **2 through 36**
in `rsi`. Each remainder is an offset into `digits`: remainder 11 selects `digits + 11`, the byte
`'b'`. The caller supplies a base in that range; this version does not check it.

```x86|playground|console|allow-open
default rel
global _start

section .rodata
digits: db "0123456789abcdefghijklmnopqrstuvwxyz"
nl:     db 10

section .bss
buffer: resb 64

section .text
; print_number(unsigned value in rdi, base 2..36 in rsi)
print_number:
    lea rcx, [buffer + 64]  ; one past the end of the buffer
    lea r8, [digits]
    mov rax, rdi
    test rax, rax
    jnz .divide
    dec rcx                 ; the division loop produces no digits for zero
    mov byte [rcx], '0'
    jmp .print
.divide:
    xor rdx, rdx            ; the high half of the dividend
    div rsi                 ; rax = value / base, rdx = value % base
    mov r9b, [r8 + rdx]     ; remainder 11 selects digits[11], 'b'
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

In the playground, the console reads `12345`, then `3039`, then `11000000111001`. One number,
three bases, one subroutine: only `rsi` changes between the calls.

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

`digits` holds the characters for remainders 0 through 35. Remainder 5 picks up `'5'`; remainder 11
picks up `'b'`. For base 36, the largest possible remainder is 35, which picks up `'z'`. The zero
branch writes `'0'` directly because the division loop would otherwise produce no characters.

## Your turn

Fill the missing `.divide` loop. For each pass, clear the high half of the dividend, divide by the
base, use the remainder to select a byte from `digits`, and store it after moving `rcx` back one
byte. Repeat while the quotient is nonzero. The zero path is already complete.

Before pressing **Test**, trace the two divisions for 1295 in base 36: write down the quotient and
remainder from each pass, then predict the two output lines. The second call prints zero in base 10.
Your console should show:

```text
zz
0
```

Use your trace to explain the order of the two digits in the buffer. Check why the second call
bypasses `.divide` and prints one `'0'`.

```x86|playground|console|exercise
default rel
global _start

section .rodata
digits: db "0123456789abcdefghijklmnopqrstuvwxyz"
nl:     db 10

section .bss
buffer: resb 64

section .text
; print_number(unsigned value in rdi, base 2..36 in rsi)
print_number:
    lea rcx, [buffer + 64]
    lea r8, [digits]
    mov rax, rdi
    test rax, rax
    jnz .divide
    dec rcx
    mov byte [rcx], '0'
    jmp .print
.divide:
    ; Replace this jump with the repeated-division loop.
    jmp .print
.print:
    lea rdx, [buffer + 64]
    sub rdx, rcx
    mov rsi, rcx
    mov rax, 1
    mov rdi, 1
    syscall

    mov rax, 1
    mov rdi, 1
    lea rsi, [nl]
    mov rdx, 1
    syscall
    ret

_start:
    mov rdi, 1295
    mov rsi, 36
    call print_number

    mov rdi, 0
    mov rsi, 10
    call print_number

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedOutput": "zz\n0\n"
}
```

<details>
<summary>Show solution</summary>

```x86|playground|console|solution
default rel
global _start

section .rodata
digits: db "0123456789abcdefghijklmnopqrstuvwxyz"
nl:     db 10

section .bss
buffer: resb 64

section .text
; print_number(unsigned value in rdi, base 2..36 in rsi)
print_number:
    lea rcx, [buffer + 64]
    lea r8, [digits]
    mov rax, rdi
    test rax, rax
    jnz .divide
    dec rcx
    mov byte [rcx], '0'
    jmp .print
.divide:
    xor rdx, rdx
    div rsi
    mov r9b, [r8 + rdx]
    dec rcx
    mov [rcx], r9b
    test rax, rax
    jnz .divide
.print:
    lea rdx, [buffer + 64]
    sub rdx, rcx
    mov rsi, rcx
    mov rax, 1
    mov rdi, 1
    syscall

    mov rax, 1
    mov rdi, 1
    lea rsi, [nl]
    mov rdx, 1
    syscall
    ret

_start:
    mov rdi, 1295
    mov rsi, 36
    call print_number

    mov rdi, 0
    mov rsi, 10
    call print_number

    mov rax, 60
    xor rdi, rdi
    syscall
```

The first pass gives quotient 35 and remainder 35. The second gives quotient 0 and remainder 35.
Both remainders select `'z'`; writing backward puts the second `'z'` before the first. For zero,
the branch writes `'0'` directly and skips division.

</details>
