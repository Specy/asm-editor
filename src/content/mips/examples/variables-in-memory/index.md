Two numbers are written into memory by the assembler and a third one is written into an instruction.
The program reads the two out of memory, adds the third, and writes the total back into memory,
which is where you read the answer.

Moving values around kept everything in registers, and there are only 32 of those. Anything a
program has more of than that goes in memory, and `.word` is what puts it there before the first
instruction runs.

**You need to know:** the ".data, .text and directives" lecture and the "Memory, little endian and
alignment" lecture. What is new here is the difference between a name that is a number and a name
that is an address, `TAX` is replaced by 20 inside the instruction while `price` becomes
`0x10010000` and the program goes to memory for what is there.

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

Six instructions where the M68K needs four, and the two extra ones are the whole of what a
load/store architecture means. `add.l shipping, d0` on the M68K adds the long at a label straight
into a register; here `add` only reads registers, so anything in memory arrives through a `lw` first
and goes back through a `sw` at the end.

The three words sit at `0x10010000`, where `.data` puts the first label. Type `10010000` in the
memory panel's address box:

| label      | address      | before        | after         |
| ---------- | ------------ | ------------- | ------------- |
| `price`    | `0x10010000` | `FA 00 00 00` | unchanged     |
| `shipping` | `0x10010004` | `23 00 00 00` | unchanged     |
| `total`    | `0x10010008` | `00 00 00 00` | `31 01 00 00` |

`.word` writes a value, `.space 4` only reserves four bytes, which is why `total` reads as zeroes
before the program runs: unwritten memory reads 0 in this editor. After the run it holds
`0x00000131`, which is 305, and `$t1` holds the same number.

The bytes come out backwards from how you would read the number, because MIPS is little endian and
the lowest byte of a word goes at the lowest address. `250` is `0x000000FA` and the panel shows
`FA 00 00 00`. The **W** button in the panel's header groups the bytes into words and shows them the
way round you wrote them.

`la $t0, price` is done once and every access after it is an offset from that one register:
`0($t0)`, `4($t0)` and `8($t0)` are the three words. Writing `lw $t1, price` works too and costs two
instructions and `$at` every time it runs, which is why a pointer in a register is what a program
reaches for.

Try changing `price: .word 250` to `price: .word 500`. `total` comes out at `2B 02 00 00`, which is
555, and the only thing that changed is the four bytes the assembler writes at `0x10010000` before
your program starts.
