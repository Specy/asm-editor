The program asks for two numbers, waits while you type them, and prints their sum. Press Run and the
console stops at the first prompt: type a number into the box under it, press Enter, and the run
carries on inside that one `ecall`.

Print a string only talked. This one listens, which means the program stops in the middle of an
instruction until somebody answers it, and what comes back is a number in a register rather than text
you have to make sense of.

**You need to know:** the "Print a string" Example and the "ecall" lecture. What is new here is a
service that answers, service 5 leaves the number that was typed in `a0`, which is also where the
argument of the next printing service goes.

```riscv|playground|console|allow-open
.data
first:  .asciz "First number: "
second: .asciz "\nSecond number: "
answer: .asciz "\nThe sum is "

.text
.globl main
main:
    li a7, 4
    la a0, first
    ecall
    li a7, 5            # service 5: read an integer into a0
    ecall
    mv t0, a0           # a = what was typed

    li a7, 4
    la a0, second
    ecall
    li a7, 5
    ecall
    add t0, t0, a0      # a = a + b

    li a7, 4
    la a0, answer
    ecall
    li a7, 1            # service 1: print it as a signed number
    mv a0, t0
    ecall

    li a7, 10
    ecall
```

```testcase
{ "input": ["17", "25"] }
```

`a0` is the first argument of every service and the answer of the ones that answer, so the number
service 5 read stays there until the next `la a0` or `li a0` overwrites it. `mv t0, a0` straight
after the read is what keeps it, and the second read is added into `t0` before the printing that
follows can touch `a0`.

The service number is in `a7` and nothing on this page ever puts it in danger. MIPS keeps both the
number and the answer in `$v0`, so the `li $v0, 4` that prints the next prompt destroys the number
that was just read; that is the one place these two courses have to write different code for the same
program.

The M68K asks for the prompt and the number in one request, task 18. Here they are two services, a 4
and a 5, so the prompt has to be printed before the read every time.

The `\n` at the front of `second` and `answer` is a newline inside the string, which is how you get a
line break without a service of its own. `.asciz "\nSecond number: "` is one string of seventeen
bytes and the first of them is the line break.

Type 17 and 25 and the console reads `The sum is 42`. Service 5 reads a **decimal** number and
nothing else, and a line that is not one ends the run.

Try changing `add t0, t0, a0` to `sub t0, t0, a0`. With 17 and 25 the console reads `The sum is -8`,
because service 1 prints its argument as a **signed** 32 bit number: the bits `FFFFFFF8` are -8 to
it. Change the `li a7, 1` below it to `li a7, 36` and the same bits print as `4294967288`.
