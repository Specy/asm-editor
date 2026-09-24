The array contains twelve numbers in ascending order. This program finds the index of 91 by
repeatedly cutting the possible range in half. It leaves the index in `t4`, or -1 if the target is
absent.

The range includes both ends: `low` and `high` are possible indices. The idea that keeps the search
correct is:

> Each time execution reaches `search`, if the target is in the array, it is somewhere from
> `numbers[low]` through `numbers[high]`.

Ascending order justifies both ways of shrinking that range:

| comparison at `mid`     | what ascending order tells us                     | new possible range |
| ----------------------- | ------------------------------------------------- | ------------------ |
| `numbers[mid] < target` | every element through `mid` is also too small     | `low = mid + 1`    |
| `numbers[mid] > target` | every element from `mid` onward is also too large | `high = mid - 1`   |

Here are the register roles. `t6` is scratch space: it holds the byte offset, then the address, and
finally the value loaded from that address.

| register | role                                       |
| -------- | ------------------------------------------ |
| `t0`     | base address of `numbers`                  |
| `t1`     | target value                               |
| `t2`     | `low`, the first possible index            |
| `t3`     | `high`, the last possible index            |
| `t4`     | answer, initially -1                       |
| `t5`     | `mid`, the index being inspected           |
| `t6`     | scratch space for accessing `numbers[mid]` |

```riscv|playground|memory|allow-open
.eqv COUNT, 12

.data
numbers: .word 2, 5, 8, 12, 16, 23, 38, 56, 72, 91, 100, 127

.text
main:
    la t0, numbers          # base address of the array
    li t1, 91               # target
    li t2, 0                # low = 0
    li t3, COUNT
    addi t3, t3, -1         # high = COUNT - 1
    li t4, -1               # answer = -1, meaning absent
search:
    bgt t2, t3, search_done # while (low <= high)
    add t5, t2, t3
    srli t5, t5, 1          # mid = (low + high) / 2
    slli t6, t5, 2          # byte offset = mid * 4
    add t6, t0, t6          # address of numbers[mid]
    lw t6, 0(t6)            # value = numbers[mid]
    beq t6, t1, found
    bgt t6, t1, too_big
    addi t2, t5, 1          # value < target: low = mid + 1
    j search
too_big:
    addi t3, t5, -1         # value > target: high = mid - 1
    j search
found:
    mv t4, t5               # answer = mid
search_done:
```

At the start, `low` is 0 and `high` is `COUNT - 1`, so both name valid array indices. The loop body
runs only while `low <= high`. In this twelve-element program, their sum is nonnegative and small,
so shifting it right by one computes `(low + high) / 2`, rounded down. That result is a valid index
inside the current range.

Every element access uses `slli` to multiply `mid` by the four-byte size of each `.word` element,
adds the array's base address, and then uses `lw` to read the element. The `lw` writes over the
address in `t6` because the program no longer needs that address.

Here is the range closing on the answer. Each row corresponds to one trip through the loop body:

| probe | `low` | `high` | `mid` | `numbers[mid]` | branch result             |
| ----- | ----- | ------ | ----- | -------------- | ------------------------- |
| 1     | 0     | 11     | 5     | 23             | `23 < 91`, so `low = 6`   |
| 2     | 6     | 11     | 8     | 72             | `72 < 91`, so `low = 9`   |
| 3     | 9     | 11     | 10    | 100            | `100 > 91`, so `high = 9` |
| 4     | 9     | 9      | 9     | 91             | equal, so `t4 = 9`        |

This search reads four elements. A left-to-right search for this particular target would read ten,
because 91 is at index 9. More generally, binary search needs at most 10 midpoint probes for 1,000
sorted elements and at most 20 for 1,000,000.

To see the failure result, change `li t1, 91` to `li t1, 90` and run the program again. The possible
range eventually becomes empty: `low` is greater than `high`, so execution reaches `search_done`.
No instruction has replaced the initial -1 in `t4`. In a 32-bit register, the simulator displays
that value as `0xFFFFFFFF`, the all-one bit pattern for -1. Zero cannot serve as the failure marker
because index 0 belongs to the first array element.

## Exercise

Start from the working program and make these small tests:

1. Change the target to 2 and predict the final value of `t4`. Run it and check your prediction.
2. Repeat with 127, the last element, and then with 90, which is absent.
3. Add `.word 90` immediately after the twelve array values, but leave `COUNT` as 12. Search for 90
   again. It is a sentinel just beyond the array, so a correct search must still leave -1 in `t4`.
4. Before running the 90 search, make a table with columns for `low`, `high`, `mid`, and
   `numbers[mid]`. Fill one row for every probe, then compare it with a step-by-step run.
5. Finally, hide the two bound-update lines, `addi t2, t5, 1` and `addi t3, t5, -1`, with comments.
   Restore them from the rule: a middle value that is too small moves `low`; one that is too large
   moves `high`.
