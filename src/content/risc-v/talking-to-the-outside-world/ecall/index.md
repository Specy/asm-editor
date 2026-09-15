Every program so far has left its answer in a register or in memory. To print a line, read what you
typed or ask what the time is, a RISC-V program asks the environment, and the instruction it asks
with is `ecall`.

## The three steps

`ecall` takes no operands at all. Everything about the request is in the registers:

1. put the **service number** in `a7`, which says what you want,
2. put the **arguments** in `a0`, and in `a1` and `a2` for the services that take more,
3. run `ecall`.

Anything the service answers with comes back in `a0`. There is one `ecall` instruction and about
thirty services behind it, and here is the part worth understanding: **which number means what is
not part of RISC-V**. The processor's only job is to stop what it was doing and hand over to
whatever is running the program. What that is, and what it makes of the number in `a7`, depends
entirely on where your program is running. A RISC-V chip inside a router would make nothing of a 4.
A RISC-V program under Linux asks in exactly the same way, with Linux's own numbers, and a few of
them match the ones here: 64 writes and 93 exits in both.

`a7` is the eighth argument register the rest of the time, and `a0` is both the first argument and
the first return value, which is the same double duty a subroutine call gives them.

## Printing

```riscv|playground|console|no-registers
.data
message: .asciz "Hello, world!\n"

.text
.globl main
main:
    li a7, 4                # service 4: print a null terminated string
    la a0, message
    ecall

    li a7, 1                # service 1: print a signed integer
    li a0, 42
    ecall

    li a7, 11               # service 11: print one character
    li a0, '\n'
    ecall

    li a7, 10               # service 10: end the program
    ecall
```

The console panel below the editor shows `Hello, world!` and then `42`. Service 4 walks the string
from `a0` until it reads a zero byte, which is why `.asciz` and not `.ascii`. Service 1 reads `a0` as
a **signed** 32 bit number, so `li a0, -1` prints `-1`.

`\n` inside a string is a newline, and `'\n'` as a character literal is the same byte, which is 10.
Nothing prints a newline for you: service 4 prints exactly the bytes you gave it.

`li a7, 10` and `ecall` is service 10, **exit**. Without it the program carries on into whatever
follows, which is why every program on this page ends with those two lines.

## Printing a number in another base

```riscv|playground|console|no-registers
.text
.globl main
main:
    li a7, 34               # service 34: hexadecimal, eight digits
    li a0, 255
    ecall

    li a7, 11
    li a0, ' '
    ecall

    li a7, 35               # service 35: binary, 32 digits
    li a0, 5
    ecall

    li a7, 11
    li a0, ' '
    ecall

    li a7, 36               # service 36: the same bits, unsigned decimal
    li a0, -1
    ecall

    li a7, 10
    ecall
```

The console reads `0x000000ff 00000000000000000000000000000101 4294967295`. All three of those pad to
the full width of a word, so 255 comes out as eight hex digits and 5 as thirty two binary ones, and
service 36 prints the same bits service 1 would have printed as `-1`.

Print -1 with service 34 and it comes out as `0xffffffff`, which is exactly what the registers panel
shows for that register: these three services show you the bits, and only service 1 puts a minus
sign on anything.

## Reading

```riscv|playground|console|no-registers
.data
prompt: .asciz "Give me a number: "
answer: .asciz "\nTwice that is "

.text
.globl main
main:
    li a7, 4
    la a0, prompt
    ecall

    li a7, 5                # service 5: read an integer into a0
    ecall
    add t0, a0, a0          # double what was typed

    li a7, 4
    la a0, answer
    ecall
    li a7, 1
    mv a0, t0
    ecall

    li a7, 10
    ecall
```

```testcase
{ "input": ["21"] }
```

Press Run and the program stops at the `ecall` with the prompt in the console and waits: type a
number in the box under it and press Enter, and the run carries on inside that one instruction.

The reading services are:

- **5** reads a line and parses it as a decimal number into `a0`. A line that is not a number ends
  the run.
- **12** reads one character into `a0`.
- **8** reads a whole line into the buffer at `a0`, up to `a1` characters, and keeps the newline. The
  buffer is yours, and `.space` is how you reserve it.

The answer lands in `a0`, and the `add t0, a0, a0` takes it out of there before the next `li a0` of
a printing service lands on top of it. Getting the answer out of `a0` before doing anything else is
the habit to form.

## The clock

```riscv|playground|console|no-registers
.data
label: .asciz " ms of program time\n"

.text
.globl main
main:
    li a7, 30               # service 30: milliseconds since the run started
    ecall
    mv s0, a0               # the low word of the answer

    li a7, 32               # service 32: wait
    li a0, 500
    ecall

    li a7, 30
    ecall
    sub t0, a0, s0          # how much time passed

    li a7, 1
    mv a0, t0
    ecall
    li a7, 4
    la a0, label
    ecall

    li a7, 10
    ecall
```

The console shows `500 ms of program time`. Service 30 counts from the **start of the run**, and it
answers in two registers, the low word in `a0` and the high word in `a1`. Whatever a clock counts
from, a program that wants to know how long something took subtracts two readings of it, which is
what the `sub` above does.

Service 32 waits for `a0` milliseconds of program time. The wait costs no instructions, so a program
that idles on the keyboard never reaches the Playground's two million, and the editor stays
responsive so Stop still answers. In a testcase both of them run on a virtual clock that starts at
zero and only moves through the program's own waits, which is why the number above is exactly 500 and
not 503.

## The whole table

| service | what it does                       | reads                                     | answers            |
| ------: | ---------------------------------- | ----------------------------------------- | ------------------ |
|       1 | print a signed integer             | `a0`                                      |                    |
|       2 | print a float                      | `f12`                                     |                    |
|       3 | print a double                     | `f12`                                     |                    |
|       4 | print a null terminated string     | `a0` = its address                        |                    |
|       5 | read an integer                    |                                           | `a0`               |
|       6 | read a float                       |                                           | `f0`               |
|       7 | read a double                      |                                           | `f0`               |
|       8 | read a line into a buffer          | `a0` = buffer, `a1` = how many characters | the string         |
|       9 | ask for heap memory                | `a0` = how many bytes                     | `a0` = the address |
|      10 | end the program                    |                                           |                    |
|      11 | print one character                | `a0`                                      |                    |
|      12 | read one character                 |                                           | `a0`               |
|      30 | milliseconds since the run started |                                           | `a0`, `a1`         |
|      32 | wait that many milliseconds        | `a0`                                      |                    |
|      34 | print an integer in hexadecimal    | `a0`                                      |                    |
|      35 | print an integer in binary         | `a0`                                      |                    |
|      36 | print an integer as unsigned       | `a0`                                      |                    |
|      41 | a random integer                   | `a0` = which generator                    | `a0`               |
|      42 | a random integer under a limit     | `a0` = which generator, `a1` = the limit  | `a0`               |
|      43 | a random float                     | `a0`                                      | `f0`               |
|      44 | a random double                    | `a0`                                      | `f0`               |
|      93 | end the program with a code        | `a0`                                      |                    |
|   50-60 | pop up dialog boxes                | see the documentation page                |                    |

The same table with a paragraph on each service is on the
[RISC-V ecall documentation page](/documentation/risc-v/syscall).

Service 9 hands out memory from the heap, which starts at `0x10040000`. There is no service that
gives it back, so a program that asks in a loop will eventually run out. Services 50 to 60 are the
dialog box services, and here they read from and write to the console like everything else, because
this editor has one place for input and one for output.

`ecall` with a number nothing answers to ends the run with
`invalid or unimplemented syscall service: 99`, naming the number. The four file services are the
ones this editor does not have: it has no file system, so `open`, `read`, `write` and `close` stop
the program with `Handler openFile is not implemented`.

## Ask for something yourself

Print `The answer is 42` and end the program, with nothing else in the output. The string is written
for you and the number is not part of it, so it takes two services.

```riscv|playground|console|exercise
.data
message: .asciz "The answer is "

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

```riscv|playground|console|solution
.data
message: .asciz "The answer is "

.text
.globl main
main:
    li a7, 4                # the string
    la a0, message
    ecall
    li a7, 1                # then the number
    li a0, 42
    ecall
    li a7, 10
    ecall
```

</details>

The second one reads a number and prints its square, with nothing else in the output. The test types
9, so the console reads `81`.

```riscv|playground|console|exercise
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

```riscv|playground|console|solution
.text
.globl main
main:
    li a7, 5                # read a number into a0
    ecall
    mul a0, a0, a0          # the answer is already where service 1 wants it
    li a7, 1
    ecall
    li a7, 10
    ecall
```

```testcase
{ "input": ["9"] }
```

</details>
