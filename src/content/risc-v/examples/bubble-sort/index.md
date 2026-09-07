Eight words in memory, sorted from smallest to largest where they lie. The loop compares each pair of
neighbours and swaps them when they are the wrong way round, and it does that as many times as there
are elements, so the largest number reaches the end on the first pass and the rest follow.

Every loop up to here read an array once. This one reads it seven times, with an inner loop that
walks the array and an outer loop that says how often, and the two counters have to be kept apart.

**You need to know:** the "Loops" lecture and the "Fill an array with the numbers from 1 to 10"
Example. What is new here is nesting: the inner counter is set **inside** the outer loop, because it
has to start again from the top on every pass.

```riscv|playground|memory|allow-open
.eqv COUNT, 8

.data
numbers: .word 42, 8, 15, 4, 23, 16, 99, 1

.text
main:
    li t0, COUNT
    addi t0, t0, -1         # the outer loop runs COUNT-1 times
outer:
    la t1, numbers          # back to the first element
    mv t2, t0               # the inner loop is one shorter every pass
inner:
    lw t3, 0(t1)            # left = numbers[i]
    lw t4, 4(t1)            # right = numbers[i + 1]
    bge t4, t3, in_order    # if(right >= left) leave them alone
    sw t4, 0(t1)            # otherwise swap them
    sw t3, 4(t1)
in_order:
    addi t1, t1, 4          # on to the next pair
    addi t2, t2, -1
    bnez t2, inner
    addi t0, t0, -1
    bnez t0, outer
```

`0(t1)` and `4(t1)` are the pair being compared, the element the pointer is on and the one four bytes
after it, which is the next word. Reading both without moving `t1` is what makes the swap two plain
`sw` instructions, and it is the whole of what `offset(base)` is for.

`bge t4, t3, in_order` is the comparison and the jump in one instruction, and the swap under it is
the `if` body. The M68K writes a `cmp.l` and a `ble` around the same three lines, and MIPS an `slt`
into a register and a `beqz` reading it back, since it has no branch that compares two registers for
less than.

`li t0, COUNT` and the `addi` under it are two lines because the assembler does no arithmetic:
`li t0, COUNT-1` is a build error here, where the M68K writes `#count-1` and lets the assembler work
it out. Anything computed from a named constant is computed by the program.

Both the `la t1, numbers` and the `mv t2, t0` belong inside the outer loop. `t1` has walked to the
end of the array by the time a pass finishes, so it goes back to the start; and `t2` is 0 by then,
which as a counter would take the `addi` to -1 and run the inner loop four billion times. Copying
`t0` into it is also what makes each pass shorter than the one before, since the last element is
already in its place after the first pass, the last two after the second, and so on.

Run it with the memory panel on `10010000` and the eight words read 1, 4, 8, 15, 16, 23, 42 and 99,
in that order. It took 236 instructions to sort eight numbers, and it would take about four times as
many to sort sixteen, because both loops grow with the array.

Try changing `bge t4, t3, in_order` to `bge t3, t4, in_order`. The same program sorts the other way
round, largest first, because the only thing that says which order you wanted is which of the two
registers comes first in that one comparison.
