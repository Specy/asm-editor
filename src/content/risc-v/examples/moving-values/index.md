Two numbers go into registers and the program works out the perimeter of the rectangle they describe.
Nothing is read from memory and nothing branches: every value is in a register from the first
instruction to the last, and the registers panel next to the program is where you watch it happen.

```riscv|playground|allow-open
.text
main:
    li t0, 30           # width = 30
    li t1, 12           # height = 12
    add t2, t0, t1      # add the two sides
    add t2, t2, t2      # and double that

    mv t3, t2           # a copy of the answer
    add t4, t2, zero    # the same copy, written out
    sub t5, t0, t1      # how much wider than tall it is
```

`li t0, 30` puts the number 30 into `t0`. There is no marker in front of the 30 and none in front of
`t0` either: an operand that is a number is a number, and a register is written by its name.

An `add` names three registers, and the first of them is where the answer goes. So `add t2, t0, t1`
reads `t0` and `t1`, writes `t2`, and leaves 30 and 12 exactly where they were. That is worth
noticing early, because it means you can use a value over and over without copying it out of the way
first. `add t2, t2, t2` reads the same register twice and doubles it, which is the cheapest
multiplication there is.

`mv t3, t2` copies a register. The line under it is the same thing written out: `zero` always reads
0, so adding it to a value and storing the result elsewhere is a copy. `mv` is the assembler's
shorthand for exactly that instruction, and the panel cannot tell the two lines apart.

`sub t5, t0, t1` subtracts in the order written, `t0` minus `t1`. Swap those two names and you get
`FFFFFFEE` in the panel instead of `00000012`. Both are the same distance, 18, one of them written
as a negative number: the bits at the top turn on when a result goes below zero, and the lecture on
words, halves and bytes is where that pattern is taken apart.
