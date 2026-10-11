Forty bytes of room are reserved in memory and a loop writes the numbers 1 to 10 into them, one word
per pass. The answer is in the memory panel: type `10010000` in its address box and the ten words
are there, `00000001` to `0000000A`.

```riscv|playground|memory|allow-open
.eqv COUNT, 10

.data
numbers: .space 40      # ten words, four bytes each

.text
main:
    la t0, numbers      # where to write next
    li t1, 1            # what to write
    li t2, COUNT        # how many still to go
fill:
    sw t1, 0(t0)        # write it
    addi t0, t0, 4      # step on to the next word
    addi t1, t1, 1      # next number
    addi t2, t2, -1     # one less to go
    bnez t2, fill
```

Three registers, three jobs, and keeping them apart is the whole trick of the program. `t0` is
**where**, `t1` is **what**, and `t2` is **how many are left**. Only `t2` decides when to stop. Here
are all three at the top of each pass:

| pass | `t0` (where) | `t1` (what) | `t2` (left) |
| ---- | ------------ | ----------- | ----------- |
| 1    | `10010000`   | 1           | 10          |
| 2    | `10010004`   | 2           | 9           |
| 3    | `10010008`   | 3           | 8           |
| ...  | ...          | ...         | ...         |
| 10   | `10010024`   | 10          | 1           |
| gone | `10010028`   | 11          | 0           |

The last row is the state the program stops in. `t0` and `t1` have both gone one step too far, which
is normal and harmless: nothing reads them again. `t2` reaching 0 is what let the `bnez` fall
through.

`sw t1, 0(t0)` writes the word to whatever address `t0` holds, so moving `t0` on by 4 is what turns
one instruction into ten different destinations. That 4 is the size of a word, and it is yours to
get right: the store itself has no idea how far apart the things you are storing should be. Put an
`8` there and the numbers land eight bytes apart, with an untouched zero between each pair, and the
last five spill past the forty bytes `.space` reserved.

Counting down rather than up is why the last line is a `bnez` and not a comparison. A branch here
looks at two registers, and `zero` is a register that is always available and always reads 0, so
"has this hit zero yet" is free. In this simple version, counting up to 10 would need the 10 loaded
into a fourth register for the branch to compare against.

## Try it

Change `COUNT` to 3 and change `.space 40` to `.space 12`, so there is still one word reserved for
each pass. Before running it, predict the three words at `10010000`, the final values of `t0`, `t1`,
and `t2`, and whether the branch is taken after the third store.

<details>
<summary>Show answer</summary>

The three words are `00000001`, `00000002`, and `00000003`. At the end, `t0` is `1001000C`, `t1` is
4, and `t2` is 0. The branch is not taken after the third store, because the decrement has made
`t2` zero.

</details>
