The first four arguments to a subroutine go in `$a0`–`$a3` in this course. What happens when there
are more? This program passes a fifth and sixth argument on the stack. `sum_of_squares` ignores the
first four and returns the sum of the squares of the last two: 3² + 4² = 25.

The routine also calls `square` twice. Its first result must survive the second call, and its
incoming `$ra` must survive both calls. It keeps those values in a stack frame. The `$a`, `$t`, and
`$v` registers are caller-saved, so a caller cannot leave a needed value in one of them across a
call without saving it.

```mips|playground|memory|tests|allow-open
.text
.globl main

main:
    li $a0, 0                 # first four arguments are unused here
    li $a1, 0
    li $a2, 0
    li $a3, 0
    addi $sp, $sp, -8         # room for arguments five and six
    li $t0, 3
    sw $t0, 0($sp)            # fifth argument
    li $t0, 4
    sw $t0, 4($sp)            # sixth argument
    jal sum_of_squares
    addi $sp, $sp, 8          # caller releases its argument slots
    move $s1, $v0             # keep the answer before using $v0 for exit
    li $v0, 10
    syscall

# sum_of_squares(a, b, c, d, e, f): returns e*e + f*f in $v0
sum_of_squares:
    addi $sp, $sp, -12        # local, saved $fp, saved $ra
    sw $ra, 8($sp)
    sw $fp, 4($sp)
    addi $fp, $sp, 12         # points to the caller's fifth argument
    lw $a0, 0($fp)            # e
    jal square
    sw $v0, 0($sp)            # keep e*e across the next call
    lw $a0, 4($fp)            # f
    jal square
    lw $t0, 0($sp)
    add $v0, $v0, $t0         # e*e + f*f
    lw $ra, 8($sp)
    lw $fp, 4($sp)
    addi $sp, $sp, 12
    jr $ra

# square(x): x in $a0; result in $v0; restores the $s0 it borrows
square:
    addi $sp, $sp, -4
    sw $s0, 0($sp)
    move $s0, $a0
    mul $v0, $s0, $s0
    lw $s0, 0($sp)
    addi $sp, $sp, 4
    jr $ra
```

```testcase
{
    "expectedRegisters": {
        "$s1": 25,
        "$sp": "0x7FFFEFFC",
        "$v0": 10
    }
}
```

Follow `$sp` through the call. The addresses below use the Playground's initial `$sp` of
`0x7FFFEFFC`; the offsets explain the same layout for any starting address.

| Moment                          | `$sp`        | `$fp`        | Where are the stack arguments? |
| ------------------------------- | ------------ | ------------ | ------------------------------ |
| Before `main` reserves slots    | `0x7FFFEFFC` | not yet used | no slots reserved              |
| At `jal sum_of_squares`         | `0x7FFFEFF4` | not yet used | `0($sp)` and `4($sp)`          |
| After the 12-byte frame is made | `0x7FFFEFE8` | `0x7FFFEFF4` | `0($fp)` and `4($fp)`          |

The frame takes three words. `0($sp)` is a local for the first square; `4($sp)` holds the old
`$fp`, and `8($sp)` holds the return address into `main`. The saved `$ra` matters because each
inner `jal square` replaces `$ra`. `$fp` is a saved register too: this routine changes it, so it
must restore the caller's value before returning. Setting `$fp` to the entry value of `$sp` gives
the two stack arguments stable offsets while the routine uses its own frame.

Step until just after `sw $v0, 0($sp)` and predict which word holds 9. Then look at the frame in the
Memory panel, starting at `7FFFEFE8`:

| Address      | Access in `sum_of_squares` | Contents at that point           |
| ------------ | -------------------------- | -------------------------------- |
| `0x7FFFEFE8` | `0($sp)`                   | local: 9, the first square       |
| `0x7FFFEFEC` | `4($sp)`                   | saved old `$fp`                  |
| `0x7FFFEFF0` | `8($sp)`                   | saved return address into `main` |
| `0x7FFFEFF4` | `0($fp)`                   | fifth argument: 3                |
| `0x7FFFEFF8` | `4($fp)`                   | sixth argument: 4                |

While `square` runs, it briefly reserves one more word below this frame to save `$s0`. It restores
`$s0` and `$sp` before returning. That is the callee-saved promise for `$s0`; the hardware does not
do it for us. After the second call, `sum_of_squares` loads its local 9 and adds it to 16 from
`square`.

The prologue allocates space for every slot, then saves the incoming values the routine must
restore. The local needs a slot, but it has no old value to save. The epilogue loads `$ra` and
`$fp` before releasing the 12 bytes. Back in `main`, the caller releases its own 8 bytes, so
`$sp` returns to `0x7FFFEFFC`. At the exit syscall, `$s1` holds 25 and `$v0` holds the exit
service number, 10. Old stack contents may still be visible in memory after their slots are
released; moving `$sp` does not erase them.

Try changing the two stack arguments to 5 and 2. Before running, predict the two argument words,
the local after the first call, and the final `$s1`. The answer should be 29. Select **Build**, then
**Run** for the changed values; the embedded **Test** checks the original 3 and 4.

Finally, restore 3 and 4, then change only `addi $sp, $sp, 8` in `main` to
`addi $sp, $sp, 4`. Select **Build**, then **Run**. The arithmetic still gives 25, but `$sp`
finishes at `0x7FFFEFF8`: the caller has left one word reserved. In repeated calls, such a
mismatch moves `$sp` farther from its starting address each time. Restore the 8-byte cleanup when
you are done.
