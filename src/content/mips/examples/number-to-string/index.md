48879 printed three times, as `BEEF`, as `48879` and as `1011111011101111`, by a subroutine that
turns a number into characters itself. Services 1, 34 and 35 do the same job in one request; this is
what they do inside, and it is the program every language writes once and then hides in a library.

The only service this program uses is the one that prints a string. Everything between a number and
that string is the program's own work, and that work is what this page is about.

```mips|playground|console|allow-open
.data
buffer:     .space 34       # 32 binary digits, the terminator and a spare byte
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
    addi $t0, $t0, -1       # one byte in front of the digits we have
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

Dividing by the base and keeping the remainder gives you one digit, and it is the **lowest** one:
48879 divided by 16 is 3054 with 15 left over, and 15 is the `F` at the right hand end of `BEEF`. So
the digits arrive in the opposite order to the one they are printed in, and the two ways round that
are to reverse the buffer afterwards or to write it backwards in the first place.

`div` is exactly the right instruction for this, because one pass of the loop needs both of its
answers: the remainder is the digit and the quotient is what you carry on dividing. One `div`, one
`mfhi` and one `mflo`, and the pass has everything it needs.

Writing the buffer backwards costs an `addi` before every store, since a store addresses memory as
`offset(base)` and cannot move the pointer itself. The pay off is that when the loop ends, `$t0` is
already sitting on the first character of the answer, which is precisely the address service 4 wants
handed to it.

A digit is a number from 0 to `base - 1` and it has to become a character. `'0'` is 48, so adding it
turns 0 to 9 into `'0'` to `'9'`; `'A'` is 65 and a 10 has to become that, so the amount added
is 55. The assembler here does no arithmetic, so `'A'-10` is a build error and the 55 goes in with a
comment saying where it came from. `blt $t1, 10, number` is what picks between the two, which is
what makes a base up to 36 work.

`bnez $a0, digit` is the loop's condition, and `mflo $a0` above it is what it reads: the quotient
becomes the new `n`, and when it reaches zero there is nothing left to divide. The buffer has 34
bytes because the longest answer is a 32 bit number in base 2, and after the binary run `$t0` comes
out at `10010011`, seventeen bytes down from `buffer_end`.

Change `li $a1, 2` to `li $a1, 36` and the third line of the console becomes `11PR`. Thirty six is
as far as this subroutine goes, because 10 digits and 26 letters is every character it knows how to
make.
