Eight words sit in memory and the program walks them once. `t1` holds the largest value seen so
far, while `t2` holds its index: 0 for the first word, 1 for the second, and so on.

```riscv|playground|memory|allow-open
.eqv COUNT, 8

.data
numbers: .word 12, -4, 37, 8, 99, 41, 2, 60

.text
main:
    la t0, numbers      # the array
    lw t1, 0(t0)        # best so far = the first element
    li t2, 0            # index of the best element
    li t3, 1            # start looking at element 1
    li t6, COUNT        # number of elements
loop:
    slli t4, t3, 2      # byte offset = index * 4
    add t4, t0, t4      # address of element t3
    lw t5, 0(t4)        # current element
    ble t5, t1, not_bigger
    mv t1, t5           # a new best value
    mv t2, t3           # and its index
not_bigger:
    addi t3, t3, 1
    blt t3, t6, loop
```

The first word supplies the initial answer, so the loop only has to inspect indexes 1 through 7.
This pattern requires an array with **at least one element**: an empty array has no first word to
load and no natural maximum to return. Code that accepts empty arrays needs a separate policy, such
as reporting an error or returning a result chosen by the caller.

At the start of each pass, `t1` and `t2` describe the best element among all the earlier indexes.
`ble t5, t1, not_bigger` branches when the current element in `t5` is **less than or equal to** the
best value in `t1`, so the two assignments are skipped. `ble` is a signed pseudo-instruction; here
the assembler can express it as `bge t1, t5, not_bigger`. Because equal values are skipped, this
version keeps the index of the **first** occurrence of the maximum.

On the final pass, `t3` is 7, so the program reads the last word, 60. It then increments `t3` to 8.
The branch `blt t3, t6, loop` asks whether 8 is less than 8; it is not, so the program finishes
without reading an index 8. The result is 99 in `t1` and its index, 4, in `t2`.

An index is useful here because it can be saved directly as the reported position. To load the word
at that position, the program turns the index into a byte address:

| `t3` | byte offset after `slli t4, t3, 2` | address after `add t4, t0, t4` |
| ---- | ---------------------------------- | ------------------------------ |
| 1    | 4                                  | `10010004`                     |
| 2    | 8                                  | `10010008`                     |
| 3    | 12                                 | `1001000C`                     |

Each element in this array is a four-byte word. Shifting its index left by two multiplies it by
four, producing the byte offset for this word array. `li t6, COUNT` is above the loop because the
bound does not change; loading it once avoids repeating that setup on every pass.

The comparison must match the meaning of the data. `ble` uses signed ordering, so it treats `-4`
as smaller than the positive values. In a 32-bit register, the same bit pattern can be displayed as
signed `-4` or hexadecimal `0xFFFFFFFC`. If an unsigned branch such as `bleu` compares that
pattern, it interprets it as 4294967292 and would choose it over every positive value in this array.
The bits never changed. Only the instruction looking at them did.

## Your turn: find the value and its first index

Complete the program for the six-word, nonempty array below. Leave the largest signed value in `t1`
and its zero-based index in `t2`. If the maximum occurs more than once, keep its **first** index.
The word at `after` is a sentinel, not part of the array; a correct loop must not read it.

```riscv|playground|exercise
.eqv COUNT, 6

.data
numbers: .word -11, 42, 7, 42, -3, 19
after:   .word 1000       # not part of numbers

.text
main:
    # initialize the best value and index from element 0
    # inspect elements 1 through COUNT - 1
```

```testcase
{
    "expectedRegisters": { "t1": 42, "t2": 1, "t3": 6 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.eqv COUNT, 6

.data
numbers: .word -11, 42, 7, 42, -3, 19
after:   .word 1000

.text
main:
    la t0, numbers
    lw t1, 0(t0)
    li t2, 0
    li t3, 1
    li t6, COUNT
loop:
    slli t4, t3, 2
    add t4, t0, t4
    lw t5, 0(t4)
    ble t5, t1, not_bigger
    mv t1, t5
    mv t2, t3
not_bigger:
    addi t3, t3, 1
    blt t3, t6, loop
```

</details>
