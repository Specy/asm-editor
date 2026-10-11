This array-filling loop tracks three things: the address for the next word, the next value to
write, and how many writes remain. Each has its own register. On each pass, the program stores one
word, then moves all three values forward.

```mips|playground|memory|allow-open
.eqv COUNT 10

.data
numbers: .space 40      # room for ten 4-byte words

.text
.globl main
main:
    la $t0, numbers     # address for the next store
    li $t1, 1           # next value to store
    li $t2, COUNT       # stores remaining

    beq $t2, $zero, done

fill:
    sw $t1, 0($t0)
    addi $t0, $t0, 4
    addi $t1, $t1, 1
    addi $t2, $t2, -1
    bne $t2, $zero, fill

done:
    li $v0, 10
    syscall
```

The `beq` above `fill` skips the store when `COUNT` is zero. Otherwise `sw` writes the current
`$t1` at the address in `$t0`. The next three instructions advance the address by four bytes,
increase the value by one, and reduce the remaining count by one. At the bottom, `bne` returns to
`fill` while that count is not zero. This countdown pattern requires `COUNT >= 0` (zero or
positive): a negative count keeps storing past the buffer instead of stopping after a valid number
of writes.

Here are the first two passes. Each row shows the store and the state _after_ the updates:

| Store made | `$t0`: next address | `$t1`: next value | `$t2`: remaining |
| ---------- | ------------------- | ----------------- | ---------------- |
| 1          | `numbers + 4`       | 2                 | 9                |
| 2          | `numbers + 8`       | 3                 | 8                |

Open the memory panel, enter `10010000` in its address box, select **W** for word-sized values,
then select **Build** and **Run**. In this Playground, `numbers` is the first item in the data
area, so it starts at `0x10010000`. The ten words should contain 1 through 10. The register panel
shows hexadecimal by default: `$t0` ends at `10010028`, `$t1` at `0000000B` (11), and `$t2` at
`00000000`. `$t0` points one word past the last store because it always holds the _next_ address.

Ten stores, four bytes apart, need `10 * 4 = 40` bytes; that is the space reserved for `numbers`.
If you increase `COUNT`, reserve at least `4 * COUNT` bytes as well. `.space` reserves bytes but
does not initialize their values. Do not rely on it to fill an array with zero, even though this
Playground currently displays newly reserved memory as zero.

## Check it

Now fill a shorter buffer yourself. The starting registers are ready: `$t0` points to `buffer`,
`$t1` holds 3, and `$t2` holds 4. Add a guard that branches to `done` when `$t2` is zero. At
`fill`, store `$t1`, move `$t0` forward four bytes, add 3 to `$t1`, subtract 1 from `$t2`, and
branch back while `$t2` is not zero. Before pressing **Test**, predict the four words and final
`$t0`. **Test** runs the program from its initial state each time, so a previous run cannot leave
old values in the buffer.

```mips|playground|memory|exercise|allow-open
.eqv COUNT 4

.data
buffer: .space 16

.text
.globl main
main:
    la $t0, buffer
    li $t1, 3
    li $t2, COUNT

    # Branch to done if no stores remain.

fill:
    # Store, advance the address and value, reduce the count, then repeat if needed.

done:
    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": "0x10010010", "$t1": 15, "$t2": 0, "$v0": 10 },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x10010000",
            "bytes": 4,
            "expected": [3, 6, 9, 12]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.eqv COUNT 4

.data
buffer: .space 16

.text
.globl main
main:
    la $t0, buffer
    li $t1, 3
    li $t2, COUNT

    beq $t2, $zero, done

fill:
    sw $t1, 0($t0)
    addi $t0, $t0, 4
    addi $t1, $t1, 3
    addi $t2, $t2, -1
    bne $t2, $zero, fill

done:
    li $v0, 10
    syscall
```

</details>

To see the zero-count path, select **Open in editor** on the _first_ program above. Change its
`COUNT` to 0, select **Build**, then use **Step**. The `beq` jumps directly to `done`; no `sw`
runs. `$t0` remains `10010000`, `$t1` remains `00000001`, and `$t2` remains `00000000`.
This separate copy lets you try the edge case without changing the exercise's expected results.
