This program sorts the eight words in `numbers` from smallest to largest, in the same memory
locations. One pass compares adjacent pairs from left to right. When the left value is greater than
the right value, it swaps them, so the largest remaining value reaches the end. Eight elements need
seven passes.

```riscv|playground|memory|allow-open
.eqv COUNT, 8

.data
numbers: .word 42, 8, 15, 4, 23, 16, 99, 1

.text
main:
    li t0, COUNT
    addi t0, t0, -1         # outer passes remaining: COUNT - 1
outer:
    la t1, numbers          # start this pass at the first pair
    mv t2, t0               # pair comparisons in this pass
inner:
    lw t3, 0(t1)            # left value
    lw t4, 4(t1)            # right value
    bge t4, t3, in_order    # signed right >= left: no swap
    sw t4, 0(t1)
    sw t3, 4(t1)
in_order:
    addi t1, t1, 4          # move to the next overlapping pair
    addi t2, t2, -1
    bnez t2, inner
    addi t0, t0, -1
    bnez t0, outer
```

## One complete pass

During the first pass, `t0` is 7 because seven outer passes remain. Copying it into `t2` gives the
inner loop its separate job: count the seven adjacent pairs in this pass. `t1` advances by four
bytes each time, so the pairs overlap. The right word in one comparison becomes the left word in
the next.

| `t2` before comparison | pair offsets from `numbers` | values loaded into `t3`, `t4` | swap? | array after the comparison |
| ---: | :---: | :---: | :---: | --- |
| 7 | 0, 4 | 42, 8 | yes | 8, 42, 15, 4, 23, 16, 99, 1 |
| 6 | 4, 8 | 42, 15 | yes | 8, 15, 42, 4, 23, 16, 99, 1 |
| 5 | 8, 12 | 42, 4 | yes | 8, 15, 4, 42, 23, 16, 99, 1 |
| 4 | 12, 16 | 42, 23 | yes | 8, 15, 4, 23, 42, 16, 99, 1 |
| 3 | 16, 20 | 42, 16 | yes | 8, 15, 4, 23, 16, 42, 99, 1 |
| 2 | 20, 24 | 42, 99 | no | 8, 15, 4, 23, 16, 42, 99, 1 |
| 1 | 24, 28 | 99, 1 | yes | 8, 15, 4, 23, 16, 42, 1, 99 |

The final comparison puts 99 in the last word. That word is now settled, so the next pass needs
only six comparisons. Then the remaining passes need 5, 4, 3, 2, and 1. Altogether the program
makes `7 + 6 + 5 + 4 + 3 + 2 + 1 = 28` pair comparisons.

## The two loop states

`t0` counts outer passes still to run. At the start of each pass, its current value also happens to
be the number of unsettled adjacent pairs, so `mv t2, t0` gives that number to the inner loop.
From then on the counters have distinct roles: `t2` falls to zero once per comparison, while `t0`
stays unchanged until the whole pass finishes.

Both setup instructions belong inside `outer`. After the final comparison, `t1` points at the last
word, so it must return to the first pair. `t2` has reached zero and must receive the smaller count
for the new pass.
If the program merely decremented that zero and continued, it would wrap to -1 and keep looping for
a very long time.

`0(t1)` and `4(t1)` address two adjacent words. Both loads happen before either store, so a swap can
write the old right value on the left and the old left value on the right. The branch uses a
**signed** comparison, so negative words sort before positive words. To sort in descending signed
order, reverse only the operands of that branch:

```riscv
    bge t3, t4, in_order    # signed left >= right: no swap
```

The Playground's assembler does not accept `COUNT-1` as the immediate in `li t0, COUNT-1`.
Loading `COUNT` and subtracting one at run time expresses the same starting count in syntax this
Playground accepts; it is a limitation of this assembler's accepted syntax, not a rule of the
RISC-V instruction set.

Run the program with the memory panel at `10010000`. The words finish as
`1, 4, 8, 15, 16, 23, 42, 99`.

## Your turn: build the two loops

Complete the ascending signed sort. First make the inner loop perform one pass: load an adjacent
pair, leave it alone when it is already in order, otherwise swap it, then advance the pointer and
decrement `t2`. Next finish the outer loop: after each pass, decrement `t0` and begin another pass
when any remain.

The array includes a negative value and a duplicate. Sort only its six words. The word at `after`
is a sentinel and must remain unchanged.

```riscv|playground|memory|exercise
.eqv COUNT, 6

.data
numbers: .word 5, -2, 5, 0, -9, 3
after:   .word 0x13579bdf

.text
main:
    li t0, COUNT
    addi t0, t0, -1         # outer passes remaining
outer:
    la t1, numbers           # reset the pair pointer
    mv t2, t0                # comparisons in this pass
inner:
    # Load the adjacent words at 0(t1) and 4(t1).
    # If they are in ascending signed order, branch to in_order.
    # Otherwise store them in the opposite locations.
in_order:
    # Advance t1, decrement t2, and repeat the inner loop if needed.
    # Decrement t0, and repeat the outer loop if needed.
```

```testcase
{
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x10010000", "bytes": 4,
          "expected": [-9, -2, 0, 3, 5, 5, 324508639] }
    ]
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.eqv COUNT, 6

.data
numbers: .word 5, -2, 5, 0, -9, 3
after:   .word 0x13579bdf

.text
main:
    li t0, COUNT
    addi t0, t0, -1
outer:
    la t1, numbers
    mv t2, t0
inner:
    lw t3, 0(t1)
    lw t4, 4(t1)
    bge t4, t3, in_order
    sw t4, 0(t1)
    sw t3, 4(t1)
in_order:
    addi t1, t1, 4
    addi t2, t2, -1
    bnez t2, inner
    addi t0, t0, -1
    bnez t0, outer
```

</details>
