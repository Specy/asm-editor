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

There are six source instruction lines. Three transfer values between memory and registers:
two `lw` lines load values and one `sw` line stores a value. `add` reads registers and writes a
register. To add values stored in memory, the program must load them into registers first, then
store the result back in memory. `la` is a pseudo-instruction, so the assembler may turn that one source line into more than
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

The panel shows bytes in address order: 250 is `0x000000FA`, and the panel shows `FA 00 00 00`.
This is little-endian byte order: the least significant byte of a word is stored at the lowest
address.

`TAX` is an assembler constant declared with `.eqv`. The assembler puts its value, 20, into the
`addi` instruction itself, so the program does not need to load it from memory. `price` is a data
label: it stands for an address, and the program must load the value stored at that address.

`la t0, price` loads the address once. Each load and store after it uses an offset from `t0`:
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
