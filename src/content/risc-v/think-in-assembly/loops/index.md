A loop has three moving parts and you write all three yourself: something that changes on every
pass, a test, and a jump backwards. There is no single instruction that counts and jumps, which
means the cost of a loop is decided entirely by how you arrange those three.

## The loop written out

Adding up the numbers from 1 to 10. In words first:

```
sum is 0, i is 1
while i is not past 10:
    add i to sum
    add 1 to i
```

And the same thing with the "while" turned into a jump out and a jump back:

```riscv|playground
.text
main:
    li t0, 0            # the running total
    li t1, 1            # the counter
    li t2, 10           # the bound, which has to be in a register
top:
    bgt t1, t2, finished
    add t0, t0, t1
    addi t1, t1, 1
    j top
finished:
```

`t0` comes out at `00000037`, which is 55, and `t1` at 11, one step past the last value it used.
A loop is just a jump that goes backwards instead of forwards.

`li t2, 10` sits above the loop because the branch needs the bound in a register, and loading it
inside would repeat that work on every pass for nothing.

Count the instructions in a pass: four, of which three are loop machinery and one is the actual
work. That ratio is worth improving.

## The test at the bottom

The branch at the top and the jump at the bottom do the same job twice over. Move the test to the
**bottom** and the jump goes away, which makes it a `do while` and costs three instructions a pass
instead of four.

```riscv|playground
.text
main:
    li t0, 0            # sum = 0
    li t1, 10           # n = 10
loop:
    add t0, t0, t1      # sum += n
    addi t1, t1, -1     # n--
    bnez t1, loop       # until it reaches zero
```

`t0` is 55 again and `t1` ends at 0. Two things changed at once. The test moved to the bottom, which
gets rid of the jump, and the counter runs **down** to zero, which gets rid of the register holding
the bound: `bnez` compares against `zero`, and `zero` is always there.

The test at the bottom is what to watch: the body runs once before anything is checked, so a loop
written this way with a count of 0 runs once and then counts down through every negative number.
When the count can be zero, test it before you enter:

```
    beqz t1, loop_end
loop:
    ...
```

Counting down also means the counter is no longer the index. When the body needs to know which pass
it is on, either count up and keep the bound in a register, or keep a second register.

## Nested loops

Nothing new: an inner loop sits between two lines of the outer one, with its own counter in its own
register, reset at the top of every outer pass.

```riscv|playground
.text
main:
    li t0, 0            # total = 0
    li t1, 3            # rows left
outer:
    li t2, 4            # columns left, reset on every outer pass
inner:
    addi t0, t0, 1      # total++
    addi t2, t2, -1
    bnez t2, inner
    addi t1, t1, -1
    bnez t1, outer
```

`t0` comes out at 12, which is 3 times 4. The `li t2, 4` has to be **inside** the outer loop, and
this is the mistake everybody makes once. Move it above `outer:` and the inner counter is already 0
when the second outer pass begins, so the first `addi` takes it to -1 and the loop counts down
through four billion values before it reaches zero again. Try it.

That silence is what an accidental infinite loop looks like here. There is no message: the program
simply stops where it had got to, and the registers panel shows a counter at some enormous number.

## Walking an array

A loop over memory does not need a counter at all. Put a label after the last element, load its
address, and run until the pointer reaches it.

```riscv|playground|memory
.data
numbers: .word 10, 20, 30, 40, 50
end:

.text
main:
    la t0, numbers      # where we are
    la t1, end          # where to stop
    li t2, 0            # the running total
loop:
    beq t0, t1, done    # arrived at the end?
    lw t3, 0(t0)
    add t2, t2, t3
    addi t0, t0, 4      # on to the next word
    j loop
done:
```

`t0` and `t1` both finish at `10010014`. `end:` is a label with nothing under it, so it names the
address the next thing would have been put at, which is one word past the array. Add a sixth number
to the `.word` line and the loop picks it up with no other change anywhere, which is exactly what
the counted version cannot do.

`beq` between two pointers is exact, since the pointer lands on `end` and not past it. A `blt`
against a length would work too, and `bltu` is the one to use there, because addresses are unsigned.

## Three loops to write

Add up the numbers from 1 to 10 with a loop and leave 55 in `t0`. Both directions work; the one
counting down is three instructions a pass and needs no register for the bound.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "t0": 55 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    li t0, 0
    li t1, 10
loop:
    add t0, t0, t1      # add the counter to the total
    addi t1, t1, -1
    bnez t1, loop
```

</details>

The second one starts `t0` at 64 and asks how many times it can be halved before it reaches 1. Leave
that count in `t1`, which for 64 is 6, and use a shift for the halving.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": 64 },
    "expectedRegisters": { "t1": 6 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    li t1, 0            # how many halvings so far
    li t2, 1
loop:
    ble t0, t2, done    # stop once it is down to 1
    srli t0, t0, 1      # halve it
    addi t1, t1, 1
    j loop
done:
```

</details>

The third one is the pointer walk, with no counter anywhere. The five words at `numbers` are
followed by the label `end`, and their total belongs in `t2`.

```riscv|playground|memory|exercise
.data
numbers: .word 3, 9, 27, 81, 243
end:

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "t2": 363 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
numbers: .word 3, 9, 27, 81, 243
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
    bne t0, t1, loop    # the test at the bottom, since there is always one element
```

</details>
