This program asks for two numbers and prints their sum. Press Run. At the first prompt, type a
decimal integer in the console and press Enter. The program pauses at the read-integer `ecall`
until you submit the number.

Service 5 turns the text you entered into an integer and places that result in `a0`.

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
    mv t0, a0           # keep the first number

    li a7, 4
    la a0, second
    ecall
    li a7, 5
    ecall
    add t0, t0, a0      # add the second number

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

Service 5 places its result in `a0`. Save the first result before a setup instruction such as
`la a0, second` replaces it. Here `mv t0, a0` keeps that number in `t0`. After the second read,
`add t0, t0, a0` puts the sum in `t0`. Then `la a0, answer` loads the address of the answer string
for service 4, and `mv a0, t0` loads the sum for service 1.

For each number, the program prints its prompt with service 4 and then calls service 5 to read the
number.

The `\n` at the front of `second` and `answer` is a newline inside the string, so it starts the next
output on a new line. The text and newline in `.asciz "\nSecond number: "` occupy 16 bytes.
`.asciz` adds the zero terminator, so the declaration occupies 17 bytes in total.

Enter 17 and 25 at the prompts, and the program prints `The sum is 42`. Service 5 reads a **decimal** number. In this
Playground, input that is not a valid decimal integer ends the run.

Change `add` to `sub` and run the program with the same inputs. It prints `The sum is -8`, because service 1 prints its
argument as a **signed** number. After that change, `t0` contains the bits `FFFFFFF8`. Change the
`li a7, 1` in the output section to `li a7, 36`. Service 36 prints those same bits as the unsigned value
`4294967288`.

## Your turn: read two numbers and print their difference

Complete the program so it prints the first number minus the second. After the first read, save the
value before loading the address of the second prompt into `a0`.

```riscv|playground|console|exercise
.data
first:      .asciz "First number: "
second:     .asciz "\nSecond number: "
difference: .asciz "\nDifference: "

.text
.globl main
main:
    # print first, read the first number, and save it in t0
    # print second and read the second number
    # subtract the second number from t0 and print the result
    # end the run
```

```testcase
{
    "input": ["23", "8"],
    "expectedOutput": "First number: \nSecond number: \nDifference: 15"
}
```

```testcase
{
    "input": ["-4", "6"],
    "expectedOutput": "First number: \nSecond number: \nDifference: -10"
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|console|solution
.data
first:      .asciz "First number: "
second:     .asciz "\nSecond number: "
difference: .asciz "\nDifference: "

.text
.globl main
main:
    li a7, 4
    la a0, first
    ecall
    li a7, 5
    ecall
    mv t0, a0

    li a7, 4
    la a0, second
    ecall
    li a7, 5
    ecall
    sub t0, t0, a0

    li a7, 4
    la a0, difference
    ecall
    li a7, 1
    mv a0, t0
    ecall

    li a7, 10
    ecall
```

```testcase
{ "input": ["23", "8"] }
```

</details>
