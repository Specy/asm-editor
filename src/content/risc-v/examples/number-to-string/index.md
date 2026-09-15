48879 printed three times, as `BEEF`, as `48879` and as `1011111011101111`, by a subroutine that
turns a number into characters itself. Services 1, 34 and 35 do the same job in one request; this is
what they do inside, and it is the program every language writes once and then hides in a library.

The service that prints a number does this work for you. Doing it by hand is worth once, because
every language has this routine somewhere and it is short enough to read all of.

```riscv|playground|console|allow-open
.data
buffer:     .space 34       # 32 binary digits, the terminator and a spare byte
buffer_end:
newline:    .asciz "\n"

.text
.globl main

# print_in_base(n, base): n in a0, base in a1
print_in_base:
    la t0, buffer_end       # build the text backwards from the end
    addi t0, t0, -1
    sb zero, 0(t0)          # the terminator goes down first
    li t2, 10               # the bound a branch needs in a register
digit:
    rem t1, a0, a1          # the digit, before a0 is overwritten
    div a0, a0, a1          # n = n / base
    blt t1, t2, number
    addi t1, t1, 55         # 'A' is 65, so a 10 becomes 'A'
    j store
number:
    addi t1, t1, 48         # '0' is 48, so a 0 becomes '0'
store:
    addi t0, t0, -1         # one byte in front of the digits we have
    sb t1, 0(t0)
    bnez a0, digit          # until nothing is left of n
    li a7, 4                # service 4: print the string that was built
    mv a0, t0
    ecall
    li a7, 4
    la a0, newline
    ecall
    ret

main:
    li a0, 48879
    li a1, 16               # in hexadecimal
    jal print_in_base
    li a0, 48879
    li a1, 10               # in decimal
    jal print_in_base
    li a0, 48879
    li a1, 2                # in binary
    jal print_in_base
    li a7, 10
    ecall
```

Dividing by the base and keeping the remainder gives you one digit, and it is the **lowest** one:
48879 divided by 16 is 3054 with 15 left over, and 15 is the `F` at the right hand end of `BEEF`. So
the digits arrive in the opposite order to the one they are printed in, and the two ways round that
are to reverse the buffer afterwards or to write it backwards in the first place.

Here is 48879 in base 16 coming apart, one pass per row:

| pass | `a0` before | `rem` | digit | `a0` after |
| ---- | ----------- | ----- | ----- | ---------- |
| 1    | 48879       | 15    | `F`   | 3054       |
| 2    | 3054        | 14    | `E`   | 190        |
| 3    | 190         | 14    | `E`   | 11         |
| 4    | 11          | 11    | `B`   | 0          |

`F`, `E`, `E`, `B`, and the answer is `BEEF`. The digits come out in the reverse of the order they
are written in, every time, so the buffer is filled from its last byte towards its first and the
pointer ends up on the first character.

`rem` has to come before `div`, because `div a0, a0, a1` overwrites the very number the remainder is
taken from. Both write one register each, so a pass does the same division twice.

A digit arrives as a number from 0 to 35 and has to leave as a character. The character `'0'` is the
byte 48, so adding 48 turns 0 through 9 into `'0'` through `'9'`. The character `'A'` is 65 and it
has to stand for the digit 10, so the amount to add there is 65 minus 10, which is 55. That is where
the constant comes from, and it is written as 55 because `'A'-10` inside an instruction will not
build. `blt t1, t2, number` picks between the two cases, and it is what lets any base up to 36
work.

`bnez a0, digit` ends the loop when the quotient reaches zero, which is when there is nothing left
of the number to take digits off. The buffer is 34 bytes because the longest answer this can produce
is a 32 bit number in base 2, which is 32 digits plus the terminator.
