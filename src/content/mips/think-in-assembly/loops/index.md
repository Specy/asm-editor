A loop is three things you already have: a test, a branch that leaves when the test says so, and a
jump backwards to do it all again. MIPS gives you each of those separately and nothing that bundles
them, so every loop you write is assembled out of those parts by hand. The interesting consequence
is that you get to choose the shape, and the shapes are not equally cheap.

## The loop written out

Adding up the numbers from 1 to 10. In plain terms:

```
        sum = 0
        i = 1
while_start:
        if i is greater than 10, jump to while_end
        sum = sum + i
        i = i + 1
        jump to while_start
while_end:
```

```mips|playground
.text
main:
    li $t0, 0               # the running total
    li $t1, 1               # the counter, starting at 1
while_start:
    bgt $t1, 10, while_end  # past 10, so leave
    add $t0, $t0, $t1       # add the counter to the total
    addi $t1, $t1, 1        # next value
    j while_start
while_end:
```

`$t0` holds 55 and `$t1` finishes at 11, one past the last value it actually used, because the test
that stopped the loop is the one that failed. Counters almost always end one step past the end and
that is normal; reading `$t1` as "the last number added" is the mistake.

Now count the cost. `bgt $t1, 10, while_end` has a constant in it, so it is a pseudo-instruction
worth three real ones: an `addi` to get the 10 into `$at`, an `slt`, and a `bne`. Add the `add`, the
`addi` and the `j` and every pass runs six instructions to do one instruction's worth of work.

## Counting down to zero

`bnez` and `beqz` are real instructions that compare against `$zero`, and they cost one. So a loop
whose counter runs **down to zero** is half the size of the same loop counting up.

```mips|playground
.text
main:
    li $t0, 0               # the running total
    li $t1, 10              # how many are left
loop:
    add $t0, $t0, $t1       # add whatever is left
    addi $t1, $t1, -1       # one fewer
    bnez $t1, loop          # until it reaches zero
```

`$t0` is 55 again, from three instructions a pass instead of six. Two things changed. The test moved
to the **bottom** of the loop, so the body always runs at least once, and the test compares against
zero, which needs no `slt` and no `$at`.

The test at the bottom is the half that needs watching. If the count can legitimately be zero, this
loop runs the body once anyway, then decrements past zero and counts down through every negative
number until the instruction budget runs out. Guard it before you go in:

```
    beqz $t1, loop_end
loop:
    ...
```

Counting down costs you one thing: the counter is no longer the index. It says how many are left,
not which one you are on. When the body needs the index, either count up and pay for the comparison,
or keep a second register that counts the other way.

## Nested loops

An inner loop sits between two lines of the outer one, with its own counter in its own register,
reset at the top of every outer pass. The reset is the whole difficulty.

```mips|playground
.text
main:
    li $t0, 0               # the running total
    li $t1, 3               # rows left
outer:
    li $t2, 4               # columns left, reset on every outer pass
inner:
    addi $t0, $t0, 1        # one more cell visited
    addi $t2, $t2, -1
    bnez $t2, inner
    addi $t1, $t1, -1
    bnez $t1, outer
```

`$t0` finishes at 12, which is 3 times 4.

Move the `li $t2, 4` line above `outer:` and run it. The inner counter is 0 when the second outer
pass begins, so the first `addi $t2, $t2, -1` takes it to -1, `bnez` is happy, and the inner loop
counts down through four billion values. The Playground stops after two million instructions with no
message at all. The program simply ends where it had got to, and `$t2` in the panel is some huge
number.

That silence is what an accidental infinite loop looks like here, so when a program stops for no
apparent reason with a register full of nonsense, this is the first thing to suspect.

## Walking an array

A loop over memory does not need a counter at all. Put a label after the last element, load its
address, and run until the pointer reaches it.

```mips|playground|memory
.data
numbers: .word 10, 20, 30, 40, 50
end:

.text
main:
    la $t0, numbers         # where we are standing
    la $t1, end             # the address one past the last element
    li $t2, 0               # the running total
loop:
    beq $t0, $t1, done      # reached the end, so stop
    lw $t3, 0($t0)          # the element we are standing on
    add $t2, $t2, $t3       # into the total
    addi $t0, $t0, 4        # step on one word
    j loop
done:
```

The trick is `end:`, a label with nothing underneath it. A label is the address the next thing would
have been put at, so with nothing following the array, `end` is the address one past the last
element. `$t0` and `$t1` both finish at `10010014`, which is that address: the pointer walked up to
the boundary and stopped on it.

Add a sixth number to the `.word` line and run it again. The total changes and not one other line of
the program does, because the loop never knew how many elements there were. The counted version
needs its `li` updated every time the data changes, and sooner or later somebody forgets.

`beq` between two pointers is exact here, since the pointer lands on `end` rather than stepping over
it. Comparing against a length instead would also work, and there you want `bltu`, because addresses
are unsigned and one near the top of memory reads as negative to a signed comparison.

## Write two loops

Add up the numbers from 1 to 10 with a loop and leave 55 in `$t0`. Both directions work; the one
counting down is three instructions a pass.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": 55 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t0, 0               # the running total
    li $t1, 10              # how many are left
loop:
    add $t0, $t0, $t1       # add whatever is left
    addi $t1, $t1, -1       # one fewer
    bnez $t1, loop
```

</details>

The second one starts `$t0` at 64 and asks how many times it can be halved before it reaches 1.
Leave that count in `$t1`, which for 64 is 6. Halve it with `srl`, the right shift that brings
zeroes in at the top, which is the one you want for a number that is never negative.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": 64 },
    "expectedRegisters": { "$t1": 6 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t1, 0               # how many halvings so far
loop:
    ble $t0, 1, done        # down to 1, so stop
    srl $t0, $t0, 1         # one place right is half
    addi $t1, $t1, 1        # count that one
    j loop
done:
```

</details>
