Forty bytes of room are reserved in memory and a loop writes the numbers 1 to 10 into them, one word
per pass. The answer is in the memory panel: type `10010000` in its address box and the ten words
are there, `00000001` to `0000000A`.

```mips|playground|memory|allow-open
.eqv COUNT 10

.data
numbers: .space 40      # ten words, four bytes each

.text
main:
    la $t0, numbers     # p points at the first element
    li $t1, 1           # n = 1
    li $t2, COUNT       # ten of them to write
fill:
    sw $t1, 0($t0)      # write it where $t0 points
    addi $t0, $t0, 4    # step p on to the next word
    addi $t1, $t1, 1    # n++
    addi $t2, $t2, -1   # one less to go
    bnez $t2, fill
```

`.space 40` reserves forty bytes and writes nothing into them, so the memory panel is all zeroes
before the run. `la $t0, numbers` puts the address of the first byte in `$t0`, and from there the
loop never mentions the label again: every store is `0($t0)`, and moving `$t0` is what decides
where the next one lands.

The `4` in `addi $t0, $t0, 4` is the size of one element, and it is yours to get right: nothing in
`sw` knows how far apart the words you are writing should be. Write `8` there instead and the
numbers land eight bytes apart, with an untouched zero between each pair and the last five written
past the end of the room that was reserved for them.

Three registers do three different jobs here, and keeping them straight is most of what makes the
loop readable. `$t0` is where to write, `$t1` is what to write, and `$t2` is how many are left. Only
`$t2` is looked at by the branch, and only `$t2` decides when the loop ends.

Counting **down** to zero is why the branch is a `bnez` and not a comparison. `bnez` is a real
instruction that tests a register against `$zero`, where `blt $t2, COUNT, fill` would be a
pseudo-instruction costing an extra `slt` and `$at` on every pass.

Step through the loop and `$t0` climbs by 4 at every `addi`, from `10010000` to `10010028`, while
`$t2` walks down to 0, which is what ended it. `$t1` finishes at 11, one past the last number it
wrote.

Change `addi $t1, $t1, 1` to `addi $t1, $t1, 2` and the array fills with 1, 3, 5 and the rest of
the odd numbers up to 19, while the loop still runs exactly ten times. That is the clearest possible
demonstration that the counter and the value being written are two separate registers doing two
separate jobs.
