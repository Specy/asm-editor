The first program of the ladder that anybody outside the editor could see the result of. It prints a
line, then prints a second line with a number at the end of it, and ends itself. The answer is in
the console panel under the program instead of in a register.

Everything up to here left its result in the registers or in memory, because printing is a request
to the environment and MIPS has one instruction for making requests. This is that instruction.

```mips|playground|console|no-registers|allow-open
.data
greeting: .asciiz "Hello, world!\n"
question: .asciiz "The answer is "

.text
.globl main
main:
    li $v0, 4           # service 4: print a null terminated string
    la $a0, greeting
    syscall

    li $v0, 4
    la $a0, question
    syscall
    li $v0, 1           # service 1: print a signed integer
    li $a0, 42
    syscall
    li $v0, 11          # service 11: print one character
    li $a0, '\n'
    syscall

    li $v0, 10          # service 10: end the program
    syscall
```

`syscall` takes no operands at all. Everything about the request is in the registers before it
runs, which is why each of these blocks has the same three parts: a `li $v0` that says which service
you want, whatever that service reads, and then the instruction itself.

`.asciiz "Hello, world!\n"` writes fifteen bytes: thirteen characters, the newline that `\n` stands
for, and the zero the `z` in the directive adds. Service 4 walks the string from `$a0` until it
reads that zero, so `.ascii` without it would print whatever came next in the data section as well.

Three services print here and each of them takes exactly one thing. Service 4 prints a string,
service 1 prints a signed 32 bit number, and service 11 prints one character. So the single line
`The answer is 42` takes two requests, one for the words and one for the number, and the line break
after it takes a third. Output here is assembled a piece at a time.

`li $v0, 10` and `syscall` is service 10, exit, and it is what stops the program. Take those two
lines out and execution carries on into whatever instructions follow them in the text section, which
for a program with its subroutines written under `main` means running the subroutines.

Take the `\n` off the end of `greeting` and run it again. The console reads
`Hello, world!The answer is 42`, all on one line, because service 4 prints exactly the bytes you
gave it and not one byte more. Every line break in your output is a byte you put there on
purpose.
