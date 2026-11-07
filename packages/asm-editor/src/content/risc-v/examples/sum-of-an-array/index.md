This program adds six numbers stored in memory and leaves the total in `t2`. The loop uses a
pointer instead of a counter: it stops when the pointer reaches the address just past the last element.

```riscv|playground|memory|allow-open
.data
numbers: .word 4, 8, 15, 16, 23, 42
end:

.text
main:
    la t0, numbers      # the first element
    la t1, end          # one word past the last
    li t2, 0            # the running total
loop:
    lw t3, 0(t0)        # read the element t0 points at
    add t2, t2, t3
    addi t0, t0, 4      # step to the next word
    bne t0, t1, loop
```

`end:` is a label with no data after it. A label names the current address during assembly, so
`end` names the address immediately after the sixth word.
Laid out, the data section looks like this:

```
10010000  4     <- numbers, and where t0 starts
10010004  8
10010008  15
1001000C  16
10010010  23
10010014  42
10010018        <- end, and where t0 finishes
```

`t0` advances by 4 bytes six times and reaches `end` on the sixth test. At that point, `bne` does
not branch, and the program stops. Each step matches the size of a word, so the pointer reaches
`end` exactly and the equality check works.

Testing at the **bottom** of the loop keeps each pass to four instructions. A loop that checks at
the top needs that check plus a separate jump back after the body. Here, `bne` both checks the pointer
and branches back when there are more elements. The body always runs once before the first check,
so this loop would try to read an element even if the array were empty.

## Your turn: sum a different array

Complete the program so it adds all seven words and leaves the total in `t2`. Use `t0` as the
pointer and stop when it reaches `end`. Leave `t0` at `end` as well. This array is known to be
nonempty, so a bottom-tested loop is safe here. Do not replace the calculation with `li t2, 34`.

```riscv|playground|exercise
.data
numbers: .word 7, -3, 12, 5, -8, 20, 1
end:

.text
main:
    # set up t0, t1, and t2
    # load and add each word, advancing t0 until it reaches end
```

```testcase
{
    "expectedRegisters": { "t0": "0x1001001c", "t2": 34 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.data
numbers: .word 7, -3, 12, 5, -8, 20, 1
end:

.text
main:
    la t0, numbers
    la t1, end
    li t2, 0
loop:
    lw t3, 0(t0)
    add t2, t2, t3
    addi t0, t0, 4
    bne t0, t1, loop
```

</details>

Adding or removing a value on the `.word` line moves `end` with the array, so the loop itself does
not need a new count. That is the reason to walk to an end address: the boundary follows the data.
