Every program so far has left its answer in a register or in memory. To print a line, read what you
typed or ask what the time is, a MIPS program asks the environment, and the instruction it asks with
is `syscall`.

## The three steps

`syscall` takes no operands at all. Everything about the request is in the registers:

1. put the **service number** in `$v0`, which says what you want,
2. put the **arguments** in `$a0`, and in `$a1` and `$a2` for the services that take more,
3. run `syscall`.

Anything the service answers with comes back in `$v0`, or in `$a0` for a few of them.

There is one `syscall` instruction and about thirty services behind it. Which number means what is
not part of the MIPS architecture at all: the instruction's whole job is to stop your program and
hand control to whatever is running it, and the numbering is that environment's business. Here,
4 prints a string. The same instruction on a MIPS chip running a router would be answered by its
operating system with a completely different list.

## Printing

```mips|playground|console|no-registers
.data
message: .asciiz "Hello, world!\n"

.text
.globl main
main:
    li $v0, 4               # service 4: print a null terminated string
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

The console panel below the editor shows `Hello, world!` and then `42`. Service 4 walks the string
from `$a0` until it reads a zero byte, which is why `.asciiz` and not `.ascii`. Service 1 reads `$a0`
as a **signed** 32 bit number, so `li $a0, -1` prints `-1`.

`\n` inside a string is a newline, and `'\n'` as a character literal is the same byte, code 10.
Service 4 prints exactly the bytes you gave it and not one more, so every line break in your output
is a byte you put there.

`li $v0, 10` and `syscall` is service 10, **exit**. Without it the program carries on into whatever
follows, which is why every program on this page ends with those two lines.

## Printing a number in another base

```mips|playground|console|no-registers
.text
.globl main
main:
    li $v0, 34              # service 34: hexadecimal, eight digits
    li $a0, 255
    syscall

    li $v0, 11
    li $a0, ' '
    syscall

    li $v0, 35              # service 35: binary, 32 digits
    li $a0, 5
    syscall

    li $v0, 11
    li $a0, ' '
    syscall

    li $v0, 36              # service 36: the same bits, unsigned decimal
    li $a0, -1
    syscall

    li $v0, 10
    syscall
```

The console reads `0x000000ff 00000000000000000000000000000101 4294967295`. All three pad out to the
full width of a register, so 255 arrives as eight hex digits and 5 as thirty two binary ones.

The last one is the one to look at. `li $a0, -1` followed by service 36 printed 4294967295, and the
same register printed by service 1 would have said `-1`. Same bits, two services, two correct
answers, which is the signed and unsigned business from "Words, halves and bytes" turning up in your
output.

## Reading

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

    li $v0, 5               # service 5: read an integer into $v0
    syscall
    add $t0, $v0, $v0       # double what was typed

    li $v0, 4
    la $a0, answer
    syscall
    li $v0, 1
    move $a0, $t0
    syscall

    li $v0, 10
    syscall
```

```testcase
{ "input": ["21"] }
```

Press Run and the program stops at the `syscall` with the prompt in the console and waits: type a
number in the box under it and press Enter, and the run carries on inside that one instruction.

The reading services are:

- **5** reads a line and parses it as a decimal number into `$v0`. A line that is not a number ends
  the run.
- **12** reads one character into `$v0`.
- **8** reads a whole line into the buffer at `$a0`, up to `$a1` characters, and keeps the newline.
  The buffer is yours, and `.space` is how you reserve it.

The answer of service 5 lands in `$v0`, the same register the number went into. So the value is
there for exactly as long as it takes you to write the next `li $v0`, and moving it out first is the
habit to keep.

## The clock

```mips|playground|console|no-registers
.data
label: .asciiz " ms of program time\n"

.text
.globl main
main:
    li $v0, 30              # service 30: milliseconds since the run started
    syscall
    move $s0, $a0           # the low word of the answer

    li $v0, 32              # service 32: wait
    li $a0, 500
    syscall

    li $v0, 30
    syscall
    sub $t0, $a0, $s0       # how much time passed

    li $v0, 1
    move $a0, $t0
    syscall
    li $v0, 4
    la $a0, label
    syscall

    li $v0, 10
    syscall
```

The console shows `500 ms of program time`. Service 30 counts milliseconds from the **start of the
run**, and answers in two registers, the low word in `$a0` and the high word in `$a1`. What you
almost always want from it is the difference between two readings, as the program above does, and a
difference does not care where the counting started.

Service 32 waits for `$a0` milliseconds. The wait costs no instructions at all, which matters more
than it sounds: a program sitting in a loop waiting for a key would otherwise burn through the
Playground's two million instruction budget doing nothing, and it would also lock the editor up so
that Stop could not answer. In a testcase the clock is virtual, starting at zero and moving only
through the program's own waits, which is why the number above is exactly 500 rather than 503.

## Every service

| service | what it does                       | reads                                       | answers             |
| ------: | ---------------------------------- | ------------------------------------------- | ------------------- |
|       1 | print a signed integer             | `$a0`                                       |                     |
|       2 | print a float                      | `$f12`                                      |                     |
|       3 | print a double                     | `$f12`                                      |                     |
|       4 | print a null terminated string     | `$a0` = its address                         |                     |
|       5 | read an integer                    |                                             | `$v0`               |
|       6 | read a float                       |                                             | `$f0`               |
|       7 | read a double                      |                                             | `$f0`               |
|       8 | read a line into a buffer          | `$a0` = buffer, `$a1` = how many characters | the string          |
|       9 | ask for heap memory                | `$a0` = how many bytes                      | `$v0` = the address |
|      10 | end the program                    |                                             |                     |
|      11 | print one character                | `$a0`                                       |                     |
|      12 | read one character                 |                                             | `$v0`               |
|      17 | end the program with a code        | `$a0`                                       |                     |
|      30 | milliseconds since the run started |                                             | `$a0`, `$a1`        |
|      32 | wait that many milliseconds        | `$a0`                                       |                     |
|      34 | print an integer in hexadecimal    | `$a0`                                       |                     |
|      35 | print an integer in binary         | `$a0`                                       |                     |
|      36 | print an integer as unsigned       | `$a0`                                       |                     |
|      41 | a random integer                   | `$a0` = which generator                     | `$a0`               |
|      42 | a random integer under a limit     | `$a0` = which generator, `$a1` = the limit  | `$a0`               |
|      43 | a random float                     | `$a0`                                       | `$f0`               |
|      44 | a random double                    | `$a0`                                       | `$f0`               |
|   50-59 | dialog box input and output        | see the documentation page                  |                     |

The same table with a paragraph on each service is on the
[MIPS syscall documentation page](/documentation/mips/syscall).

Service 9 hands out memory from the **heap**, a region starting at `0x10040000` that exists to be
handed out in pieces while a program runs. It is one way traffic: there is no service that gives a
piece back, so a program that asks in a loop eventually runs out. Services 50 to 59 are the dialog
box family, and they read and write the console here, since the console is the one place input and
output go.

`syscall` with a number nothing answers to ends the run with
`invalid or unimplemented syscall service: 99`, naming the number you asked for. Services 13 to 16
are the file services, `open`, `read`, `write` and `close`, and there is no file system behind them
here, so each stops the program with `Handler openFile is not implemented`.

## Two to print

Print `The answer is 42` and end the program, with nothing else in the output. The string is written
for you and the number is not part of it, so it takes two services.

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
    li $v0, 4               # the string
    la $a0, message
    syscall
    li $v0, 1               # then the number
    li $a0, 42
    syscall
    li $v0, 10
    syscall
```

</details>

The second one reads a number and prints its square, with nothing else in the output. The test types
9, so the console reads `81`.

```mips|playground|console|exercise
.text
.globl main
main:
    # your code here
```

```testcase
{
    "input": ["9"],
    "expectedOutput": "81"
}
```

<details>
<summary>Show solution</summary>

```mips|playground|console|solution
.text
.globl main
main:
    li $v0, 5               # read a number into $v0
    syscall
    mul $t0, $v0, $v0       # out of $v0 before the next service number goes in
    li $v0, 1
    move $a0, $t0
    syscall
    li $v0, 10
    syscall
```

```testcase
{ "input": ["9"] }
```

</details>
