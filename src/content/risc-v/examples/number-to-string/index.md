48879 printed three times, as `BEEF`, as `48879` and as `1011111011101111`, by a subroutine that
turns a number into characters itself. Services 1, 34 and 35 do the same job in one request; this is
what they do inside, and it is the program every language writes once and then hides in a library.

Read two numbers and print their sum handed a number to a service and got text back. Here the only
service used is the one that prints a string, and everything between the number and the string is
yours.

**You need to know:** the "Multiply and divide, with the remainder" Example and the "ecall" lecture.
What is new here is that the digits come out backwards, the lowest one first, so the buffer is filled
from its end towards its front.

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

`rem` before `div` is the order that matters, since `div a0, a0, a1` overwrites the number the
remainder was taken from. Each of them is one instruction that writes one register, so a pass costs
two divisions of the same pair; the M68K writes a `divu`, a `swap` and two masks because it packs
both answers into one register, and MIPS writes a `div` and two moves out of `hi` and `lo`.

Writing backwards costs an `addi` before every store. The M68K has `-(a1)`, an addressing mode that
subtracts and then writes in one instruction; the only mode a RISC-V store has is `offset(base)`, so
the pointer is moved by an instruction of its own and `t0` is left pointing at the first character,
which is what service 4 is then given.

A digit is a number from 0 to `base - 1` and it has to become a character. `'0'` is 48, so adding it
turns 0 to 9 into `'0'` to `'9'`; `'A'` is 65 and a 10 has to become that, so the amount added is 55.
The assembler here does no arithmetic, so `'A'-10` is a build error and the 55 goes in with a comment
saying where it came from. `blt t1, t2, number` is what picks between the two, with the 10 in `t2`
because a branch compares two registers, and that comparison is what makes a base up to 36 work.

`bnez a0, digit` is the loop's condition, and `div a0, a0, a1` above it is what it reads: the quotient
becomes the new `n`, and when it reaches zero there is nothing left to divide. The buffer has 34 bytes
because the longest answer is a 32 bit number in base 2, and after the binary run `t0` comes out at
`10010011`, seventeen bytes down from `buffer_end`. The three lines take 232 instructions in all.

Try changing `li a1, 2` to `li a1, 36`, the largest base the digits reach. The third line of the
console becomes `11PR`.
