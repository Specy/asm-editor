The assembler writes six numbers next to one another in memory. Rather than give each word a
separate label, this program keeps the address of the next word in `$t0` and adds each value to a
running total in `$t2`.

`numbers` names the first word. The six `.word` values take 24 bytes, so the assembler places `end`
at its current location immediately after the sixth word. The label takes no space of its own.
`la $t1, end` therefore gives the program the address where it should stop.

```mips|playground|memory|tests|allow-open
.data
numbers: .word 4, 8, 15, 16, 23, 42
end:

.text
main:
    la $t0, numbers     # address of the next element
    la $t1, end         # address one past the array
    li $t2, 0           # running total
loop:
    beq $t0, $t1, done  # check before loading, so an empty array is valid
    lw $t3, 0($t0)      # load the element under the pointer
    addu $t2, $t2, $t3  # add this word to the total
    addiu $t0, $t0, 4   # advance to the next word
    j loop
done:
    li $v0, 10          # exit
    syscall
```

```testcase
{
    "expectedRegisters": {
        "$t0": "0x10010018",
        "$t1": "0x10010018",
        "$t2": 108,
        "$t3": 42,
        "$v0": 10
    }
}
```

At `loop`, `$t0` points to the next word and `$t1` marks the stopping address. `beq` checks those
addresses _before_ `lw` reads memory. If they differ, `lw` reads the word at `$t0`, `addu` adds it
to `$t2`, and `addiu` advances `$t0` by four bytes to the next word. `lw` itself does not move the
pointer. The jump repeats the check. `addu` and `addiu` do their arithmetic without stopping on
signed overflow; the six values here give the ordinary sum 108.

Run the program. The important stopping check is that `$t0` equals `$t1`: the pointer reached
`end` without trying to load from it. `$t2` should hold 108 and `$t3` should still hold the last
word, 42. The register panel shows hexadecimal without a `0x` prefix, so those values appear as
`0000006C` and `0000002A`. In this Playground layout, `numbers` begins at `0x10010000`; after six
four-byte words, both pointers show `10010018`. `$v0` shows `0000000A` for the exit syscall.

For a second check, make the array empty by changing the data declarations to these two adjacent
labels:

```mips
numbers:
end:
```

Also add `li $t3, 0x12345678` immediately after `li $t2, 0`, then run again. The first `beq` should
go directly to `done`: `$t2` stays `0`, `$t0` equals `$t1`, and `$t3` keeps the sentinel value
`0x12345678` because no `lw` ran.

Finally, restore the six values, remove the sentinel line, and add `, 100` after `42` on the
`.word` line. The total becomes 208 without changing an instruction: the assembler moves `end` to
the address after the new last word.
