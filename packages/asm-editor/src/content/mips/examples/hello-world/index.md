This program prints `Hello, world!` and `The answer is 42` on separate lines in the Playground
console. It uses `syscall` to ask the Playground to print each part, then to end the program.

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

The console shows:

```text
Hello, world!
The answer is 42
```

For each request, `$v0` selects a service and `syscall` makes the request. The three printing
services read their input from `$a0`: service 4 takes a string address, service 1 takes a signed
integer, and service 11 prints the low byte of `$a0` as a character. Printing `The answer is 42`
therefore takes two requests, one for the words and one for the number. Service 10 needs no input;
its `syscall` ends the program.

The first string's `\n` supplies the line break after `Hello, world!`. The final service 11 call
supplies the line break after `42`. The `z` in `.asciiz` adds a zero byte after each string, so
service 4 knows where to stop. Without that zero, it would keep reading memory until it found one.

## Try it

Remove only the `\n` from `greeting`. Predict whether `The answer is 42` will start on a new line.
Select **Build**, then **Run**, and compare the console with your prediction: it should
show `Hello, world!The answer is 42` on one line. Service 4 prints the bytes in the string; it
does not add a line break for you.
