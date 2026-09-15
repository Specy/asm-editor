There are only 32 registers, and a real program has more values than that to keep track of. The ones
that do not fit live in memory, and this program is the smallest thing that works that way: two
numbers put into memory by the assembler before the program starts, read out, added up, and the
total written back.

```riscv|playground|memory|allow-open
.eqv TAX, 20

.data
price:    .word 250
shipping: .word 35
total:    .space 4

.text
main:
    la t0, price        # the address of price
    lw t1, 0(t0)        # the number stored there
    lw t2, 4(t0)        # shipping, one word further on
    add t1, t1, t2      # add the two
    addi t1, t1, TAX    # and the tax on top
    sw t1, 8(t0)        # write the answer back into memory
```

Six instructions, and two of them exist only to carry values across the boundary between memory and
registers. `add` reads registers and writes a register, and that is all it can do. Anything sitting
in memory has to come in through a `lw` and go back out through a `sw`.

The three words sit at `0x10010000`, where `.data` puts the first label. Type `10010000` in the
memory panel's address box:

| label      | address      | before        | after         |
| ---------- | ------------ | ------------- | ------------- |
| `price`    | `0x10010000` | `FA 00 00 00` | unchanged     |
| `shipping` | `0x10010004` | `23 00 00 00` | unchanged     |
| `total`    | `0x10010008` | `00 00 00 00` | `31 01 00 00` |

`.word` writes a value into memory. `.space 4` only sets four bytes aside, which is why `total` is
all zeroes before anything runs.

The bytes come out backwards from how you would read the number: 250 is `0x000000FA` and the panel
shows `FA 00 00 00`. That is little endian, the lowest byte of a word at the lowest address. The
**W** button in the panel's header groups the bytes into words again and shows them the way round
you wrote them.

`TAX` and `price` are both names, and they do not behave alike. `TAX` was declared with `.eqv`, so
the assembler puts the number 20 into the instruction itself and nothing goes near memory. `price`
is a label on a piece of data, so it stands for an address, and getting at the value there takes a
load.

That `la t0, price` happens once, and every access after it counts from the register it left behind:
`0(t0)`, `4(t0)` and `8(t0)` are the three words. You can write `lw t1, price` instead and the
assembler will accept it, but it costs two instructions every time it runs, one to build the address
and one to do the load. Storing to a label is stranger still: `sw t1, total, t2` needs a third
operand naming a register to build the address in, because a store has no spare room to do it
anywhere else.
