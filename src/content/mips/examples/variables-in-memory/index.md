This program starts with two values in memory, adds them and a constant, then stores the result in a
third memory slot. It is a small example of the path most data follows: memory to registers, work in
registers, then registers back to memory.

```mips|playground|memory|allow-open
.eqv TAX 20

.data
price:    .word 250
shipping: .word 35
total:    .space 4

.text
main:
    la $t0, price       # address of the first word
    lw $t1, 0($t0)      # load price
    lw $t2, 4($t0)      # load shipping
    add $t1, $t1, $t2   # price + shipping
    addi $t1, $t1, TAX  # add the constant
    sw $t1, 8($t0)      # store the result in total

    li $v0, 10          # exit
    syscall
```

The lines beginning with a dot are assembler directives, not instructions executed by the CPU.
They describe the program image and its layout, which the Playground loads before execution starts.
`.eqv TAX 20` gives the assembler a name for the number `20`; it does not allocate memory. Each
`.word` allocates four bytes and supplies their initial value. `.space 4` reserves four bytes for
`total`, but the directive does not specify what those bytes contain.

In the Playground's default layout, these three adjacent words form a 12-byte block beginning at
`0x10010000`. Those fixed addresses are a property of that default layout, not of MIPS itself. Type
`10010000` in the memory panel's address box and compare the block before and after running:

| label      | address      | before        | after         |
| ---------- | ------------ | ------------- | ------------- |
| `price`    | `0x10010000` | `FA 00 00 00` | unchanged     |
| `shipping` | `0x10010004` | `23 00 00 00` | unchanged     |
| `total`    | `0x10010008` | `00 00 00 00` | `31 01 00 00` |

The zero bytes shown for `total` before the run are what this Playground's loader supplies for the
reserved space. `.space` itself promises only the space. After the run, `total` is 305: `250 + 35 +
20`. The stored word is `0x00000131`, and the panel displays `31 01 00 00` because MIPS is little
endian: the least significant byte goes at the lowest address. The **W** button groups the bytes into
words and displays the value in the usual order.

`la` puts the address of `price` in `$t0` once. The three memory operands then use byte offsets from
that address: `0($t0)`, `4($t0)`, and `8($t0)`. Two `lw` operations move the inputs from memory into
registers, and one `sw` moves the result back to memory. Arithmetic instructions such as `add` work
only with register values.

`la` is a pseudo-instruction: convenient source-level shorthand that the assembler replaces with
machine instructions. How it expands can vary with the operand and address, so source lines and
emitted instructions are not always a one-to-one match.

Try one change that makes the layout matter. Add `discount: .word 15` between `shipping` and
`total`, then add these two instructions after the second `lw`:

```mips
    lw $t3, 8($t0)      # load discount
    sub $t1, $t1, $t3   # subtract it from the running total
```

Because the new word moves `total` four bytes farther, change the final store to `sw $t1, 12($t0)`.
Before running, predict both results. After running, `$t1` should be 290, and `total` should contain
`22 01 00 00` in the byte view (`0x00000122`).
