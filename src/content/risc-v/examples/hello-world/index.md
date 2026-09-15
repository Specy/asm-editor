Every program up to here left its answer in a register or in memory, where only you could see it.
Printing is not something the processor can do on its own: it has to ask whatever is running it. One
instruction, `ecall`, makes that request, and the answer to this program shows up in the console
panel.

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

`ecall` takes no operands. Everything about the request is already in the registers when it runs,
which is why each of these blocks is the same three steps: a number into `a7` saying which service
you want, whatever that service reads into `a0`, then the instruction itself.

`a7` is the eighth argument register at every other moment and `a0` is the first, so the service
number and the argument it carries never get in each other's way.

`.asciz "Hello, world!\n"` writes fifteen bytes: thirteen characters, the newline that `\n` stands
for, and the zero the directive adds. Service 4 starts at `a0` and prints bytes until it meets that
zero, so a string written with `.ascii`, which adds nothing, would carry on printing whatever came
after it in the data section.

Each of the three printing services takes exactly one thing: service 4 a string, service 1 a signed
32 bit number, service 11 a single character. Nothing prints a string and a number together, so the
line `The answer is 42` costs two requests and the newline after it a third.

`li a7, 10` and `ecall` is service 10, **exit**, and it is what stops the program. Take those two
lines out and execution carries on into whatever instructions follow them in the text section, which
for a program with its subroutines written under `main` means running the subroutines. Service 93 is `exit2`, which ends the program and
takes a code in `a0` saying how it went; that is the number a RISC-V program running under Linux
uses to finish.

Take the `\n` off the end of `greeting` and the console reads `Hello, world!The answer is 42` all on
one line. Nothing adds a line break for you. Service 4 prints exactly the bytes it was handed and
not one more.
