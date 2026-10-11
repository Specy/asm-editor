This program prints 48879 in three bases: `BEEF` in base 16, `48879` in base 10, and
`1011111011101111` in base 2. The `print_in_base` subroutine makes the digits itself, stores them
as a string, and asks service 4 to print that string.

Pass a nonnegative signed 32-bit integer (0 through 2147483647) in `$a0` and a base from 2 through
36 in `$a1`. The subroutine prints the number followed by a newline. It changes `$a0`, `$t0`,
`$t1`, `$v0`, `hi`, and `lo`; callers that need those old values must save them. Bases below 2 are
invalid for this loop: division by zero has no answer, and dividing a positive number by 1 never
makes it smaller.

```mips|playground|console|allow-open
.data
buffer:     .space 34       # room for 31 binary digits, a zero, and two spare bytes
buffer_end:
newline:    .asciiz "\n"

.text
.globl main

# print_in_base(n, base): n in $a0, base in $a1
print_in_base:
    la $t0, buffer_end      # build the text backwards from the end
    addi $t0, $t0, -1
    sb $zero, 0($t0)        # the terminator goes down first
digit:
    div $a0, $a1            # n / base in lo, n % base in hi
    mfhi $t1                # the digit
    mflo $a0                # n = n / base
    blt $t1, 10, number
    addi $t1, $t1, 55       # 'A' is 65, so a 10 becomes 'A'
    j store
number:
    addi $t1, $t1, 48       # '0' is 48, so a 0 becomes '0'
store:
    addi $t0, $t0, -1       # next free byte before the digits already stored
    sb $t1, 0($t0)
    bnez $a0, digit         # until nothing is left of n
    li $v0, 4               # service 4: print the string that was built
    move $a0, $t0
    syscall
    li $v0, 4
    la $a0, newline
    syscall
    jr $ra

main:
    li $a0, 48879
    li $a1, 16              # in hexadecimal
    jal print_in_base
    li $a0, 48879
    li $a1, 10              # in decimal
    jal print_in_base
    li $a0, 48879
    li $a1, 2               # in binary
    jal print_in_base
    li $v0, 10
    syscall
```

The console shows:

```text
BEEF
48879
1011111011101111
```

Dividing by the base and keeping the remainder gives you one digit, and it is the **lowest** one:
48879 divided by 16 is 3054 with 15 left over, and 15 is the `F` at the right hand end of `BEEF`. So
the digits arrive rightmost first. This program stores them from the end of the buffer toward its
beginning, leaving them in the order service 4 must print.

`div` is exactly the right instruction for this, because one pass of the loop needs both of its
answers: the remainder is the digit and the quotient is what you carry on dividing. One `div`, one
`mfhi` and one `mflo`, and the pass has everything it needs.

`sb` writes one character byte at a time. The `addi` before it moves `$t0` to the next free byte;
`sb` itself does not move the pointer. At the end, `$t0` points to the first digit. Service 4
starts there and prints bytes until it reaches the zero terminator placed at the end.

A digit is a number from 0 to `base - 1` and it has to become a character. `'0'` is 48, so adding it
turns 0 to 9 into `'0'` to `'9'`; `'A'` is 65 and a 10 has to become that, so the amount added
is 55. This assembler does not accept `'A' - 10` as the operand here, so the code uses 55 and
explains it in the comment. `blt $t1, 10, number` picks between numbers and letters, allowing
digits up to `Z` for base 36.

`bnez $a0, digit` checks the quotient copied into `$a0` by `mflo`. When that quotient reaches zero,
there are no more digits to make. The loop still runs once for input zero: `0 / base` gives a zero
remainder, so it stores one `0` character before stopping.

The longest input in the stated range, 2147483647, takes 31 binary digits. The last byte of
`buffer` holds the zero terminator. Up to 31 bytes before it hold digits, and two bytes at the
beginning remain unused. For the 16-digit binary result shown above, `$t0` ends at
`buffer_end - 17`: 16 digits followed by the terminator.

Predict the third line if you change its base from 2 to 36. Select **Open in editor**, make the
change, then **Build** and **Run**: it should print `11PR`. Base 36 is the limit because the routine
has characters for ten decimal digits and 26 letters.

Now change that third call to pass 0 in `$a0` and base 16 in `$a1`. Predict how many characters the
loop stores, then **Build** and **Run**. The third line should be a single `0`. Try 255 in base 16
as another check; the third line should be `FF`.
