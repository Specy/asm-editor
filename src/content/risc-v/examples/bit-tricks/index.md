Four questions about one number, and not one of them is answered with arithmetic. Is 182 odd, what
is it times eight, what are its bottom four bits, and how many of its 32 bits are ones. Treating a
register as 32 separate bits instead of as a number is usually the cheaper way to ask.

```riscv|playground|allow-open
.text
main:
    li t0, 182          # 10110110 in binary

    andi t1, t0, 1      # 1 when the number is odd

    slli t2, t0, 3      # three places left is eight times

    andi t3, t0, 0xF    # the bottom four bits on their own

    li t4, 0            # how many ones we have counted
    mv t5, t0           # a copy to take apart
    li t6, 32           # 32 bits to look at
count:
    andi s0, t5, 1      # the lowest bit
    add t4, t4, s0      # add it, since it is already 0 or 1
    srli t5, t5, 1      # and bring the next one down
    addi t6, t6, -1
    bnez t6, count

    li s1, 32           # the leading zeroes, counted by hand
    mv s2, t0
lead:
    beqz s2, lead_done
    srli s2, s2, 1
    addi s1, s1, -1
    j lead
lead_done:
```

`andi` keeps a bit wherever the mask has a 1 and clears it everywhere else. With a mask of 1 that
leaves the lowest bit of the number, which is 0 for an even number and 1 for an odd one, and it
arrives as a value in a register rather than as something you have to go and look up somewhere else.

Shifting left by three multiplies by eight, because every place a bit moves left doubles what it is
worth. The shift amount is five bits wide, so 0 to 31, and `slli` has it written into the
instruction where `sll` takes it from a register, for when the program works out how far to shift
while it runs.

`andi t3, t0, 0xF` keeps the bottom four bits, which is the general way a field is pulled out of a
packed value: mask off what you want, then shift it down to the bottom if it was not already there.

There is a limit on that mask. The constant in an `andi` is 12 bits and it is sign extended, so it
goes from -2048 to 2047 and no further. `andi t0, t0, -256` is fine and clears the low byte, since
-256 spread out to 32 bits is `FFFFFF00`. `andi t0, t0, 0xFF00` will not build: `operand is out of
range`. A mask that wide goes through an `li` into a register first, and then a plain `and`.

The counting loop is where a first reader usually loses the thread, so here is `t5` at the top of
each pass, with the bit that `andi` is about to look at marked:

| pass | `t5`          | lowest bit | `t4` after |
| ---- | ------------- | ---------- | ---------- |
| 1    | `...10110110` | 0          | 0          |
| 2    | `...1011011`  | 1          | 1          |
| 3    | `...101101`   | 1          | 2          |
| 4    | `...10110`    | 0          | 2          |
| 5    | `...1011`     | 1          | 3          |
| 6    | `...101`      | 1          | 4          |
| 7    | `...10`       | 0          | 4          |
| 8    | `...1`        | 1          | 5          |

After the eighth pass `t5` is zero and the remaining 24 passes add nothing. `srli` is the shift that
brings zeroes in at the top, which is what you want when the register is a row of bits. Its partner
`srai` copies the sign bit down instead, and that is the one that halves a signed number correctly.

The second loop counts the leading zeroes, the run of 0 bits above the highest 1, by shifting until
the register is empty and subtracting from 32. There is a RISC-V extension that does it in a single
instruction, **Zbb**, and this simulator does not have it, so the base instructions do the job in a
loop.
