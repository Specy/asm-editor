Two numbers are written into memory by the assembler and a third one is written into an instruction.
The program reads the two out of memory, adds the third, and writes the total back into memory,
which is where you read the answer.

There are only 32 registers. Anything a program has more of than that lives in memory, and `.word`
is what puts it there before the first instruction runs.

```mips|playground|memory|allow-open
.eqv TAX 20

.data
price:    .word 250
shipping: .word 35
total:    .space 4

.text
main:
    la $t0, price       # p = &price
    lw $t1, 0($t0)      # total = price
    lw $t2, 4($t0)      # shipping, one word further on
    add $t1, $t1, $t2   # total = total + shipping
    addi $t1, $t1, TAX  # total = total + TAX
    sw $t1, 8($t0)      # write the answer back into memory
```

Count the loads and stores and you have the shape of every MIPS program that works on data. `add`
reads registers and only registers, so a number in memory arrives through a `lw` before it can be
touched, and the answer goes back out through a `sw` at the end. Two of the six instructions here
are pure transport.

The three words sit at `0x10010000`, where `.data` puts the first label. Type `10010000` in the
memory panel's address box:

| label      | address      | before        | after         |
| ---------- | ------------ | ------------- | ------------- |
| `price`    | `0x10010000` | `FA 00 00 00` | unchanged     |
| `shipping` | `0x10010004` | `23 00 00 00` | unchanged     |
| `total`    | `0x10010008` | `00 00 00 00` | `31 01 00 00` |

`.word` writes a value into memory before the program starts. `.space 4` only reserves four bytes
and writes nothing, which is why `total` is all zeroes before the run and holds 305 after it: every
bit of that answer was put there by the `sw` on the last line.

The bytes come out backwards from how you would read the number, because MIPS is little endian and
the lowest byte of a word goes at the lowest address. `250` is `0x000000FA` and the panel shows
`FA 00 00 00`. The **W** button in the panel's header groups the bytes into words and shows them the
way round you wrote them.

`la $t0, price` is done once and every access after it is an offset from that one register:
`0($t0)`, `4($t0)` and `8($t0)` are the three words. Writing `lw $t1, price` works too and costs two
instructions and `$at` every time it runs, which is why a pointer in a register is what a program
reaches for.

Change `price: .word 250` to `price: .word 500` and the total becomes 555, with not one instruction
altered. The `.data` section is not part of the program's logic at all; it is four bytes the
assembler writes at `0x10010000` before your first instruction runs.
