`write` sends bytes. A register holding the integer 12345 does not contain the text `"12345"`.
To print that number, a program first has to convert it to the character bytes for `1`, `2`, `3`, `4`
and `5`.

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

In the playground, the console shows `12345`, then `3039`, then `11000000111001`. Each call
passes the same number in `rdi` and a different base in `rsi`.

`rcx` starts at `buffer + 64`, one byte **past** the end of the buffer. For each digit, the loop
subtracts one from `rcx` and stores the character at that address. The first digit produced is the
last digit of the number, so it goes at the highest address. Each earlier digit goes before it.
When the loop finishes, `rcx` points to the first character, and the characters are already in the
order needed for printing. The length passed to `write` is `buffer + 64` minus `rcx`.

```
 buffer                                        buffer + 64
   |                                                |
   |                             [ 1 2 3 4 5 ]      |
                                 ^
                                rcx when the loop stops
```

`div rsi` divides the unsigned value in `rdx:rax` by the base. It puts the quotient in `rax`
for the next pass and the remainder in `rdx` to select a character. Before each division,
`xor rdx, rdx` clears the high half of the dividend so that the value being divided is just `rax`.
If a nonzero remainder stays in `rdx`, the next pass divides the wrong number.

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
