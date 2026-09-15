The stack on this machine is built out of parts you already have. `$sp` is register `$29`, an
ordinary register in every respect, and the stack itself is ordinary memory near the top of the
address space. There is no instruction named push and none named pop, and you will find you do not
miss them: a push is an `addi` and an `sw`, which is two instructions you can already write, and
being able to see both halves is what makes the rest of this page make sense.

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

Since a push is just "move the pointer, then write", you can move the pointer once for several
values and reach each of them with a different offset. Three registers saved this way cost one
`addi` and three `sw`, instead of three of each.

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
    li $t1, 0               # which word we are filling
fill:
    sll $t2, $t1, 2         # times 4, one word each
    add $t2, $sp, $t2       # the address of that word
    addi $t3, $t1, 10       # the value to write
    sw $t3, 0($t2)          # and store it there
    addi $t1, $t1, 1
    blt $t1, 4, fill
    lw $t4, 0($sp)          # the first word back
    lw $t5, 12($sp)         # and the last
    addi $sp, $sp, 16       # and give the room back
```

`$t4` is 10 and `$t5` is 13, the first and last words of the four the loop filled in. While that
loop runs, the four words live at `0x7FFFEFEC` to `0x7FFFEFF8`.

After the last `addi` they are still sitting in memory, unchanged, and they are no longer yours. The
next piece of code that takes room gets the same addresses and writes over them. So reading below
`$sp` is not an error and does not stop the program; it just hands you whatever the last user of
that room left behind, which is the most confusing kind of bug to chase.

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

## One to try

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
    move $t0, $t1       # the new $t0 over the top
    lw $t1, 0($sp)      # and the old one comes back into $t1
    addi $sp, $sp, 4
```

</details>
