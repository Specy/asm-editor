This program makes one pass over an array and keeps two results: the largest signed value in `$t1`
and its zero-based index in `$t2`. The array contains a negative value, which will also let us see
what changes when a comparison treats the same bits as unsigned.

`COUNT` must equal the number of values declared by `.word`. The program trusts these declarations;
it cannot count the values for itself. It copies `COUNT` into `$t4` because a branch compares
registers. An empty array has no largest element, so this example chooses **maximum 0, index -1**
as its empty-array result.

| Register              | Role                                               |
| --------------------- | -------------------------------------------------- |
| `$t0`                 | Base address of `numbers`                          |
| `$t1` / `$t2`         | Saved maximum / its index                          |
| `$t3` / `$t4`         | Next index / element count                         |
| `$t5` / `$t6` / `$t7` | Current address / current word / comparison result |

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

The first element seeds the result: `$t1` becomes 12 and `$t2` becomes 0. This also works for an
all-negative array, where starting the maximum at zero would give the wrong answer. Before the first
loop check, `$t3` changes from 0 to 1. A one-element array exits at that check without trying to
read index 1. On every later pass, the check happens before the address calculation and load. When
the loop finishes, `$t3` equals `$t4`.

Here are the first two passes through `check_index`. In this Playground layout, `numbers` begins at
`0x10010000`, and each word takes four bytes.

1. With `$t3` at **1**, `sll` makes the byte offset **4**, so `$t5` becomes `numbers + 4`, or
   `0x10010004`: the address of the second word. The load gives `$t6 = -4`. Since `-4` is not larger
   than 12, `$t1` and `$t2` stay at **12, 0**.
2. With `$t3` at **2**, the byte offset is **8**, so `$t5` becomes `numbers + 8`, or `0x10010008`.
   The load gives `$t6 = 37`. This is larger than 12, so `$t1` and `$t2` become **37, 2**.

The update uses a strict comparison: `slt $t7, $t1, $t6` produces 1 only when the current element is
larger than the saved maximum. An equal value does not replace the result, so ties keep the first
maximum's index.

Because this example also keeps the index, it walks by **index**. A pointer plus a counter would
work too. Here `sll` turns the index into a byte offset, `addu` combines that offset with the base
address, and `addiu` advances the index without signed-overflow traps.

`slt` treats both operands as signed 32-bit integers. If the comparison is changed to
`sltu $t7, $t1, $t6`, `$t1` ends with the same bits as `-4`. Interpreted unsigned, that result is
4294967292 (`0xFFFFFFFC`), at index 1. Both instructions compare the same bits; the final `u`
changes their meaning.

Try these replacements for `COUNT` and `numbers`, predicting the five checked registers before each
run. Use **Run** to inspect each edited case; the embedded **Test** expects the original array.
Keep `COUNT` equal to the number of values after `.word`. Every case should end with
`$t3 == $t4 == COUNT` and `$v0 == 10`.

- **All negative:** `COUNT` 4 and `numbers: .word -8, -3, -14, -6` should finish with maximum `-3`
  at index `1`.
- **Duplicate maximum:** `COUNT` 5 and `numbers: .word 7, 22, 4, 22, 9` should keep index `1`, the
  first `22`.
- **Singleton:** `COUNT` 1 and `numbers: .word -11` should finish with maximum `-11`, index `0`, and
  `$t3 == $t4 == 1`.
- **Empty:** set `COUNT` to 0 and replace the data declarations with:

    ```mips
    .data
    numbers:
    ```

    The chosen empty-array result is maximum `0`, index `-1`, with `$t3 == $t4 == 0`.
