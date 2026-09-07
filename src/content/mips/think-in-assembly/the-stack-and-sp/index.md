The stack lecture of Assembly basics pushed by hand, moving a stack pointer and then writing at it.
That is what MIPS does, because MIPS has no push instruction and no pop instruction: `$sp` is one of
the 32 ordinary registers, and everything about the stack is a convention plus two instructions you
already know.

## A push is a subtraction and a store

`$sp` starts at `0x7FFFEFFC`, near the top of the address space, and the stack **grows downwards**.
So:

- a **push** is `addi $sp, $sp, -4` and then `sw` at `0($sp)`,
- a **pop** is `lw` from `0($sp)` and then `addi $sp, $sp, 4`.

The 4 is the size of what you are putting there, and it has to keep `$sp` a multiple of 4, because a
`sw` at an address that is not ends the run.

```mips|playground|memory
.text
main:
    li $t0, 0x11111111
    li $t1, 0x22222222
    addi $sp, $sp, -4       # make room
    sw $t0, 0($sp)          # push $t0
    addi $sp, $sp, -4
    sw $t1, 0($sp)          # push $t1
    lw $t2, 0($sp)          # pop into $t2
    addi $sp, $sp, 4
    lw $t3, 0($sp)          # pop into $t3
    addi $sp, $sp, 4
```

Step through it and watch `$sp` in the registers panel. Before the first push the stack is empty and
`$sp` holds `7FFFEFFC` (🟢 is the stack pointer, and untouched memory on this machine reads zero):

|      address |    value    |
| -----------: | :---------: |
| `0x7FFFEFF4` |  00000000   |
| `0x7FFFEFF8` |  00000000   |
| `0x7FFFEFFC` | 🟢 00000000 |

The `addi` drops `$sp` to `0x7FFFEFF8` and the `sw` writes there:

|      address |    value    |
| -----------: | :---------: |
| `0x7FFFEFF4` |  00000000   |
| `0x7FFFEFF8` | 🟢 11111111 |
| `0x7FFFEFFC` |  00000000   |

The second pair drops it another 4 and writes underneath:

|      address |    value    |
| -----------: | :---------: |
| `0x7FFFEFF4` | 🟢 22222222 |
| `0x7FFFEFF8` |  11111111   |
| `0x7FFFEFFC` |  00000000   |

Then the two pops read them back in the other order, so `$t2` gets `22222222` and `$t3` gets
`11111111`, and `$sp` climbs back to `7FFFEFFC`. Last in, first out, and both values are still in
memory afterwards: popping moves the pointer and erases nothing.

Type `7FFFEFF0` in the memory panel's address box after running and both words are still there. The
**Stack** tab of the memory panel is already looking at that region.

## One adjustment, several stores

Nothing says a push has to be one word. Move `$sp` once by as much as you need and reach the room
with different offsets, which costs one instruction instead of one per value.

```mips|playground|memory
.text
main:
    li $s0, 1
    li $s1, 2
    li $s2, 3
    addi $sp, $sp, -12      # one adjustment for three registers
    sw $s0, 0($sp)
    sw $s1, 4($sp)
    sw $s2, 8($sp)
    li $s0, 0xFF            # now destroy all three
    li $s1, 0xFF
    li $s2, 0xFF
    lw $s0, 0($sp)          # and take them back
    lw $s1, 4($sp)
    lw $s2, 8($sp)
    addi $sp, $sp, 12
```

All three registers end at the values they started with. While they are saved, `$sp` is at
`0x7FFFEFF0` and the stack holds:

|      address |    value    | reached as | register |
| -----------: | :---------: | ---------- | -------- |
| `0x7FFFEFF0` | 🟢 00000001 | `0($sp)`   | `$s0`    |
| `0x7FFFEFF4` |  00000002   | `4($sp)`   | `$s1`    |
| `0x7FFFEFF8` |  00000003   | `8($sp)`   | `$s2`    |

The offsets are yours to choose and the only rule is that the same one is used to save and to
restore. This is exactly what a subroutine does on entry and exit, and "jal, jr and the calling
convention" writes that out.

## Room of your own

The other use of the stack is space. `addi $sp, $sp, -16` takes sixteen bytes, which you then reach
as `0($sp)`, `4($sp)`, `8($sp)` and `12($sp)`, and `addi $sp, $sp, 16` gives them back. Nothing
allocates it and nothing checks it: the stack is memory, and `$sp` is the only record of which part
of it is yours.

```mips|playground|memory
.text
main:
    addi $sp, $sp, -16      # a local array of four words
    li $t1, 0               # i = 0
fill:
    sll $t2, $t1, 2         # i * 4
    add $t2, $sp, $t2       # &local[i]
    addi $t3, $t1, 10       # the value to write
    sw $t3, 0($t2)          # local[i] = 10 + i
    addi $t1, $t1, 1
    blt $t1, 4, fill
    lw $t4, 0($sp)          # local[0]
    lw $t5, 12($sp)         # local[3]
    addi $sp, $sp, 16       # and give the room back
```

`$t4` comes out at 10 and `$t5` at 13. While the loop is running the four words are at `0x7FFFEFEC`
to `0x7FFFEFF8`, and after the last `addi` they are still there and no longer yours: the next thing
that takes room gets the same addresses and writes over them.

That is what "the stack is memory and the pointer is the only record" means in practice. Reading
below `$sp` reads whatever the code that used that room before you left behind.

## Give every byte back

A subroutine that moves `$sp` and does not move it back leaves the caller's stack pointer somewhere
else, and every offset the caller had into the stack is wrong from then on. Worse, the return address
of a call is on the stack too, which the next lecture is about, so a mismatched adjustment makes a
`jr $ra` jump to a number that was never an address.

The rule is one line: **whatever a piece of code subtracts from `$sp`, it adds back before it hands
control on**. Write the two `addi` instructions at the same time, before you fill in what goes
between them.

There is nothing to stop you breaking it. `$sp` is register `$29` and `add $sp, $sp, $t0` assembles
as happily as any other addition. The Stack tab of the memory panel and the `$sp` row of the
registers panel are how you check.

## Your turn

The test starts `$t0` at `0x11111111` and `$t1` at `0x22222222`, and wants them exchanged. Do it
through the stack, without a third register.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": "0x11111111", "$t1": "0x22222222" },
    "expectedRegisters": { "$t0": "0x22222222", "$t1": "0x11111111" }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    addi $sp, $sp, -4
    sw $t0, 0($sp)      # push the old $t0
    move $t0, $t1       # $t0 = $t1
    lw $t1, 0($sp)      # $t1 = the old $t0
    addi $sp, $sp, 4
```

</details>

The second one starts `$s0`, `$s1` and `$s2` at 1, 2 and 3, and the three `li` lines in the middle
are not yours to change. Save the three registers before them and put them back afterwards, moving
`$sp` once each way.

```mips|playground|exercise
.text
main:
    # save $s0, $s1 and $s2 here

    li $s0, 0xFF
    li $s1, 0xFF
    li $s2, 0xFF

    # and bring them back here
```

```testcase
{
    "startingRegisters": { "$s0": 1, "$s1": 2, "$s2": 3 },
    "expectedRegisters": { "$s0": 1, "$s1": 2, "$s2": 3 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    addi $sp, $sp, -12      # room for three words
    sw $s0, 0($sp)
    sw $s1, 4($sp)
    sw $s2, 8($sp)

    li $s0, 0xFF
    li $s1, 0xFF
    li $s2, 0xFF

    lw $s0, 0($sp)
    lw $s1, 4($sp)
    lw $s2, 8($sp)
    addi $sp, $sp, 12       # and the room given back
```

</details>
