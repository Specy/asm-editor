A **jump table** lets a number choose where a program continues. Here `$t2` holds an operation
number, and the table holds the addresses of four pieces of code. With `$t2 = 2`, the program
jumps to `mul_op` and leaves `18` in `$t6`.

| `$t2` | Table entry | Result for 6 and 3 |
| ----: | ----------- | -----------------: |
| 0     | `add_op`    | 9                  |
| 1     | `sub_op`    | 3                  |
| 2     | `mul_op`    | 18                 |
| 3     | `div_op`    | 2                  |

This version assumes `$t2` is between 0 and 3. If an operation number can come from outside the
program, check that it is in range before using it as a table index. An out-of-range load could
give `jr` an address that does not point to the intended code.

```mips|playground|memory|allow-open
.data
table: .word add_op, sub_op, mul_op, div_op

.text
main:
    li $t0, 6               # a = 6
    li $t1, 3               # b = 3
    li $t2, 2               # operation number

    la $t3, table           # address of the first table entry
    sll $t4, $t2, 2         # index * 4 bytes per word
    add $t4, $t3, $t4       # address of the chosen entry
    lw $t5, 0($t4)          # load the code address stored there
    jr $t5                  # jump to that address

add_op:
    add $t6, $t0, $t1
    j done
sub_op:
    sub $t6, $t0, $t1
    j done
mul_op:
    mul $t6, $t0, $t1
    j done
div_op:
    div $t6, $t0, $t1

done:
    li $v0, 10              # end the program
    syscall
```

`.word` stores one four-byte address for each code label in the table, even though the table is in
the data area and the labelled instructions are in the code area. The assembler turns each label
name into its code address. You do not need to know those numeric addresses to use them.

Follow the chosen index: `2` becomes the byte offset `8` when `sll` multiplies it by four.
Adding that offset to `table` reaches its third word, which contains the address of `mul_op`.
`lw` puts that address in `$t5`, and `jr $t5` jumps there. This is the same base-plus-offset
lookup used for an array of numbers; the loaded word happens to be an address. `jr` jumps to the
address in its register. The familiar `jr $ra` uses that same instruction to return from a
subroutine.

After `mul_op` calculates `6 * 3`, `j done` skips the other operations. The add and subtract
paths jump to `done` for the same reason. `div_op` is last, so it reaches `done` by continuing to
the next instruction. The exit syscall stops the program with the answer still in `$t6`.

Select **Build** and **Run**, then look at `$t6` in the register panel. It should show `18`
(`00000012` in hexadecimal). Change `li $t2, 2` to each other valid index—0, 1, and 3—and
predict `$t6` before selecting **Build**, then **Run** each time. Which table word does each index
load? The lookup follows the same steps for every valid index; only the loaded address and the
chosen operation change.
