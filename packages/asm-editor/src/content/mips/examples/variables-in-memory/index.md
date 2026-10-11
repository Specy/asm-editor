This program uses three adjacent four-byte slots in memory: `price` and `shipping` start with
values, and `total` holds the result. It loads the two inputs into registers, adds them and a named
constant, then stores the sum back in memory.

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

Follow the values through the program. `la` puts the address of `price` in `$t0`. The two `lw`
instructions load 250 into `$t1` and 35 into `$t2`; `add` and `addi` leave 305 in `$t1`. Finally,
`sw` stores that value at `total`. The arithmetic happens in registers, while the inputs and result
live in memory.

The three data labels mark consecutive four-byte slots. From the address in `$t0`, `0($t0)` reaches
`price`, `4($t0)` reaches `shipping`, and `8($t0)` reaches `total`. These offsets count bytes. Here
`price` and `shipping` are initialized with `.word`; `total` is four bytes reserved with `.space 4`.
The Playground loader happens to show newly reserved bytes as zero; `.space` itself only reserves
them. `.eqv TAX 20` gives the assembler a name for the number 20 and uses no memory. These lines
beginning with a dot tell the assembler how to prepare the program before it runs.

In the Playground's default layout, `price` begins at `0x10010000`. Type `10010000` in the memory
panel's address box and compare the three slots before and after running:

| Label      | Address      | Playground before run | After run     |
| ---------- | ------------ | --------------------- | ------------- |
| `price`    | `0x10010000` | `FA 00 00 00`         | unchanged     |
| `shipping` | `0x10010004` | `23 00 00 00`         | unchanged     |
| `total`    | `0x10010008` | `00 00 00 00`         | `31 01 00 00` |

The final value, 305, is `0x00000131` in hexadecimal. In the Playground's little-endian memory,
its least significant byte goes at the lowest address, so the byte view shows `31 01 00 00`.
Select **W** to group those bytes into a word and see the value in the usual order.

Now try a change that makes the offsets matter. Select **Open in editor** on the program above. Add
`discount: .word 15` between `shipping` and `total`. Then insert these instructions immediately
after `lw $t2, 4($t0)`:

```mips
    lw $t3, 8($t0)      # load discount
    sub $t1, $t1, $t3   # subtract discount from price
```

The new slot takes offset 8 and moves `total` to offset 12, so change the final store to
`sw $t1, 12($t0)`. Before running, predict the modified program's final `$t1` and the four bytes
at `total`. Then run it and check the register and memory panels. `$t1` should hold 290, and
`total` should show `22 01 00 00` in the byte view (`0x00000122`).
