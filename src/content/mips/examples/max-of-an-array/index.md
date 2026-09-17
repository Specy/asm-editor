This program makes one pass over an array and keeps two results: the largest signed value seen so
far in `$t1`, and its zero-based index in `$t2`. The array contains a negative value so that the
choice between signed and unsigned comparison has a visible effect.

`COUNT` must equal the number of values declared by `.word`. The program copies it into `$t4`
because a branch compares registers. A count of zero has no first element to load, so the program
returns the documented sentinel pair **maximum 0, index -1**.

```mips|playground|memory|tests|allow-open
.eqv COUNT 8

.data
numbers: .word 12, -4, 37, 8, 99, 41, 2, 60

.text
main:
    li $t4, COUNT           # number of elements
    la $t0, numbers         # base address of the array
    addu $t3, $zero, $zero # next index; also 0 for an empty array
    beq $t4, $zero, empty  # do not load an element when COUNT is 0

    lw $t1, 0($t0)         # first element is the initial maximum
    addu $t2, $zero, $zero # its index is 0
    addiu $t3, $zero, 1    # continue at index 1

check_index:
    beq $t3, $t4, exit     # stop before forming or loading numbers[COUNT]
    sll $t5, $t3, 2        # byte offset = index * 4
    addu $t5, $t0, $t5     # address of numbers[index]
    lw $t6, 0($t5)

    slt $t7, $t1, $t6      # 1 exactly when maximum < current, signed
    beq $t7, $zero, next
    addu $t1, $t6, $zero   # save the new maximum
    addu $t2, $t3, $zero   # save its index

next:
    addiu $t3, $t3, 1
    beq $zero, $zero, check_index

empty:
    addu $t1, $zero, $zero # sentinel maximum: 0
    addiu $t2, $zero, -1   # sentinel index: -1

exit:
    li $v0, 10             # exit
    syscall
```

```testcase
{
    "expectedRegisters": {
        "$t1": 99,
        "$t2": 4,
        "$t3": 8,
        "$t4": 8,
        "$v0": 10
    }
}
```

The first element seeds the result. Starting the maximum at zero would give the wrong answer for an
all-negative array. After that first load, `$t3` is 1. The check at `check_index` therefore makes a
one-element array exit immediately, without trying to read index 1. On every later pass the same
check happens before the address calculation and load. When the loop finishes, `$t3` equals `$t4`.

The update uses a strict comparison: `slt $t7, $t1, $t6` produces 1 only when the current element is
larger than the saved maximum. An equal value does not replace the result, so ties keep the first
maximum's index.

This version walks by **index** because the required result index is then directly available in
`$t3`. A pointer plus a counter would work too. Here `sll` turns the index into a byte offset, `addu`
combines that offset with the base address, and `addiu` advances the index without signed-overflow
traps.

`slt` treats both operands as signed 32-bit integers. If the comparison is changed to
`sltu $t7, $t1, $t6`, the bits for `-4` are interpreted as the unsigned value 4294967292
(`0xFFFFFFFC`). The program then reports that value at index 1. Both instructions compare the same
bits; the final `u` changes their meaning.

Try these replacements for `COUNT` and `numbers`, predicting the five checked registers before each
run. Keep `COUNT` equal to the number of values after `.word`. Every case should end with
`$t3 == $t4 == COUNT` and `$v0 == 10`.

- **All negative:** `COUNT` 4 and `numbers: .word -8, -3, -14, -6` should finish with maximum `-3`
  at index `1`.
- **Duplicate maximum:** `COUNT` 5 and `numbers: .word 7, 22, 4, 22, 9` should keep index `1`, the
  first `22`.
- **Singleton:** `COUNT` 1 and `numbers: .word -11` should finish with maximum `-11`, index `0`, and
  `$t3 == $t4 == 1`.
- **Empty:** set `COUNT` to 0 and leave only the label `numbers:` with no `.word` values. The sentinel
  result is maximum `0`, index `-1`, with `$t3 == $t4 == 0`.
