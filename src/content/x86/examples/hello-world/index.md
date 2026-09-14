The first program of the ladder that anybody outside the editor could see the result of. It prints two
lines and stops, and the answer is in the console panel under the program instead of in a register.

Everything up to here left its result in the registers or in memory, because printing is a request to
the operating system and x86 has one instruction for making requests. This is that instruction.

**You need to know:** the "syscall and the Linux ABI" lecture. What is new here is the whole shape of
a request: the call number in `rax`, the arguments in `rdi`, `rsi` and `rdx`, and `syscall` handing it
over.

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

`syscall` takes no operands at all. Everything about the request is in the registers before it runs,
which is why each block here is four `mov` lines and then the instruction. The M68K writes the same
request as a task number in `d0.b` and a `trap #15`; MIPS puts a service number in `$v0` and runs
`syscall`. The shape is the same and only the register names and the numbers differ.

`write` prints **exactly** the bytes you point it at. There is no terminator and nothing is added for
you, so the newline is the `, 10` at the end of each string and the length is counted by the assembler
with `$ - greeting`. That is the difference from MIPS and RISC-V, where `.asciiz` adds a zero and the
print service walks the string until it finds it.

There is nothing that prints a number, either. `The answer is 42` is a string with the digits already
in it, and turning a number in a register into digits is a program of its own, which is the next
Example.

`mov rax, 60` and `syscall` is `exit`, and it is what stops the program. Take those three lines out
and execution carries on into whatever bytes follow them in memory.

Try changing `greeting: db "Hello, world!", 10` to `db "Hello, world!"`. The console reads
`Hello, world!The answer is 42` on one line, because nothing prints a newline for you.
