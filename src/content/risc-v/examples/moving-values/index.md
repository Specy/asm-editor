This program keeps a rectangle's width and height in registers. It calculates the perimeter with
`2 × (width + height)`, makes two copies of the result, and finds the difference between the two
sides. Nothing is read from memory.

```riscv|playground|allow-open
.text
main:
    li t0, 30           # width = 30
    li t1, 12           # height = 12
    add t2, t0, t1      # width + height = 42
    add t2, t2, t2      # perimeter = 2 * 42 = 84

    mv t3, t2           # copy the perimeter
    add t4, t2, zero    # copy it again
    sub t5, t0, t1      # width - height = 18
```

In `li t0, 30`, `t0` is a register name and `30` is the number placed in that register. After the
first two lines, `t0` holds 30 and `t1` holds 12.

An `add` names its destination first, followed by its two sources. `add t2, t0, t1` reads `t0` and
`t1`, then writes their sum to `t2`. It does not change either source register. The next `add` uses
`t2` as both sources, so it adds 42 to itself and writes 84 back to `t2`.

`mv t3, t2` copies the value in `t2` to `t3`. The following line makes another copy in `t4`:
`zero` always supplies the value 0, so adding it does not change the value. `mv` is a
pseudo-instruction that the assembler expands to `addi t3, t2, 0`; it has the same copying effect.

The final `sub` also names its destination first. It calculates `t0 - t1`, or `30 - 12`, and puts
18 in `t5`. After the last instruction, the registers hold:

| register | value | meaning |
| -------- | ----: | ------- |
| `t0` | 30 | width |
| `t1` | 12 | height |
| `t2` | 84 | perimeter |
| `t3` | 84 | copied perimeter |
| `t4` | 84 | copied perimeter |
| `t5` | 18 | width minus height |

## Try it

Change the width to 7 and the height to 5. Before running the program, predict the final values of
`t2`, `t3`, `t4`, and `t5`. Then run it and compare the registers with your prediction.

<details>
<summary>Show answer</summary>

You should get `t2 = 24`, because `2 × (7 + 5) = 24`. Both copies have the same value, so
`t3 = 24` and `t4 = 24`. The subtraction gives `t5 = 2`.

</details>
