Six numbers are written into memory by the assembler, and the program adds them up and leaves the
total in `$t2`. There is one loop, it runs a fixed number of times and there is no condition inside
it, so the thing to look at is how the program gets from one number to the next.

An array does not fit in the registers and its elements have no names of their own, so the program
keeps the address of the next element in a register and steps it forward as it goes.

```mips|playground|memory|allow-open
.data
numbers: .word 4, 8, 15, 16, 23, 42
end:

.text
main:
    la $t0, numbers     # where we are reading
    la $t1, end         # the address one past the last element
    li $t2, 0           # the running total
loop:
    lw $t3, 0($t0)      # the element under the pointer
    add $t2, $t2, $t3   # into the total
    addi $t0, $t0, 4    # step p to the next word
    bne $t0, $t1, loop  # until it reaches the end
```

The numbers are words, four bytes each, so `addi $t0, $t0, 4` is what moves the pointer on by one
element. That step is always an instruction of its own here, and the 4 in it is yours to get right:
a load addresses memory as `offset(base)` and does nothing else, so nothing in `lw` knows or cares
how big an element is.

`end:` is a label with nothing under it, so it holds the address the next thing would have gone at,
which is one past the array. `bne` between two pointers is exact here, since `$t0` lands on `end`
and not past it: they both finish at `10010018`, twenty four bytes past the start.

The six words sit at `0x10010000`, the first address of the data section. Step through the loop and
watch `$t0` grow by four at every pass until it meets `$t1`.

Now add a seventh number to the `.word` line, say `100`, and run it again. The total is right and
not one instruction changed, because `end:` moved along with the array. Written with a counter
instead, this program would have a `6` somewhere in it that has to be found and edited every time
the data changes, and one day it will not be.
