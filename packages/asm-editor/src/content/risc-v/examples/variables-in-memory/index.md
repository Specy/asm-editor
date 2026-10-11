There are only 32 registers, and a real program has more values than that to keep track of. The ones
that do not fit can live in memory. This program starts with two numbers that the assembler puts in
memory, loads them into registers, adds them, and stores the total in a third four-byte slot.

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

There are six source instruction lines. Three carry values across the boundary between memory and
registers: two `lw` lines and one `sw` line. `add` reads registers and writes a register, and that is
all it can do. Anything sitting in memory has to come in through a load and go back out through a
store. `la` is a pseudo-instruction, so the assembler may turn that one source line into more than
one machine instruction when it builds the program.

The three four-byte slots begin at `0x10010000`, where `.data` puts the first label. `price` and
`shipping` are words written by `.word`; `total` is space reserved for the word the program will
store. Type `10010000` in the memory panel's address box:

| label      | address      | before        | after         |
| ---------- | ------------ | ------------- | ------------- |
| `price`    | `0x10010000` | `FA 00 00 00` | unchanged     |
| `shipping` | `0x10010004` | `23 00 00 00` | unchanged     |
| `total`    | `0x10010008` | `00 00 00 00` | `31 01 00 00` |

`.word` writes a value into memory. `.space 4` sets four bytes aside without giving them a value.
This editor initializes its data memory to zero, so the reserved bytes at `total` appear as zeroes
before the program runs. Reserving space does not by itself promise zero-filled bytes on every
system.

The bytes come out backwards from how you would read the number: 250 is `0x000000FA` and the panel
shows `FA 00 00 00`. That is little endian, the lowest byte of a word at the lowest address. The
**W** button in the panel's header groups the bytes into words again and shows them the way round
you wrote them.

`TAX` and `price` are both names, and they do not behave alike. `TAX` was declared with `.eqv`, so
the assembler puts the number 20 into the instruction itself and nothing goes near memory. `price`
is a label on a piece of data, so it stands for an address, and getting at the value there takes a
load.

That `la t0, price` happens once, and every access after it counts from the address in `t0`:
`0(t0)` selects `price`, `4(t0)` selects `shipping`, and `8(t0)` selects `total`. Each offset is a
multiple of four, so each word access is aligned.

## Try it

Change `shipping` from 35 to 50 and change `TAX` from 20 to 10. Then add this line immediately after
the `sw`:

```riscv
    lw t3, 8(t0)        # read the stored total back
```

Before running the program, predict the final values of `t1` and `t3`, and the four bytes at
`total`. Then run it and compare the registers and memory with your prediction.

<details>
<summary>Show answer</summary>

Both `t1` and `t3` should contain 310, because `250 + 50 + 10 = 310`. In hexadecimal, 310 is
`0x00000136`, so little-endian memory at `total` should contain `36 01 00 00`.

</details>
