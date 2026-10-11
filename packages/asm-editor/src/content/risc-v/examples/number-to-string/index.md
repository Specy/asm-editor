This program prints the nonnegative number 48879 in hexadecimal, decimal, and binary without using
a service that prints numbers. It produces three lines:

```text
BEEF
48879
1011111011101111
```

The subroutine builds the characters for each line, then gives the finished string to service 4.
Its contract is:

- `a0` contains a nonnegative 32-bit signed integer, from 0 through 2147483647.
- `a1` contains a base from 2 through 36.
- `a0` is consumed as the running quotient. After the call, do not rely on any `a` or `t` register
  retaining its value.

Those limits matter. Base 0 is not a number base, and division by base 1 would never bring a
positive quotient down to zero. Negative values also need extra handling that this version does not
provide.

```riscv|playground|console|allow-open
.data
buffer:     .space 34       # 31 binary digits, the terminator, and two spare bytes
buffer_end:                 # address immediately after those 34 reserved bytes
newline:    .asciz "\n"

.text
.globl main

# print_in_base(n, base): n in a0, base in a1
# Requires 0 <= n <= 2147483647 and 2 <= base <= 36.
print_in_base:
    la t0, buffer_end       # build the text backwards from the end
    addi t0, t0, -1         # move onto the final reserved byte
    sb zero, 0(t0)          # install the string terminator first
    li t2, 10               # split numeric digits from letter digits
digit:
    rem t1, a0, a1          # get the digit before a0 is overwritten
    div a0, a0, a1          # consume a0: it now holds the quotient
    blt t1, t2, number
    addi t1, t1, 55         # 10 + 55 is the character code for 'A'
    j store
number:
    addi t1, t1, 48         # 0 + 48 is the character code for '0'
store:
    addi t0, t0, -1         # move one byte in front of the existing text
    sb t1, 0(t0)
    bnez a0, digit          # continue while the quotient is not zero
    li a7, 4                # service 4 prints the string just built
    mv a0, t0
    ecall
    li a7, 4
    la a0, newline
    ecall
    ret

main:
    li a0, 48879
    li a1, 16
    jal print_in_base
    li a0, 48879
    li a1, 10
    jal print_in_base
    li a0, 48879
    li a1, 2
    jal print_in_base
    li a7, 10
    ecall
```

Dividing by the base and keeping the remainder gives the lowest digit. For example, 48879 divided
by 16 is 3054 with 15 left over. The remainder 15 is the `F` at the right-hand end of `BEEF`.
Repeated division therefore discovers the digits from right to left. The program matches that order
by filling the buffer backward.

Here is 48879 in base 16 coming apart, one pass per row:

| pass | `a0` before | remainder | digit | `a0` after |
| ---- | ----------- | --------- | ----- | ---------- |
| 1    | 48879       | 15        | `F`   | 3054       |
| 2    | 3054        | 14        | `E`   | 190        |
| 3    | 190         | 14        | `E`   | 11         |
| 4    | 11          | 11        | `B`   | 0          |

The label `buffer_end` is immediately after the 34 bytes reserved by `.space 34`. The code subtracts
one from that address and puts the zero terminator in the final reserved byte. Each pass then moves
`t0` back one more byte before storing a digit. When the loop finishes, `t0` points to the first
character, which is exactly the address service 4 needs.

RISC-V provides quotient and remainder as separate instructions. Both `rem` and `div` must read the
original dividend, so `rem` comes first: `div a0, a0, a1` replaces that dividend in `a0` with the
quotient. Under the routine's contract, both operands are nonnegative, so `rem` produces a remainder
from 0 through `base - 1`. That also makes the signed `blt` safe here.

A remainder is still a number and must be changed into a character code. Adding 48 maps 0 through 9
to `'0'` through `'9'`. For larger digits, adding 55 maps 10 through 35 to `'A'` through `'Z'`:
10 + 55 is 65, the code for `'A'`. The program uses the already-calculated immediate 55.

The loop runs once even when the input is zero, so zero becomes the one-character string `"0"`.
For the largest supported value, base 2 needs 31 digits. The 34-byte buffer therefore has room for
all supported results, the zero terminator, and two unused bytes.

## Your turn: finish the conversion loop

Complete the missing instructions in `print_in_base`. Each pass must find the remainder before
replacing `a0` with the quotient, choose a numeric or letter character, store it in front of the text
already built, and repeat while the quotient is nonzero. The supplied calls should print `FF`,
`12345`, and `11111111`.

```riscv|playground|console|exercise
.data
buffer:     .space 34
buffer_end:
newline:    .asciz "\n"

.text
.globl main
print_in_base:
    la t0, buffer_end
    addi t0, t0, -1
    sb zero, 0(t0)
    li t2, 10
digit:
    # Put the next digit value in t1, then update a0 to the quotient.
    # If t1 is below 10, branch to number.
    # Otherwise, turn 10..35 into 'A'..'Z', then jump to store.
number:
    # Turn 0..9 into '0'..'9'.
store:
    # Move backward, store the character, and repeat if a0 is nonzero.
    li a7, 4
    mv a0, t0
    ecall
    li a7, 4
    la a0, newline
    ecall
    ret

main:
    li a0, 255
    li a1, 16
    jal print_in_base
    li a0, 12345
    li a1, 10
    jal print_in_base
    li a0, 255
    li a1, 2
    jal print_in_base
    li a7, 10
    ecall
```

```testcase
{ "expectedOutput": "FF\n12345\n11111111\n" }
```

<details>
<summary>Show solution</summary>

```riscv|playground|console|solution
.data
buffer:     .space 34
buffer_end:
newline:    .asciz "\n"

.text
.globl main
print_in_base:
    la t0, buffer_end
    addi t0, t0, -1
    sb zero, 0(t0)
    li t2, 10
digit:
    rem t1, a0, a1
    div a0, a0, a1
    blt t1, t2, number
    addi t1, t1, 55
    j store
number:
    addi t1, t1, 48
store:
    addi t0, t0, -1
    sb t1, 0(t0)
    bnez a0, digit
    li a7, 4
    mv a0, t0
    ecall
    li a7, 4
    la a0, newline
    ecall
    ret

main:
    li a0, 255
    li a1, 16
    jal print_in_base
    li a0, 12345
    li a1, 10
    jal print_in_base
    li a0, 255
    li a1, 2
    jal print_in_base
    li a7, 10
    ecall
```

```testcase
{ "expectedOutput": "FF\n12345\n11111111\n" }
```

</details>

As an optional extension, accept a negative value only for base 10: remember that it was negative,
convert its magnitude, and place a minus sign in front of the finished digits. The most negative
signed 32-bit value needs special care because its positive magnitude does not fit in a signed
32-bit register.
