The program asks for two numbers, waits while you type them, and prints their sum. Press Run and the
console stops at the first prompt: type a number into the box under it, press Enter, and the run
carries on inside that one `syscall`.

A program that reads stops in the middle of an instruction until somebody answers it, and what
comes back is a number sitting in a register rather than text you have to make sense of.

```mips|playground|console|allow-open
.data
first:  .asciiz "First number: "
second: .asciiz "\nSecond number: "
answer: .asciiz "\nThe sum is "

.text
.globl main
main:
    li $v0, 4
    la $a0, first
    syscall
    li $v0, 5           # service 5: read an integer into $v0
    syscall
    move $t0, $v0       # out of $v0 before anything else goes in

    li $v0, 4
    la $a0, second
    syscall
    li $v0, 5
    syscall
    add $t0, $t0, $v0   # the second one straight out of $v0

    li $v0, 4
    la $a0, answer
    syscall
    li $v0, 1           # service 1: print it as a signed number
    move $a0, $t0
    syscall

    li $v0, 10
    syscall
```

```testcase
{ "input": ["17", "25"] }
```

`$v0` does two jobs on this machine and they collide here. It is where the service number goes, and
it is where a service that answers puts its answer, so the number service 5 read is in `$v0` for
exactly as long as it takes you to write the next `li $v0`. `move $t0, $v0` straight after the read
is the habit that keeps it, and the second read adds `$v0` into `$t0` before anything overwrites it.

Printing the prompt and reading the answer are two separate services, a 4 and then a 5, so the
prompt has to be printed before every read. Service 5 does not know a prompt exists.

The `\n` at the **front** of `second` and `answer` is a newline inside the string, which is how you
get a line break without spending a service on it. `.asciiz "\nSecond number: "` is one string of
seventeen bytes and the first of them is the line break.

Type 17 and 25 and the console reads `The sum is 42`. Service 5 reads a **decimal** number and
nothing else, and a line that is not one ends the run.

Change `add $t0, $t0, $v0` to `sub $t0, $t0, $v0` and, with 17 and 25, the console reads
`The sum is -8`. Now change the `li $v0, 1` further down to `li $v0, 36` and run it again with the
same two numbers: the answer becomes `4294967288`. Nothing about the subtraction changed. `$t0`
holds `FFFFFFF8` either way, and the only difference is which service you asked to read it.
