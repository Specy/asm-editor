Six numbers are written into memory by the assembler. The program walks from the first number to
the address just after the array, adding each word to a running total in `$t2`.

An array does not fit in the registers and its elements have no names of their own, so the program
keeps the address of the next element in `$t0` and advances that pointer after every load.

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
    addu $t2, $t2, $t3  # add its 32-bit bit pattern to the total
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

The familiar `la` and `li` are assembler pseudo-instructions, while the loop control uses the real
MIPS instructions `beq` and `j`.

Each element is an aligned four-byte word. The six words therefore occupy 24 bytes, and
`addiu $t0, $t0, 4` advances the pointer by exactly one element. A load uses the address written as
`offset(base)` but does not change that address, so the pointer step needs its own instruction.

`end:` names the address where the next item would begin: the one-past-the-array address. A label
only gives a name to an address; it occupies no bytes. With the playground's default layout, and
with `numbers` as the first item in the data section, `$t0` starts at `0x10010000` and `$t1` is
`0x10010018`. The comparison at the top is true before any `lw` when the two labels have the same
address, so the same loop is also safe for an empty array.

`addu` and `addiu` use 32-bit arithmetic without a signed-overflow trap. Here the total is the sum
of the words' bit patterns modulo $2^{32}$: if it grows past `0xffffffff`, it wraps around. The
pointer advance has the same nontrapping arithmetic behavior.

Run the program and check that `$t2` is `108` (`0x0000006c`), `$t0` and `$t1` are both
`0x10010018`, `$t3` still holds `42`, and `$v0` is `10` when syscall 10 ends execution. Together,
those values show that the total includes the last element, the pointer stops exactly one past the
array, and the program reaches its exit.

For a second check, make the array empty by changing the data declarations to these two adjacent
labels:

```mips
numbers:
end:
```

Also add `li $t3, 0x12345678` immediately after `li $t2, 0`, then run again. The first `beq` should
go directly to `done`: `$t2` stays `0`, `$t0` equals `$t1`, and `$t3` keeps the sentinel value
`0x12345678` because no `lw` ran.

Finally, restore the six values and add a seventh number to the `.word` line, say `100`. The total
becomes `208` without changing an instruction because `end` moves with the array. A counter-based
version can work too, but its element count would normally need to be updated when the data changes;
the end label lets the assembler update the boundary for you.
