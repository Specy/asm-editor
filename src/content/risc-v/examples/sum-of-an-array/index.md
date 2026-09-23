Six numbers are written into memory by the assembler, and the program adds them up and leaves the
total in `t2`. The loop has no counter in it at all: it stops when the pointer walking the array
arrives at the address just past the end.

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

`end:` is a label with nothing underneath it. A label is just a name for the address the assembler
had reached when it read the name, so `end` names the address the seventh word would have gone at.
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

`t0` takes exactly six steps of 4 and lands on `end` on the seventh test, which is when `bne` gives
up and the program stops. It lands exactly on it rather than overshooting, so comparing the two for
equality is safe.

The test being at the **bottom** of the loop is what makes this four instructions a pass instead of
five. A loop that checks at the top needs that check plus a separate jump back after the body. Here,
the backwards `bne` does both jobs. It costs you one thing: the body always runs once before anything
is checked, so a loop written this way over an empty array would read an element that is not there.

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
