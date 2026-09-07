The first program of the ladder that anybody outside the editor could see the result of. It prints a
line, then prints a second line with a number at the end of it, and ends itself. The answer is in the
console panel under the program instead of in a register.

Everything up to here left its result in the registers or in memory, because printing is a request to
the environment and RISC-V has one instruction for making requests. This is that instruction.

**You need to know:** the "ecall" lecture. What is new here is the whole shape of a request, the
service number in `a7` says what you want, `a0` carries the argument, and `ecall` hands it over.

```riscv|playground|console|no-registers|allow-open
.data
greeting: .asciz "Hello, world!\n"
question: .asciz "The answer is "

.text
.globl main
main:
    li a7, 4            # service 4: print a null terminated string
    la a0, greeting
    ecall

    li a7, 4
    la a0, question
    ecall
    li a7, 1            # service 1: print a signed integer
    li a0, 42
    ecall
    li a7, 11           # service 11: print one character
    li a0, '\n'
    ecall

    li a7, 10           # service 10: end the program
    ecall
```

`ecall` takes no operands at all. Everything about the request is in the registers before it runs,
which is why every one of these blocks is a `li a7`, then whatever the service reads, then the
instruction. The M68K writes the same request as a task number in `d0.b` and a `trap #15`, and MIPS
as a service number in `$v0` and a `syscall`; the shape is the same and only the register names and
the numbers differ.

`a7` is the eighth argument register the rest of the time and `a0` is the first, which is why the
service number and the argument never collide. On MIPS both the number and any answer live in `$v0`,
so a program there has to move an answer out before it asks the next question.

`.asciz "Hello, world!\n"` writes fifteen bytes: thirteen characters, the newline that `\n` stands
for, and the zero the directive adds. Service 4 walks the string from `a0` until it reads that zero,
so `.ascii` without it would print whatever came next in the data section as well. The directive is
`.asciz` with one `i`, where MIPS writes `.asciiz`, and `.string` is another name for it.

Three services print here and each takes one thing. Service 4 prints a string, service 1 prints a
signed 32 bit number, and service 11 prints one character. There is nothing that prints a string and
a number together, which the M68K has as task 17, so the line `The answer is 42` is written by two
requests and the newline after it by a third.

`li a7, 10` and `ecall` is service 10, **exit**, and it is what stops the program. Take those two
lines out and execution carries on into whatever instructions follow them in the text section, which
for a program with its subroutines written under `main` means running the subroutines. Service 93 is
`exit2`, which does the same thing and takes a code in `a0`. That number is Linux's own, where 10 is
RARS's: a RISC-V program on Linux ends with 93 in `a7` and an `ecall`.

Try changing `greeting: .asciz "Hello, world!\n"` to `.asciz "Hello, world!"`. The console reads
`Hello, world!The answer is 42` all on one line, because nothing prints a newline for you: service 4
prints exactly the bytes you gave it.
