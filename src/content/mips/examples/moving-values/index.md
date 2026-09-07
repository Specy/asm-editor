Two numbers go into registers, the program works out the perimeter of the rectangle they describe,
and the answer stays in `$t2`. Nothing is read from memory and nothing branches: every value is in a
register from the first instruction to the last, which is what the registers panel next to the
program shows you.

This is the first program of the ladder, and the ones after it are built out of the same two steps:
a number into a register, and an instruction that reads two registers and writes a third.

**You need to know:** the "Getting started with MIPS" lecture and the "The 32 registers and their
names" lecture. What is new here is the destination being an operand of its own, so an `add` can
leave both of the numbers it read exactly as they were.

```mips|playground|allow-open
.text
main:
    li $t0, 30          # width = 30
    li $t1, 12          # height = 12
    add $t2, $t0, $t1   # half = width + height
    add $t2, $t2, $t2   # perimeter = half + half

    move $t3, $t2       # a copy of the answer
    add $t4, $t2, $zero # the same copy, written out
    sub $t5, $t0, $t1   # how much wider than tall it is
```

`li $t0, 30` puts the number 30 into `$t0`, and there is no `#` in front of it: an operand that is a
number is a number, and an operand that is a register has a `$`. The two `add` instructions are one
C line, `perimeter = 2 * (width + height)`, and `add $t2, $t2, $t2` adds a register to itself, which
is how you double a number without a multiplication.

The M68K writes that pair as a copy and two adds, because an `add.l d1, d0` has two operands and one
of them has to be the destination. Here the destination is named separately, so `add $t2, $t0, $t1`
leaves 30 in `$t0` and 12 in `$t1` and nothing else moves.

`$t2`, `$t3` and `$t4` all come out at `00000054`, which is 84. `move $t3, $t2` is a
pseudo-instruction and the line under it is what the assembler turns it into: adding `$zero`, which
always reads 0, copies a register.

Try changing `sub $t5, $t0, $t1` to `sub $t5, $t1, $t0`. `$t5` comes out at `FFFFFFEE` instead of
`00000012`, which is -18: the order of the two operands after the destination decides which way
round the subtraction goes, and the registers panel shows you the bits either way.
