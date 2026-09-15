A number picks which of four pieces of code runs. `$t2` holds 2, the program reads the third address
out of a table in memory and jumps to it, and the multiplication is what happens. Changing `$t2`
changes the answer without changing a comparison anywhere.

A chain of comparisons works for three or four cases and gets slower with every case you add, since
a value at the bottom of the chain is compared against everything above it first. A table is looked
up once whatever the value is.

```mips|playground|allow-open
.data
table: .word add_op, sub_op, mul_op, div_op

.text
main:
    li $t0, 6               # a = 6
    li $t1, 3               # b = 3
    li $t2, 2               # op = 2, the third entry of the table

    la $t3, table           # the base of the table
    sll $t4, $t2, 2         # op * 4, the size of an address
    add $t4, $t3, $t4
    lw $t5, 0($t4)          # the address stored there
    jr $t5                  # and go to it

add_op:
    add $t6, $t0, $t1       # a + b
    j done
sub_op:
    sub $t6, $t0, $t1       # a - b
    j done
mul_op:
    mul $t6, $t0, $t1       # a * b
    j done
div_op:
    div $t6, $t0, $t1       # a / b
done:
```

`.word add_op, sub_op, mul_op, div_op` writes four words, and each one is the address the assembler
gave that label. Put the memory panel on `10010000` and they read `00400024`, `0040002C`, `00400034`
and `0040003C`, which are four addresses inside your own code. A label is nothing but an address,
and this is what that sentence is for.

The three instructions before the `jr` are an ordinary array lookup: shift the index to turn it
into a byte offset, add the base, and load the word there. It is the same arithmetic as reading any
other array; the only difference is what is in the array. What comes out is an address, and `jr`
jumps to it.

`jr` is the very same instruction that returns from a subroutine, because `jr $ra` is also a jump to
an address held in a register. Use `jalr $t5` instead and each arm becomes a **call**, since `jalr`
writes `$ra` on the way through, and each arm would then need a `jr $ra` to come back.

`$t5` ends holding `00400034`, the address of `mul_op`, which the program worked out from the number
2 and never had written down anywhere. Each arm ends with `j done` for the same reason the two
halves of an `if` do: they are laid out one after another and nothing stops the program running into
the next one.

`div $t6, $t0, $t1` with three operands is the pseudo-instruction, so it is four real instructions:
a `bne` and a `break` that check the divisor, then the real `div` and an `mflo`. The other three
arms are one instruction each.

Change `li $t2, 2` to `0`, `1` or `3` and the answer becomes 9, 3 or 2. What does not change is the
number of instructions on the way there, and there is no comparison anywhere in the program to
adjust: a table is looked up once whichever entry you wanted, which is the whole reason to build
one.
