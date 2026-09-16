A counting loop needs three pieces of state: where the next result goes, what value to write, and
how many writes remain. This example keeps those jobs in separate registers while it fills ten
words with the values 1 through 10.

```mips|playground|memory|allow-open
.eqv COUNT 10

.data
numbers: .space 40      # room for ten 4-byte words

.text
.globl main
main:
    la $t0, numbers     # pointer: address for the next store
    li $t1, 1           # value: next number to store
    li $t2, COUNT       # count: number of stores remaining

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

The top guard handles the case where `COUNT` is zero: execution jumps to `done` before the first
store. For any nonnegative count, the loop body then runs exactly that many times. The branch at
the bottom uses `$t2`, the remaining count, to decide whether another pass is needed. `bne` is the
architectural instruction: it compares `$t2` with `$zero`. Some assemblers also accept the shorthand
`bnez` with the operands `$t2, fill` for the same comparison.

The three loop registers change independently:

- `$t0` is the pointer. Each store uses the address currently in `$t0`, then `addi` advances it by
  4 bytes because one word occupies 4 bytes.
- `$t1` is the value. It starts at 1 and increases after each store.
- `$t2` is the remaining count. It starts at `COUNT` and decreases toward zero.

The allocated size and the pointer stride set the loop's safe bounds together. Ten stores spaced 4
bytes apart require `10 * 4 = 40` bytes, exactly the room reserved by `.space 40`. A stride of 8
would leave gaps and eventually store past this buffer. A count larger than 10 would also run past
it unless the reserved space grew to at least `4 * COUNT` bytes.

`.space 40` only reserves bytes; the directive does not initialize them. The Playground loader
shows newly reserved memory as zero, which makes each store easy to see in the memory panel. In the
Playground's default data layout, `numbers` is the first data item and therefore begins at
`0x10010000`. After the run, the ten words from `0x10010000` through `0x10010024` contain 1 through 10.

Notice that `$t0` finishes at `0x10010028`, one word past the address of the final stored element.
That is the next-store address, not the address of the last value. `$t1` finishes at 11 and `$t2`
finishes at 0. Each final register value follows directly from its one job in the loop.

## Check it

Run this completed shorter version and press **Test**. It fills four words with the progression 3,
6, 9, 12; the test checks the memory, the one-past-the-end pointer, the zero remaining count, and
the normal exit service.

```mips|playground|memory
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

```testcase
{
    "expectedRegisters": { "$t0": "0x10010010", "$t2": 0, "$v0": 10 },
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

Then make the zero-count case visible: change `COUNT` to 0. In the Test, change `$t0`'s expected
value to `0x10010000` and the expected memory values to `[0, 0, 0, 0]`. The test should still pass.
The pointer stays at the buffer's first address and all four displayed words stay unchanged because
the guard reaches `done` without executing `fill`.
