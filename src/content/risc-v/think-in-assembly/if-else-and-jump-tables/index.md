A branch takes a question and turns it into a jump, and that is all the machinery you get. There is
no `if` and no `else` anywhere in the instruction set: what there is, is a jump that happens
sometimes, and everything else is how you arrange your code around it.

## Jump over the part that must not run

Here is a decision written the way you would say it out loud:

```
x is 50
if x is greater than 10, make x 100
otherwise, make x 200
```

The machine cannot do "otherwise". It can only fall into the next instruction or jump somewhere. So
the code is laid out as two blocks, one after the other, and the branch **skips over** the first one
when it should not run:

```riscv|playground
.text
main:
    li t0, 50
    li t1, 10
    ble t0, t1, else    # if x is NOT greater than 10, skip the next two lines
    li t0, 100
    j end
else:
    li t0, 200
end:
```

Notice what happened to the condition. You wrote "greater than", the branch says `ble`, less than or
equal. The branch is taken when the `if` is **false**, because being taken means skipping the body.
Getting this backwards is the classic mistake, and the symptom is a program that does exactly the
wrong one of two things.

The `j end` matters just as much. Without it, the code that just set `t0` to 100 carries straight on
into the line that sets it to 200, because the two blocks are simply one after the other in memory
and nothing separates them. Delete that line and run it: the answer comes out 200 whatever `t0`
started at.

## Which branch for which question

| the question you are asking | signed        | unsigned   |
| --------------------------- | ------------- | ---------- |
| are they equal              | `beq a, b, l` | the same   |
| are they different          | `bne a, b, l` | the same   |
| is `a` below `b`            | `blt`         | `bltu`     |
| is `a` below or equal       | `ble`         | `bleu`     |
| is `a` above `b`            | `bgt`         | `bgtu`     |
| is `a` above or equal       | `bge`         | `bgeu`     |
| is `a` zero                 | `beqz a, l`   | the same   |
| is `a` not zero             | `bnez a, l`   | the same   |
| is `a` negative             | `bltz a, l`   | never true |
| is `a` positive             | `bgtz a, l`   | `bnez`     |

Each of those is one instruction and each takes a label, with the assembler working out the
distance. A branch reaches about 4 kilobytes in either direction, which is a thousand instructions,
so in practice you write the label and forget about it. If you ever do go past that, the build says
`Branch target word address beyond 12-bit range`, and the fix is to branch to a nearby `j`, which
reaches a megabyte.

## Comparing against a number

A branch compares two registers. Not a register and a number: two registers. So every comparison
against a constant costs a `li` in front of it to get the constant into a register first.

```riscv|playground
.text
main:
    li t0, 75           # the score
    li t1, 90
    bge t0, t1, grade_a
    li t1, 60
    bge t0, t1, grade_b
    li t2, 'C'
    j done
grade_a:
    li t2, 'A'
    j done
grade_b:
    li t2, 'B'
done:
```

That is a chain: each test is at the label the previous one fell through to, and each answer ends by
jumping to the end. `t2` comes out at `00000042`, the ASCII code of `B`, because 75 failed the first
test and passed the second.

The two `li t1` lines are the price of the rule above. They are also the reason to hoist a constant
out of a loop when the same comparison runs over and over: inside a loop that `li` runs every pass,
outside it runs once.

## A condition the machine will not answer for you

Add two unsigned numbers and the answer can be too big to fit. Nothing is raised, nothing is
recorded, and the sum simply wraps round. If your program needs to know, it has to look at the
answer, and the fact to lean on is this: **an unsigned sum that wrapped comes out smaller than
either of the numbers you added**.

```riscv|playground
.text
main:
    li t0, 0xFFFFFFFF
    li t1, 2
    add t2, t0, t1      # wraps round to 1
    sltu t3, t2, t0     # 1: the sum is below an operand, so it wrapped
    li t4, 5
    li t5, 2
    add t6, t4, t5      # 7, no wrap
    sltu s0, t6, t4     # 0
```

One `sltu` recovers, from the answer itself, a fact the hardware never recorded. Signed overflow is
the same kind of reasoning from different evidence: a signed sum has overflowed exactly when both
numbers you added had the same sign and the answer came out with the other one.

## j, jal and jr

Three ways to go somewhere with no question attached, and underneath they are two instructions.

- **`j label`** is `jal zero, label`: jump, and throw away the note of where you came from.
- **`jal label`** is `jal ra, label`: jump, and put the address of the next instruction into `ra`,
  which is how a subroutine gets called. Its own lecture comes later.
- **`jr t0`** is `jalr zero, t0, 0`: jump to the address held **in a register**, which is what you
  need when the destination was worked out while the program ran.

That last one is worth a program of its own, because it is how a choice between many cases is made
without testing them one at a time. A label is an address, and an address fits in a `.word`, so a
list of labels is a table you can index.

```riscv|playground|memory
.data
table: .word case0, case1, case2

.text
main:
    li t0, 2            # which case we want
    la t2, table
    slli t3, t0, 2      # times 4, since a table entry is a word
    add t3, t2, t3
    lw t4, 0(t3)        # the address stored there
    jr t4
case0:
    li t1, 10
    j done
case1:
    li t1, 20
    j done
case2:
    li t1, 30
done:
```

`t4` comes out at `0040002C`, the address of `case2`, which the assembler wrote into the third word
of the table and the program read back out. Put 0 in `t0` instead and the same five instructions
land somewhere else entirely.

One load and one jump, whatever the number of cases, where a chain of `bge` costs two instructions
for every case it walks past. What the table does not do is check the index: put 7 in `t0` and the
program reads a word from past the end of the table and jumps to whatever happened to be there.
Checking the range is yours, and it is one `bgeu` in front of the lookup.

## Your turn

The test starts `t0` at -7. Leave its sign in `t1`: -1 when `t0` is negative, 0 when it is zero and
1 when it is positive. For -7 that is -1.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": -7 },
    "expectedRegisters": { "t1": -1 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    bltz t0, negative
    bgtz t0, positive
    li t1, 0            # what is left is zero
    j done
negative:
    li t1, -1
    j done
positive:
    li t1, 1
done:
```

</details>

The second one has the three cases and the table written for you, and the test starts `t0` at 1.
Work out the address of the case and jump to it, so that `t1` comes out at 20.

```riscv|playground|memory|exercise
.data
table: .word case0, case1, case2

.text
main:
    la t2, table
    # your code here
case0:
    li t1, 10
    j done
case1:
    li t1, 20
    j done
case2:
    li t1, 30
done:
```

```testcase
{
    "startingRegisters": { "t0": 1 },
    "expectedRegisters": { "t1": 20 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
table: .word case0, case1, case2

.text
main:
    la t2, table
    slli t3, t0, 2      # the index times four
    add t3, t2, t3      # the entry's address
    lw t4, 0(t3)        # the address it holds
    jr t4
case0:
    li t1, 10
    j done
case1:
    li t1, 20
    j done
case2:
    li t1, 30
done:
```

</details>
