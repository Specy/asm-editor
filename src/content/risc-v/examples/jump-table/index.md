An operation number can choose a piece of code through a table of addresses. This program uses
`t2 = 2`, so it selects entry 2 — the third entry, because indexes start at 0 — and leaves
`6 * 3`, or 18, in `t6`.

The table is useful when there are several choices. The index still has to be checked before it is
used as an address. Here the accepted operation numbers are 0 through 3. `bgeu` treats its inputs
as unsigned, so a negative 32-bit value also counts as out of range: its unsigned form is a very
large number.

```riscv|playground|allow-open
.eqv CASE_COUNT, 4

.data
table: .word add_op, sub_op, mul_op, div_op

.text
main:
    li t0, 6                # a = 6
    li t1, 3                # b = 3
    li t2, 2                # op = 2: entry 2, the third table entry

    li t3, CASE_COUNT
    bgeu t2, t3, out_of_range

    la t3, table            # base address of the table
    slli t4, t2, 2          # byte offset = op * 4
    add t4, t3, t4          # address of table[op]
    lw t5, 0(t4)            # address stored in table[op]
    jr t5                   # jump to that address

out_of_range:
    li t6, -1               # no operation was selected
    j done

add_op:
    add t6, t0, t1          # a + b
    j done
sub_op:
    sub t6, t0, t1          # a - b
    j done
mul_op:
    mul t6, t0, t1          # a * b
    j done
div_op:
    div t6, t0, t1          # a / b
done:                       # every path finishes here; t6 holds the result
```

`.word add_op, sub_op, mul_op, div_op` puts four words in memory. Each word is the text-section
address of the label named after it. The exact numbers depend on where this copy of the program is
assembled. Open the memory panel at `10010000` to inspect the four addresses your assembly
produced; the important fact is their order: entry 0 leads to `add_op`, entry 1 to `sub_op`, and
so on.

After the check, the lookup has three steps. `slli` turns a word index into a byte offset by
multiplying it by 4. Adding that offset to the table base finds the selected word. `lw` reads the
address in that word, and `jr t5` continues execution at the address held in `t5`. With `t2 = 2`,
the offset is 8, so `lw` reads the address of `mul_op`.

The check comes first because an invalid index would point outside the four-word table. Try `t2`
values 0, 1, and 3 to select the other operations. Then try 4 and -1: both take the
`out_of_range` path and leave -1 in `t6`, without loading an address from outside the table.

Each operation ends with `j done`. The handlers sit one after another in memory, so without that
jump, finishing `add_op` would continue into `sub_op` and overwrite the answer. Step through the
program once and watch `t6`: for the starting values it finishes at 18.

## Try it: add a fifth operation

Complete this version to add a remainder operation selected by `t2 = 4`. Change `CASE_COUNT` to 5,
add `rem_op` as the fifth address in `table`, and write its handler. It must leave the remainder of
`t0 / t1` in `t6`, then jump to `done`. Keep the range check.

```riscv|playground|exercise
.eqv CASE_COUNT, 4          # change to 5

.data
table: .word add_op, sub_op, mul_op, div_op  # add rem_op

.text
main:
    li t0, 6
    li t1, 3
    li t2, 4                # select the new operation

    li t3, CASE_COUNT
    bgeu t2, t3, out_of_range
    la t3, table
    slli t4, t2, 2
    add t4, t3, t4
    lw t5, 0(t4)
    jr t5

out_of_range:
    li t6, -1
    j done
add_op:
    add t6, t0, t1
    j done
sub_op:
    sub t6, t0, t1
    j done
mul_op:
    mul t6, t0, t1
    j done
div_op:
    div t6, t0, t1
    j done
# Put rem_op here, before done.
done:
```

```testcase
{
    "expectedRegisters": { "t6": 0 }
}
```

After it passes, change `t2` to 5 and then -1. Both values should still leave -1 in `t6`.

<details>
<summary>Show one solution</summary>

```riscv|playground|solution
.eqv CASE_COUNT, 5

.data
table: .word add_op, sub_op, mul_op, div_op, rem_op

.text
main:
    li t0, 6
    li t1, 3
    li t2, 4

    li t3, CASE_COUNT
    bgeu t2, t3, out_of_range
    la t3, table
    slli t4, t2, 2
    add t4, t3, t4
    lw t5, 0(t4)
    jr t5

out_of_range:
    li t6, -1
    j done
add_op:
    add t6, t0, t1
    j done
sub_op:
    sub t6, t0, t1
    j done
mul_op:
    mul t6, t0, t1
    j done
div_op:
    div t6, t0, t1
    j done
rem_op:
    rem t6, t0, t1
    j done
done:
```

</details>
