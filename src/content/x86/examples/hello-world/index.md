Every program in this ladder so far has left its answer in a register or in memory, where only you can
see it. This one puts its answer in the console, which means it has to go outside the program
altogether, and going outside the program takes exactly one instruction.

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

`syscall` takes no operands at all, which is why each of the three blocks here is a run of `mov` lines
and then one bare instruction. Every part of the request is in a register before it runs: what is being
asked for, where to send it, what to send, and how much.

`write` sends **exactly** the bytes you point it at and nothing else. It does not look for a
terminator, it does not stop at one if it finds one, and it adds nothing to the end. So the line break
after `Hello, world!` is the `, 10` you can see in the `db` line, and the length is whatever
`$ - greeting` came out as. Take the `, 10` out of the first string and the console reads
`Hello, world!The answer is 42` on one line.

Nothing here prints a number, either. `The answer is 42` is a string that has the characters `4` and
`2` in it already, and a register holding the value 42 has nothing in common with those two bytes.
Turning one into the other is a program of its own, and it is the next Example.

`mov rax, 60` and `syscall` is the request to exit, and it is the only thing that stops the program.
Take the last three lines out and execution carries straight on into whatever bytes follow them.
