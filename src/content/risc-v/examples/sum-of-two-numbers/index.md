The program asks for two numbers, waits while you type them, and prints their sum. Press Run and the
console stops at the first prompt: type a number into the box under it, press Enter, and the run
carries on inside that one `ecall`.

A service that reads stops the whole program in the middle of the `ecall` until somebody types
something. What comes back is already a number in a register: the text you typed has been turned
into one for you.

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

Nothing here asks for a prompt and a number in one go, so each read is two requests: print the
prompt with service 4, then read with service 5.

The `\n` at the front of `second` and `answer` is a newline inside the string, which is how you get a
line break without a service of its own. `.asciz "\nSecond number: "` is one string of seventeen
bytes and the first of them is the line break.

Type 17 and 25 and the console reads `The sum is 42`. Service 5 reads a **decimal** number and
nothing else, and a line that is not one ends the run.

Turn that `add` into a `sub` and the console reads `The sum is -8`, because service 1 prints its
argument as a **signed** number. Now change the `li a7, 1` under it to `li a7, 36`, which prints the
same argument as an unsigned one, and the console reads `4294967288`. The bits in `t0` were
`FFFFFFF8` throughout. Two services read them two different ways, and neither of them is wrong.
