A number picks which of four pieces of code runs. `t2` holds 2, the program reads the third address
out of a table in memory and jumps to it, and the multiplication is what happens. Changing `t2`
changes the answer without changing a comparison anywhere.

The bigger of two numbers chose between two paths with a `blt`. A chain of those works for three or
four cases and gets slower with every one you add, since a value at the bottom of the chain is
compared against everything above it first. A table is looked up once whatever the value is.

```riscv|playground|allow-open
.data
table: .word add_op, sub_op, mul_op, div_op

.text
main:
    li t0, 6                # a = 6
    li t1, 3                # b = 3
    li t2, 2                # op = 2, the third entry of the table

    la t3, table            # the base of the table
    slli t4, t2, 2          # op * 4, the size of an address
    add t4, t3, t4
    lw t5, 0(t4)            # the address stored there
    jr t5                   # and go to it

add_op:
    add t6, t0, t1          # a + b
    j done
sub_op:
    sub t6, t0, t1          # a - b
    j done
mul_op:
    mul t6, t0, t1          # a * b
    j done
div_op:
    div t6, t0, t1          # a / b
done:
```

`.word add_op, sub_op, mul_op, div_op` writes four words, and each one is the address the assembler
gave that label. Put the memory panel on `10010000` and they read `00400024`, `0040002C`, `00400034`
and `0040003C`, which are four addresses inside your own code. A label is nothing but an address, and
this is what that sentence is for.

The three instructions before the `jr` are the lookup: scale the index by the size of an entry with
a shift, add it to the base of the table, read the word that is there. What comes back is an
address, and `jr t5` jumps to it. That is the same instruction a subroutine returns with: `ret` is
`jalr zero, ra, 0` and `jr t5` is `jalr zero, t5, 0`, a jump whose destination is in a register and
whose return address is thrown away. Write `jalr t5` instead and these stop being four branches and
become four calls, because that form keeps the return address in `ra`.

Each arm ends with `j done` for the same reason the two halves of a choice do: the arms are laid out
one after another in memory, and nothing stops a program running out of one and into the next.

Put 0, 1 or 3 into `t2` instead and a different arm runs. Nothing else in the program changes, and
there is no comparison anywhere in it that could be changed: the value itself did the choosing.
