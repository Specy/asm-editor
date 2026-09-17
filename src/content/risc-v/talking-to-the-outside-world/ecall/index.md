So far, a program's answer has stayed in a register or memory. To print, read input, wait, or finish
the run, it asks the environment through `ecall`.

## One instruction, a Playground convention

The RISC-V ISA defines `ecall` as an **environment call**: it raises a trap so that the environment
running the program can handle a request. The ISA does not define a print service, a service number,
or which registers carry a request. This Playground defines that small conversation:

1. put the service number in `a7`,
2. put that service's inputs in its documented registers,
3. run `ecall`.

Integer results usually arrive in `a0`. Check the service's entry, though: the clock also uses `a1`
and floating-point reading services use `f0`. A service that writes into memory, such as reading a
line, leaves its answer in that memory instead of returning a new register value.

This is a **service ABI**, an agreement between your program and the Playground. It is separate from
the ordinary RISC-V function-call ABI. In a function call, floating arguments and results use `fa0`
through `fa7`, with a result in `fa0`. The Playground's floating services instead take a value to
print in `f12` and put a value read from input in `f0`. Use the service table for `ecall`; use the
function calling convention for `jal` and `ret`.

`a7` is also an argument register in an ordinary function call, and `a0` is both the first argument
and usual one-word result there. That familiar overlap is why a value in `a0` needs saving before a
later request uses `a0` for something else.

Linux programs also use the `ecall` instruction, with Linux's own service ABI. A number that happens
to match, such as 93 for exit, does not make a Playground program portable to Linux. The numbers on
this page are Playground conventions.

## Printing

```riscv|playground|console|no-registers
.data
message: .asciz "Hello, world!\n"

.text
.globl main
main:
    li a7, 4                # service 4: print a zero-terminated string
    la a0, message
    ecall

    li a7, 1                # service 1: print a signed integer
    li a0, 42
    ecall

    li a7, 11               # service 11: print one character
    li a0, '\n'
    ecall

    li a7, 10               # service 10: end this Playground run
    ecall
```

The console shows `Hello, world!` and then `42`. Service 4 starts at the address in `a0` and prints
bytes through the first zero byte, which is why the declaration uses `.asciz` rather than `.ascii`.
Service 1 reads `a0` as a signed 32-bit number, so `li a0, -1` prints `-1`.

`\n` in a string is a newline. `'\n'` is one character literal with the same byte value, 10. Each
printing service writes exactly what its input describes; a newline only appears when the program
prints one.

### A floating-point service

The floating register names in this example are deliberate. `flw` puts the single in `f12` because
service 2 reads `f12`; a function call would normally pass the same kind of value in `fa0`.

```riscv|playground|console|fpu|no-registers
.data
value: .float 3.5

.text
.globl main
main:
    la t0, value
    flw f12, 0(t0)
    li a7, 2                # service 2: print the float in f12
    ecall

    li a7, 11
    li a0, '\n'
    ecall
    li a7, 10
    ecall
```

It prints `3.5`. Service 3 prints a double from `f12`; services 6 and 7 read a float or double and
return it in `f0`.

## Printing a number in another base

```riscv|playground|console|no-registers
.text
.globl main
main:
    li a7, 34               # hexadecimal, padded to eight digits
    li a0, 255
    ecall

    li a7, 11
    li a0, ' '
    ecall

    li a7, 35               # binary, padded to 32 digits
    li a0, 5
    ecall

    li a7, 11
    li a0, ' '
    ecall

    li a7, 36               # the bits interpreted as unsigned decimal
    li a0, -1
    ecall

    li a7, 10
    ecall
```

The console reads `0x000000ff 00000000000000000000000000000101 4294967295`. Services 34 and 35 pad
their output to a word's hexadecimal or binary width. Service 36 prints ordinary unsigned decimal,
so it has no fixed width. It interprets the bits of `-1` as the unsigned value 4294967295.

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
    add t0, a0, a0          # save the calculation before reusing a0

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

When the run reaches service 5, type a decimal number in the console input box and press Enter. The
service parses that line and places the integer in `a0`. The `add` doubles it into `t0`, keeping the
calculated value there before the following print request replaces `a0` with an address.

Service 12 reads one character into `a0`. Service 8 reads a line into a buffer in memory:

```riscv
.data
line: .space 16

.text
main:
    la a0, line            # destination buffer
    li a1, 16              # its total capacity, including the final zero
    li a7, 8
    ecall
```

For service 8, `a1` is the buffer's total capacity, including room for the zero terminator. With a
capacity of `n`, it stores at most `n - 1` input characters, then writes a zero when `n` is 1 or
greater. A short line includes its newline when there is room; a longer line is truncated after `n - 1`
characters. Capacity 1 writes only the zero, and a capacity below 1 writes nothing. The completed
string is in `line`, ready for service 4 to print.

## The clock and waiting

```riscv|playground|console|no-registers
.data
label: .asciz " ms elapsed\n"

.text
.globl main
main:
    li a7, 30               # milliseconds since this interactive run began
    ecall
    mv s0, a0               # keep the low word of the first reading

    li a7, 32               # wait for the count in a0
    li a0, 500
    ecall

    li a7, 30
    ecall
    sub t0, a0, s0          # low-word difference; 500 cannot wrap it

    li a7, 1
    mv a0, t0
    ecall
    li a7, 4
    la a0, label
    ecall

    li a7, 10
    ecall
```

Service 30 returns elapsed milliseconds as one 64-bit reading split across two 32-bit registers:
the low word is `a0` and the high word is `a1`. The short wait above is safely measured by subtracting
only the low words: 500 cannot wrap a 32-bit count. An interactive run requests a 500-millisecond
wait, then prints 500 milliseconds or a little more as real time continues to pass.

In an interactive run, service 30 measures time from the start of that run and service 32 waits for
the requested duration. In a testcase, the Playground uses a virtual clock: it starts at zero and
service 32 advances it immediately. A testcase that waits for 500 milliseconds therefore observes
exactly 500 without depending on the speed of the computer running it.

## Common Playground services

This is a curated reference for the services used most often on this page. The
[RISC-V ecall documentation page](/documentation/risc-v/syscall) has the full service reference.

| service | what it does                   | reads                                | result or effect                          |
| ------: | ------------------------------ | ------------------------------------ | ----------------------------------------- |
|       1 | print a signed integer         | `a0`                                 |                                           |
|       2 | print a float                  | `f12`                                |                                           |
|       3 | print a double                 | `f12`                                |                                           |
|       4 | print a zero-terminated string | `a0` = address                       |                                           |
|       5 | read an integer                |                                      | `a0`                                      |
|       6 | read a float                   |                                      | `f0`                                      |
|       7 | read a double                  |                                      | `f0`                                      |
|       8 | read a line into a buffer      | `a0` = buffer, `a1` = total capacity | writes a zero-terminated string to buffer |
|      10 | end the run                    |                                      |                                           |
|      11 | print one character            | `a0`                                 |                                           |
|      12 | read one character             |                                      | `a0`                                      |
|      30 | milliseconds since run start   |                                      | low word `a0`, high word `a1`             |
|      32 | wait for milliseconds          | `a0`                                 |                                           |
|      34 | print hexadecimal              | `a0`                                 | eight hexadecimal digits                  |
|      35 | print binary                   | `a0`                                 | 32 binary digits                          |
|      36 | print unsigned decimal         | `a0`                                 |                                           |
|      93 | end the run with a code        | `a0`                                 |                                           |

## Ask for something yourself

Print `The answer is 42` and end the program, with nothing else in the output. The string is
written for you and the number is separate, so this takes two print requests.

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
    li a7, 4
    la a0, message
    ecall
    li a7, 1
    li a0, 42
    ecall
    li a7, 10
    ecall
```

</details>

The next program reads a number and prints its square, with nothing else in the output. Its input
and output trace is simply `9` in, then `81` out.

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
    mul a0, a0, a0          # its result is where service 1 reads it
    li a7, 1
    ecall
    li a7, 10
    ecall
```

```testcase
{ "input": ["9"] }
```

</details>

Finally, read one short line into the supplied buffer and print it unchanged. With input `cat`, the
output is `cat` followed by its newline.

```riscv|playground|console|exercise
.data
line: .space 8

.text
.globl main
main:
    # your code here
```

```testcase
{
    "input": ["cat"],
    "expectedOutput": "cat\n"
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|console|solution
.data
line: .space 8

.text
.globl main
main:
    la a0, line
    li a1, 8
    li a7, 8
    ecall

    la a0, line             # name the completed buffer for service 4
    li a7, 4
    ecall
    li a7, 10
    ecall
```

```testcase
{ "input": ["cat\n"] }
```

</details>
