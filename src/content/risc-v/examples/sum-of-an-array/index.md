Six numbers are written into memory by the assembler, and the program adds them up and leaves the
total in `t2`. There is one loop, it runs a fixed number of times and there is no condition inside
it, so the thing to look at is how the program gets from one number to the next.

An array does not fit in the registers and its elements have no names of their own, so the program
keeps the address of the next element in a register and steps it forward as it goes.

**You need to know:** the "Loops" lecture and the "Arrays and strings" lecture. What is new here is
the label after the last element, `end:` is the address the array stops at, so the loop needs no
counter at all.

```riscv|playground|memory|allow-open
.data
numbers: .word 4, 8, 15, 16, 23, 42
end:

.text
main:
    la t0, numbers      # p = numbers
    la t1, end          # the address one past the last element
    li t2, 0            # sum = 0
loop:
    lw t3, 0(t0)        # *p
    add t2, t2, t3      # sum = sum + *p
    addi t0, t0, 4      # step p to the next word
    bne t0, t1, loop    # while(p != end)
```

The numbers are words, four bytes each, so `addi t0, t0, 4` is what moves the pointer on by one
element. The M68K writes the load and that step as one `add.w (a0)+, d0`, where the postincrement
mode steps the register by the size of what it read; a RISC-V load has one addressing mode and it is
`offset(base)`, so the step is an instruction of its own and the 4 in it is yours.

`end:` is a label with nothing under it, so it holds the address the next thing would have gone at,
which is one past the array. `bne` between two pointers is exact here, since `t0` lands on `end` and
not past it: they both finish at `10010018`, twenty four bytes past the start.

The six words sit at `0x10010000`, the first address of the data section. Step through the loop and
you can watch `t0` grow by four at every pass, and when the program stops `t2` holds `0000006C`,
which is 108.

The test is at the **bottom**, which is what makes this loop four instructions a pass instead of
five: a `bne` that jumps backwards does the job of a comparison at the top and a `j` at the end
together. It works here because the array has something in it, and a loop written this way over an
empty array would read one element before checking anything.

Try adding a seventh number to the `.word` line, say `100`. `t2` comes out at 208 and nothing else
in the program changes, because `end:` moved with the array. The M68K version of this program counts
with a `count equ 6` that has to be edited as well; an end pointer is what saves you that.
