Until now, a program's result has stayed in a register or in memory. To show text in the console,
read what someone types or end a run, a program asks the Playground to perform a **service**. The
instruction that makes the request is `syscall`.

## Choose a service, then call it

In this Playground, we write `syscall` with no operands. Each request follows the same pattern:

1. put the service number in `$v0`;
2. put the service's inputs in the registers listed for that service;
3. execute `syscall`.

These five services are enough for the examples and exercises on this page:

| service | action                         | input             | result |
| ------: | ------------------------------ | ----------------- | ------ |
|       1 | print a signed integer         | value in `$a0`    | —      |
|       4 | print a zero-terminated string | address in `$a0`  | —      |
|       5 | read an integer                | —                 | `$v0`  |
|      10 | end the program                | —                 | —      |
|      11 | print one character            | low byte of `$a0` | —      |

The registers are part of the Playground's contract for each service. Other services use different
registers. Floating-point services, for example, use `$f12` for an input and `$f0` for a result.

In the MIPS architecture, `syscall` deliberately raises a **synchronous exception**: an event caused
by the instruction being executed. The Playground handles that event by performing the selected
service and then lets the program continue. The later **Exceptions and Coprocessor 0** lecture
explains the exception mechanism; the service convention is all you need here.

## Printing and exiting

```mips|playground|console|no-registers
.data
message: .asciiz "Hello, world!\n"

.text
.globl main
main:
    li $v0, 4               # service 4: print a zero-terminated string
    la $a0, message
    syscall

    li $v0, 1               # service 1: print a signed integer
    li $a0, 42
    syscall

    li $v0, 11              # service 11: print one character
    li $a0, '\n'
    syscall

    li $v0, 10              # service 10: end the program
    syscall
```

The console shows:

```text
Hello, world!
42
```

Service 4 starts at the address in `$a0` and prints bytes until it reaches a zero byte. That is why
the example uses `.asciiz`: the final `z` means the assembler adds the zero terminator. Service 1
interprets the 32 bits in `$a0` as a signed integer, so the same service also prints negative
numbers correctly.

Printing does not add a line break. The `\n` in the string prints the first newline, and service 11
prints the second one from the character literal `'\n'`. Every example on this page finishes by
selecting service 10 and executing `syscall`.

## Reading an integer

Service 5 waits for a decimal integer and returns it in `$v0`:

```mips|playground|console|no-registers
.data
prompt: .asciiz "Give me a number: "
answer: .asciiz "\nTwice that is "

.text
.globl main
main:
    li $v0, 4
    la $a0, prompt
    syscall

    li $v0, 5               # $v0 contains 5 before the call
    syscall                 # the result replaces that 5 in $v0
    move $t0, $v0           # preserve the result before choosing another service

    li $v0, 4
    la $a0, answer
    syscall

    add $a0, $t0, $t0
    li $v0, 1
    syscall

    li $v0, 10
    syscall
```

```testcase
{
    "input": ["21"],
    "expectedOutput": "Give me a number: \nTwice that is 42"
}
```

Press Run, type a number in the input box and press Enter. The program pauses at service 5 until the
input arrives, then continues from the instruction after `syscall`.

Notice what happened to `$v0`: it held the service number 5 before `syscall`, and the read service
replaced it with the integer that was entered. Any service result replaces the previous value in its
result register. Playground services preserve all other general-purpose and floating-point
registers; a service with a documented memory result can still change that memory. Move a register
result somewhere safe before loading another service number into `$v0`.

## More Playground services

You do not need to memorize this reference. Use it to find the registers for a service before you
write the request.

### Console output

| service | action                 | input             | formatting                                |
| ------: | ---------------------- | ----------------- | ----------------------------------------- |
|       1 | signed decimal integer | `$a0`             | no padding                                |
|       2 | float                  | `$f12`            |                                           |
|       3 | double                 | `$f12` / `$f13`   | the pair holds one 64-bit value           |
|       4 | string                 | address in `$a0`  | stops at the zero byte                    |
|      11 | character              | low byte of `$a0` |                                           |
|      34 | hexadecimal integer    | `$a0`             | `0x` followed by eight hexadecimal digits |
|      35 | binary integer         | `$a0`             | exactly 32 binary digits                  |
|      36 | unsigned decimal       | `$a0`             | ordinary decimal digits, with no padding  |

Services 1 and 36 can print the same bits differently. If `$a0` contains `-1`, service 1 prints
`-1`, while service 36 treats those bits as an unsigned value and prints `4294967295`.

### Console input

| service | action         | input                                         | result        |
| ------: | -------------- | --------------------------------------------- | ------------- |
|       5 | read integer   | —                                             | `$v0`         |
|       6 | read float     | —                                             | `$f0`         |
|       7 | read double    | —                                             | `$f0` / `$f1` |
|       8 | read string    | buffer address in `$a0`, buffer size in `$a1` | memory        |
|      12 | read character | —                                             | `$v0`         |

For service 8, the size in `$a1` includes the final zero byte. A buffer of size `n` therefore holds
at most `n - 1` input characters. When the entered line and its newline fit within that limit, the
service stores the newline and then the zero terminator. If they do not fit, it stores as much of the
line as fits, followed by the terminator. With size 1 it writes only the terminator; with a size less
than 1 it writes nothing.

### Program control, time and less common services

- Service 10 ends the run. Service 17 also ends it and takes an exit code in `$a0`.
- Service 30 returns elapsed Playground program time in milliseconds, with the low 32 bits in `$a0`
  and the high 32 bits in `$a1`. Service 32 takes milliseconds in `$a0` and waits before the next
  instruction. The Playground stays responsive, and the service avoids a busy-wait loop that would
  repeatedly spend the program's instruction budget. In a testcase, the clock starts at zero and
  service 32 advances it immediately without a real delay.
- Service 9 allocates bytes from the heap and returns their address in `$v0`. Under the Playground's
  default memory layout, that heap begins at `0x10040000`; a different memory layout can place it
  elsewhere.
- Services 13–16 open, read, write and close files in the Playground project's **Files**. They do not
  expose arbitrary files from the computer running the browser.
- Services 41–44 take a generator ID in `$a0`. Service 41 replaces `$a0` with a signed integer;
  service 42 replaces it with an integer in the range `0 <= value < $a1`, so `$a1` must be positive.
  Service 43 returns a float in `$f0`, and service 44 returns a double in `$f0` / `$f1`. This
  Playground does not provide service 40 for setting a seed.
- Services 50–59 provide dialog-style input and output through the Playground interface.

Other service numbers are unsupported and end the run with an error. The
[MIPS syscall documentation page](/documentation/mips/syscall) lists the full register contract for
each supported service.

Some devices use **memory-mapped I/O** instead: the program loads and stores at special memory
addresses. That is a different interface from placing a service number in `$v0` and executing
`syscall`.

## Two output services

Print exactly `The answer is 42`, with no newline or other text. Use two output syscalls—one for the
string and one for the number—then use the exit syscall.

```mips|playground|console|exercise
.data
message: .asciiz "The answer is "

.text
.globl main
main:
    # your code here
```

```testcase
{
    "expectedOutput": "The answer is 42"
}
```

<details>
<summary>Show solution</summary>

```mips|playground|console|solution
.data
message: .asciiz "The answer is "

.text
.globl main
main:
    li $v0, 4
    la $a0, message
    syscall

    li $v0, 1
    li $a0, 42
    syscall

    li $v0, 10
    syscall
```

</details>

## Read, square and print twice

Read two integers. Print the square of the first, one space, and the square of the second, with
nothing else in the output. Assume both squares fit in a signed 32-bit value. The supplied inputs
check a positive number and a negative number.

```mips|playground|console|exercise
.text
.globl main
main:
    # your code here
```

```testcase
{
    "input": ["9", "-4"],
    "expectedOutput": "81 16"
}
```

<details>
<summary>Show solution</summary>

```mips|playground|console|solution
.text
.globl main
main:
    li $v0, 5
    syscall
    move $t0, $v0

    li $v0, 5
    syscall
    move $t1, $v0

    mul $a0, $t0, $t0
    li $v0, 1
    syscall

    li $v0, 11
    li $a0, ' '
    syscall

    mul $a0, $t1, $t1
    li $v0, 1
    syscall

    li $v0, 10
    syscall
```

```testcase
{
    "input": ["9", "-4"],
    "expectedOutput": "81 16"
}
```

</details>
