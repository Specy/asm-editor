So far, you have read each example's result in a register or in memory. This program puts text in
the console panel. It sets up two `write` requests, one for each line, and uses `syscall` to send
each request.

```x86|playground|console|no-registers|allow-open
default rel
global _start

section .rodata
greeting:   db "Hello, world!", 10      ; 10 is the newline
GLEN        equ $ - greeting
answer:     db "The answer is 42", 10
ALEN        equ $ - answer

section .text
_start:
    mov rax, 1              ; syscall 1: write
    mov rdi, 1              ; to file descriptor 1, standard output
    lea rsi, [greeting]     ; the bytes to write
    mov rdx, GLEN           ; how many of them
    syscall

    mov rax, 1
    mov rdi, 1
    lea rsi, [answer]
    mov rdx, ALEN
    syscall

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi            ; with status 0
    syscall
```

Run the program. The console shows:

```text
Hello, world!
The answer is 42
```

`syscall` takes no written operands. Before each `write`, `rax` holds call number 1, `rdi` holds
standard output descriptor 1, `rsi` points to the first byte, and `rdx` holds the requested byte
count. The second request uses the same setup with `answer` and `ALEN`.

`write` requests **up to** `rdx` bytes; its result in `rax` says how many were actually written and
can be smaller. For these short messages in the playground, the requested bytes appear in the
console. `write` uses the byte count rather than searching for an ending byte, and it adds no line
break. The `10` after each message is its newline byte. `GLEN equ $ - greeting` counts the bytes
from `greeting` to the current position, including that newline. Remove `, 10` from the first
message and its length loses one byte too: the console then shows
`Hello, world!The answer is 42` on one line.

The second message already contains the characters `4` and `2`. This program sends those stored
characters; it does not convert a numeric value held in a register into text.

The final block requests `exit` with status 0, ending the program after the two lines.

## Your turn

Add a third line, `I can print too!`, after the first two. Put its bytes and newline in `.rodata`,
give it a length with `equ`, and make one more `write` request before `exit`. The console should
show all three lines in this order:

```text
Hello, world!
The answer is 42
I can print too!
```

```x86|playground|console|no-registers|exercise
default rel
global _start

section .rodata
greeting:   db "Hello, world!", 10
GLEN        equ $ - greeting
answer:     db "The answer is 42", 10
ALEN        equ $ - answer
; Add the third message and its length here.

section .text
_start:
    mov rax, 1
    mov rdi, 1
    lea rsi, [greeting]
    mov rdx, GLEN
    syscall

    mov rax, 1
    mov rdi, 1
    lea rsi, [answer]
    mov rdx, ALEN
    syscall

    ; Write the third message here.

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedOutput": "Hello, world!\nThe answer is 42\nI can print too!\n"
}
```

<details>
<summary>Show solution</summary>

```x86|playground|console|no-registers|solution
default rel
global _start

section .rodata
greeting:   db "Hello, world!", 10
GLEN        equ $ - greeting
answer:     db "The answer is 42", 10
ALEN        equ $ - answer
third:      db "I can print too!", 10
TLEN        equ $ - third

section .text
_start:
    mov rax, 1
    mov rdi, 1
    lea rsi, [greeting]
    mov rdx, GLEN
    syscall

    mov rax, 1
    mov rdi, 1
    lea rsi, [answer]
    mov rdx, ALEN
    syscall

    mov rax, 1
    mov rdi, 1
    lea rsi, [third]
    mov rdx, TLEN
    syscall

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
