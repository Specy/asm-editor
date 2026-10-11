The stack is a region of ordinary memory used for temporary values. MIPS names register `$29`
`$sp`, short for **stack pointer**, because programs use it to remember the current top of that
region. `$sp` is still an ordinary register: instructions can read or change it just like any other
general-purpose register.

In this editor, `$sp` starts at `0x7FFFEFFC`. That initial value is part of the editor's setup, not a
value that every MIPS program can assume. Stack space is reserved at lower addresses, so the stack
**grows downward** as values are added.

This page uses **word-sized slots**. One word is 4 bytes, so reserving one slot subtracts 4 from
`$sp`. Addresses used by `lw` and `sw` must be word-aligned: divisible by 4. Starting from
`0x7FFFEFFC` and moving in steps of 4 keeps every slot aligned.

## Reserve, store, retrieve, release

MIPS has no `push` or `pop` instruction. The program builds those operations from instructions you
already know:

- **Push a word:** reserve a slot with `addi $sp, $sp, -4`, then store with `sw`.
- **Retrieve and pop a word:** load it with `lw`, then release the slot with
  `addi $sp, $sp, 4`.
- **Discard and pop a word:** if the value is no longer needed, release the slot with
  `addi $sp, $sp, 4` alone.

The order matters. A push reserves the slot before writing it. A retrieve-pop reads the value before
releasing its slot.

```mips|playground|memory
.text
main:
    li $t0, 0x11111111
    li $t1, 0x22222222

    addi $sp, $sp, -4       # reserve one word
    sw $t0, 0($sp)          # push $t0
    addi $sp, $sp, -4       # reserve another word
    sw $t1, 0($sp)          # push $t1

    lw $t2, 0($sp)          # retrieve the last word pushed
    addi $sp, $sp, 4        # release its slot
    lw $t3, 0($sp)          # retrieve the first word pushed
    addi $sp, $sp, 4        # release its slot

    li $v0, 10
    syscall
```

Here is the address trace. While the stack holds values, the newest one is at `0($sp)`:

| after this action       | `$sp`        | value at `0x7FFFEFF4` | value at `0x7FFFEFF8` |
| ----------------------- | ------------ | --------------------- | --------------------- |
| editor setup            | `0x7FFFEFFC` | `00000000`            | `00000000`            |
| push `$t0`              | `0x7FFFEFF8` | `00000000`            | `11111111`            |
| push `$t1`              | `0x7FFFEFF4` | `22222222`            | `11111111`            |
| retrieve-pop into `$t2` | `0x7FFFEFF8` | `22222222`            | `11111111`            |
| retrieve-pop into `$t3` | `0x7FFFEFFC` | `22222222`            | `11111111`            |

The last value pushed is the first one retrieved: `$t2` gets `0x22222222`, then `$t3` gets
`0x11111111`. This order is called **last in, first out**, or **LIFO**.

Releasing a slot only moves `$sp`; it does not erase memory. That is why both stored values remain
visible in the last row. The zeroes shown in untouched memory are also editor behavior: this editor
initializes that memory to zero. A program must not rely on memory it has never written containing
zero, or any other particular value.

## Reserve several slots together

Several word slots can share one adjustment. Reserving 12 bytes creates three 4-byte slots reached
as `0($sp)`, `4($sp)`, and `8($sp)`:

```mips|playground|memory
.text
main:
    li $s0, 1
    li $s1, 2
    li $s2, 3

    addi $sp, $sp, -12      # reserve three word-sized slots
    sw $s0, 0($sp)
    sw $s1, 4($sp)
    sw $s2, 8($sp)

    li $s0, 0xFF            # change the registers
    li $s1, 0xFF
    li $s2, 0xFF

    lw $s0, 0($sp)          # restore from the same three slots
    lw $s1, 4($sp)
    lw $s2, 8($sp)
    addi $sp, $sp, 12       # release exactly the 12 bytes reserved

    li $v0, 10
    syscall
```

The three offsets are aligned, distinct, and inside the reserved 12-byte block. Offset 0 names its
first word, offset 4 its second, and offset 8 its third. Each load uses the same offset as the store
whose value it restores.

The `$s0`, `$s1`, and `$s2` names do not give these registers special hardware behavior. The
processor does not save or restore them automatically. “jal, jr and the calling convention”
explains the convention attached to their names.

## Use stack slots as local space

Stack slots can also hold temporary values that do not need to stay in registers. This example
reserves two direct-offset slots, uses them, and releases them:

```mips|playground|memory
.text
main:
    addi $sp, $sp, -8       # reserve two word-sized local slots
    li $t0, 7
    sw $t0, 0($sp)          # first local value
    li $t0, 3
    sw $t0, 4($sp)          # second local value

    lw $t1, 0($sp)
    lw $t2, 4($sp)
    add $t3, $t1, $t2       # $t3 = 10
    addi $sp, $sp, 8        # release exactly the 8 bytes reserved

    li $v0, 10
    syscall
```

While the block is reserved, `0($sp)` and `4($sp)` belong to this code. After adding 8 back, those
addresses are available for reuse. Their old bits can remain there, but the program no longer owns
those slots.

## Restore the stack pointer exactly

Every piece of code that subtracts from `$sp` must add back the same total before it finishes using
the stack. Reserving 12 bytes and releasing only 8 leaves `$sp` one word too low. Code that expects
the old stack position would then use the wrong addresses.

A function call does not place a return address on the stack automatically. `jal` writes the return
address into `$ra`; only an explicit store saves `$ra` on the stack. Regardless of what values a
program stores, the balance rule stays the same: release exactly the number of bytes reserved.

Because `$sp` is ordinary register `$29`, the processor does not enforce this rule. Watch `$sp` in
the registers panel and check that it returns to its starting value.

## One to try

The test starts `$t0` at `0x11111111`, `$t1` at `0x22222222`, and `$sp` at the editor's usual stack
address. Swap `$t0` and `$t1` through the stack without using a third register. Finish with `$sp`
restored to its starting value. The stop sequence is already present.

```mips|playground|exercise
.text
main:
    # your code here

    li $v0, 10
    syscall
```

```testcase
{
    "startingRegisters": {
        "$t0": "0x11111111",
        "$t1": "0x22222222",
        "$sp": "0x7FFFEFFC"
    },
    "expectedRegisters": {
        "$t0": "0x22222222",
        "$t1": "0x11111111",
        "$sp": "0x7FFFEFFC",
        "$v0": 10
    }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    addi $sp, $sp, -4
    sw $t0, 0($sp)          # push the old $t0
    addi $sp, $sp, -4
    sw $t1, 0($sp)          # push the old $t1

    lw $t0, 0($sp)          # retrieve the old $t1
    addi $sp, $sp, 4
    lw $t1, 0($sp)          # retrieve the old $t0
    addi $sp, $sp, 4

    li $v0, 10
    syscall
```

</details>
