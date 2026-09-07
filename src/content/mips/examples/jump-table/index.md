A number picks which of four pieces of code runs. `$t2` holds 2, the program reads the third address
out of a table in memory and jumps to it, and the multiplication is what happens. Changing `$t2`
changes the answer without changing a comparison anywhere.

The bigger of two numbers chose between two paths with an `slt` and a branch. A chain of those works
for three or four cases and gets slower with every one you add, since a value at the bottom of the
chain is compared against everything above it first. A table is looked up once whatever the value
is.

**You need to know:** the "Branch on compare" lecture and the "Loads, stores and immediates"
lecture. What is new here is a jump to an address the program worked out, `jr $t5` goes to whatever
`$t5` holds, which nothing in the source names.

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

The three instructions before the `jr` are C's `table[op]`: multiply the index by the size of an
element with a shift, add it to the base, and read the word there. What comes out is an address, and
`jr` is the same instruction that returns from a subroutine, since `jr $ra` is also a jump to an
address held in a register. `jalr $t5` would make this four calls instead of a `switch`, because it
would write `$ra` on the way.

`$t6` comes out at `00000012`, which is 18, and `$t5` at `00400034`, the address of `mul_op`. Each
arm ends with `j done` for the same reason the two halves of an `if` do: the arms are laid out one
after another and nothing stops the program running into the next one.

`div $t6, $t0, $t1` with three operands is the pseudo-instruction, so it is four real instructions:
a `bne` and a `break` that check the divisor, then the real `div` and an `mflo`. The other three
arms are one instruction each.

Try changing `li $t2, 2` to `li $t2, 3` and `$t6` comes out at 2, which is 6 divided by 3. With `0`
it comes out at 9 and with `1` at 3. Nothing else in the program moves, and there is no comparison
anywhere in it to change.
