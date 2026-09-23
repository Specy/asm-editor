This is a short output-formatting recap. In the Playground, put a service number in `a7`, put its
input in the register that service expects, and run `ecall`. Here the program builds one console
line from text, a number, and one character:

```riscv|playground|console|no-registers|allow-open
.data
label: .asciz "Items: "

.text
.globl main
main:
    li a7, 4            # service 4: print a zero-terminated string
    la a0, label
    ecall

    li a7, 1            # service 1: print a signed integer
    li a0, 42
    ecall

    li a7, 11           # service 11: print one character
    li a0, '\n'
    ecall

    li a7, 10           # end this Playground run
    ecall
```

The console reads:

```text
Items: 42
```

The register names are familiar from function calls. For this Playground request, `a7` temporarily
holds the service number and `a0` holds the first input. Watch `a0` as the program runs: it first
holds the address of `label`, then the number 42, then the newline character. Each `ecall` uses the
values currently in those registers.

Because service 4 needs a zero-terminated string, this declaration uses `.asciz`. Its seven
characters take seven bytes, and `.asciz` adds an eighth byte whose value is zero. Service 4 starts
at the address in `a0` and prints through that zero. `.ascii` does not add it, so service 4 could
continue into later data instead of stopping after the label.

The three services each print one kind of value: service 4 prints a zero-terminated string, service
1 prints a signed 32-bit integer, and service 11 prints one character. That is why the line needs
three requests. The final exit request ends this Playground run deliberately.

## Format a greeting

Make the console read exactly `Hello Ada` followed by a newline. Print the two supplied strings
with service 4. Print the space and newline one character at a time with service 11, then end the
run with service 10.

```riscv|playground|console|exercise
.data
greeting: .asciz "Hello"
name:     .asciz "Ada"

.text
.globl main
main:
    # print greeting, a space, name, and a newline
    # then end the Playground run
```

```testcase
{
    "expectedOutput": "Hello Ada\n"
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|console|solution
.data
greeting: .asciz "Hello"
name:     .asciz "Ada"

.text
.globl main
main:
    li a7, 4
    la a0, greeting
    ecall

    li a7, 11
    li a0, ' '
    ecall

    li a7, 4
    la a0, name
    ecall

    li a7, 11
    li a0, '\n'
    ecall

    li a7, 10
    ecall
```

</details>
