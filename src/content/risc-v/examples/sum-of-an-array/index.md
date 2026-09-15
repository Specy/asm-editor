Six numbers are written into memory by the assembler, and the program adds them up and leaves the
total in `t2`. The loop has no counter in it at all: it stops when the pointer walking the array
arrives at the address just past the end.

```riscv|playground|memory|allow-open
.data
numbers: .word 4, 8, 15, 16, 23, 42
end:

.text
main:
    la t0, numbers      # the first element
    la t1, end          # one word past the last
    li t2, 0            # the running total
loop:
    lw t3, 0(t0)        # read the element t0 points at
    add t2, t2, t3
    addi t0, t0, 4      # step to the next word
    bne t0, t1, loop
```

`end:` is a label with nothing underneath it. A label is just a name for the address the assembler
had reached when it read the name, so `end` names the address the seventh word would have gone at.
Laid out, the data section looks like this:

```
10010000  4     <- numbers, and where t0 starts
10010004  8
10010008  15
1001000C  16
10010010  23
10010014  42
10010018        <- end, and where t0 finishes
```

`t0` takes exactly six steps of 4 and lands on `end` on the seventh test, which is when `bne` gives
up and the program stops. It lands exactly on it rather than overshooting, so comparing the two for
equality is safe.

The test being at the **bottom** of the loop is what makes this four instructions a pass instead of
five. A backwards `bne` does the work of a check at the top and a jump at the end together. It costs
you one thing: the body always runs once before anything is checked, so a loop written this way over
an empty array would read an element that is not there.

Add a seventh number to the `.word` line and nothing else in the program needs touching, because
`end` moves along with the array. That is the reason to walk to an end address instead of counting:
the count lives in one place, the data itself.
