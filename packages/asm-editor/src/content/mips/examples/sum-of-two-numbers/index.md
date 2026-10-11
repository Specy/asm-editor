This program asks for two decimal integers and prints their sum. Select **Run**. When service 5
waits for input, enter each number and press Enter; execution then continues after that `syscall`.

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
    move $t0, $v0       # keep the first number before reusing $v0

    li $v0, 4
    la $a0, second
    syscall
    li $v0, 5
    syscall
    add $t0, $t0, $v0   # use the second number before reusing $v0

    li $v0, 4
    la $a0, answer
    syscall
    li $v0, 1           # service 1: print a signed number
    move $a0, $t0
    syscall

    li $v0, 10
    syscall
```

```testcase
{
    "input": ["17", "25"],
    "expectedOutput": "First number: \nSecond number: \nThe sum is 42"
}
```

The first read leaves its result in `$v0`. The program copies it to `$t0` before loading another
service number into `$v0`. After the second read, `add` uses that new result directly from `$v0`.
It leaves the sum in `$t0`, ready to copy to `$a0` for service 1. If you skip the first `move`,
the next `li $v0, 4` replaces the first number with a service number.

Each prompt is printed with service 4 before service 5 waits for its number. Service 5 reads a
decimal integer; it does not print a prompt. The `\n` at the start of `second` and `answer` puts
those strings on new lines. With 17 and 25, the console displays:

```text
First number:
Second number:
The sum is 42
```

Change `add $t0, $t0, $v0` to `sub $t0, $t0, $v0` and, with 17 and 25, the console displays
`The sum is -8`. Now change the `li $v0, 1` further down to `li $v0, 36` and run it again with the
same two numbers: the answer becomes `4294967288`. The subtraction leaves the same 32 bits,
`0xFFFFFFF8`, in `$t0` either way. Service 1 interprets those bits as signed `-8`; service 36
interprets them as unsigned `4294967288`.

## Try it yourself

Write the two reads and the subtraction below. Save the first result before selecting service 5
again. Then put the difference in `$a0` and use service 1 to print it. Select **Test** to check the
negative result. After it passes, try 25 then 17 with **Run**; the difference should be 8.

```mips|playground|console|exercise|allow-open
.data
label: .asciiz "Difference: "

.text
.globl main
main:
    # Read two integers and leave first minus second in $t0.

    li $v0, 4
    la $a0, label
    syscall
    # Print $t0 as a signed integer.

    li $v0, 10
    syscall
```

```testcase
{ "input": ["17", "25"], "expectedOutput": "Difference: -8" }
```

<details>
<summary>Show solution</summary>

```mips|playground|console|solution
.data
label: .asciiz "Difference: "

.text
.globl main
main:
    li $v0, 5
    syscall
    move $t0, $v0

    li $v0, 5
    syscall
    sub $t0, $t0, $v0

    li $v0, 4
    la $a0, label
    syscall
    li $v0, 1
    move $a0, $t0
    syscall

    li $v0, 10
    syscall
```

```testcase
{ "input": ["17", "25"], "expectedOutput": "Difference: -8" }
```

</details>
