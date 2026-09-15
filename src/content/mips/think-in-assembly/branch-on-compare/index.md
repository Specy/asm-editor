Assembly has no `if` with a body in brackets. It has labels and it has branches, so every decision
you write is the same flat shape: ask a question, jump somewhere else if the answer means you should
skip this code, and otherwise fall through into it.

On MIPS the asking and the jumping are one instruction, which makes the shape short. Here is the
decision written out in plain terms first:

```
    if x is greater than 10        take 100
    otherwise                      take 200
```

and here is the same thing flattened into labels and jumps, which is the form assembly can express:

```
        if x is 10 or less, jump to else_branch
        x = 100
        jump to end
else_branch:
        x = 200
end:
```

The condition **flipped**. "Greater than 10" became "10 or less", because the branch is the thing
that happens when you are **not** doing the first case. That flip catches everybody at least once,
and the habit to build is: write the condition that sends you away.

In MIPS that flipped condition is the mnemonic you type:

```mips|playground
.text
main:
    li $t0, 50              # the value we are testing
    li $t1, 10
    ble $t0, $t1, else      # 10 or less sends us away
    li $t0, 100             # the greater-than-10 answer
    j end
else:
    li $t0, 200             # the other one
end:
```

`$t0` finishes at 100. Change `li $t0, 50` to `li $t0, 5` and it finishes at 200, which is the
`else` arm running instead.

Now delete the `j end` line and run it again. `$t0` comes out 200 whatever you start it at: the
program does the true arm, walks straight on into the false arm, and the second answer overwrites
the first. There is nothing in assembly that ends a branch for you, and forgetting that jump is the
most common bug in hand written control flow.

## Which branch asks which question

Six of these are real instructions and the rest are pseudo-instructions the assembler builds out of
`slt`, which "Comparing two numbers" takes apart. When you are writing a program what you want is
the table.

| you want to jump when   | signed              | unsigned   |
| ----------------------- | ------------------- | ---------- |
| `a` equals `b`          | `beq $a, $b, label` | the same   |
| `a` is not `b`          | `bne $a, $b, label` | the same   |
| `a` is less than `b`    | `blt`               | `bltu`     |
| `a` is `b` or less      | `ble`               | `bleu`     |
| `a` is greater than `b` | `bgt`               | `bgtu`     |
| `a` is `b` or more      | `bge`               | `bgeu`     |
| `a` is zero             | `beqz $a, label`    | the same   |
| `a` is not zero         | `bnez $a, label`    | the same   |
| `a` is negative         | `bltz $a, label`    | never true |
| `a` is above zero       | `bgtz $a, label`    | `bnez`     |

Every one of them takes a **label**, and the assembler works out the distance. A branch reaches about
32 kilobytes either way, which is thousands of instructions, so in practice you write the label and
forget about it.

The right hand column is the reminder to pick the family your numbers belong to. An address or a
count of bytes compared with `blt` is being read as a signed number, and one of them above two
billion comes out negative.

## A chain of decisions

Several cases in a row need nothing new. Each test falls through to the next one, and every arm ends
by jumping to the same finish.

```
        if score is 90 or more, jump to grade_a
        if score is 60 or more, jump to grade_b
        grade = 'C'
        jump to done
grade_a:
        grade = 'A'
        jump to done
grade_b:
        grade = 'B'
done:
```

```mips|playground
.text
main:
    li $t0, 75              # the score
    li $t1, 90
    bge $t0, $t1, grade_a   # 90 or more
    li $t1, 60
    bge $t0, $t1, grade_b   # 60 or more
    li $t2, 'C'             # everything that got this far
    j done
grade_a:
    li $t2, 'A'
    j done
grade_b:
    li $t2, 'B'
done:
```

`$t2` holds `0x42`, the ASCII code of `B`, which is the right answer for a score of 75.

The `li $t1, 90` and `li $t1, 60` lines are there because `bge` wants two registers, so the number
it is compared against has to be in one of them. You can write `bge $t0, 90, grade_a` instead and
the assembler will load the 90 into `$at` on your behalf, which is shorter to read and one more
instruction to run.

## A decision with no jump in it

When each arm of a decision is a single value rather than a block of work, you can skip the jumping
entirely. `slt` puts the condition in a register, and `movn` and `movz` copy a register **only if** a
third register is or is not zero. Three instructions, no labels, and the CPU never has to guess
which way a branch will go.

```mips|playground
.text
main:
    li $t0, -5
    li $t1, 3
    slt $t2, $t0, $t1       # 1 when $t0 is the smaller
    move $t3, $t0           # assume $t0 is the answer
    movn $t3, $t1, $t2      # take $t1 instead when $t2 is not zero
    move $t4, $t1           # the same thing said the other way round
    movz $t4, $t0, $t2      # take $t0 when $t2 is zero
```

`$t3` and `$t4` both end up at 3, the larger of the two, reached two different ways.
`movn $t3, $t1, $t2` reads "move if not zero": it writes `$t1` into `$t3` when `$t2` is not zero, and
does nothing at all when `$t2` is zero. `movz` is the same instruction with the test the other way
round, which is why the two halves of the program can start from opposite assumptions and agree.

And when the thing you want is the 1 or the 0 itself rather than two different pieces of code, `slt`
on its own already is the whole decision.

## Testing one bit

To ask whether a particular bit of a number is set, `and` the number with a value that has only that
bit in it. Every other bit is wiped out, so the answer is zero when the bit was clear and non-zero
when it was set, and a `beqz` or a `bnez` turns that into a decision.

```mips|playground
.text
main:
    li $t0, 10              # 1010 in binary
    andi $t1, $t0, 8        # keep bit 3
    beqz $t1, clear
    li $t2, 1               # bit 3 was set
    j done
clear:
    li $t2, 0
done:
    andi $t3, $t0, 1        # bit 0, which is 0 in 1010
    bnez $t3, odd
    li $t4, 0               # so the number is even
    j finished
odd:
    li $t4, 1
finished:
```

`$t2` is 1 because bit 3 of `1010` is set, and `$t4` is 0 because bit 0 is not, which also makes 10
an even number. The constant you `and` with is the bit's value: 1 for bit 0, 2 for bit 1, 4 for bit
2, 8 for bit 3, doubling each time.

When the program works out which bit it wants while it runs, the constant will not do. Shift instead:
`srlv $t1, $t0, $t2` slides bit number `$t2` down to the bottom, and `andi $t1, $t1, 1` keeps that
bit and throws away everything above it.

## j, b and jr

Three ways to go somewhere unconditionally.

- **`j label`** is the jump, and it carries the target's address in the instruction.
- **`b label`** is the assembler's name for `beq $zero, $zero, label`, a branch that is always taken.
  It reaches 32 kilobytes where `j` reaches 256 megabytes, and inside one program they are
  interchangeable.
- **`jr $t0`** jumps to the address **in a register**, which is how a program returns from a
  subroutine (`jr $ra`) and how it jumps through a table of addresses it computed.

A label is an address like any other, so `la $t0, done` puts one in a register and `jr $t0` goes
there. That is enough to build a jump table: a `.word` list of labels, an index multiplied by four,
an `lw` to fetch the address you landed on, and a `jr` to go there. The "Jump table" example does
exactly that.

## Your turn

The test starts `$t0` at -7. Leave its sign in `$t1`: -1 when `$t0` is negative, 0 when it is zero
and 1 when it is positive. For -7 that is -1.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": -7 },
    "expectedRegisters": { "$t1": -1 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    bltz $t0, negative      # below zero
    bgtz $t0, positive      # above zero
    li $t1, 0               # what is left is zero
    j done
negative:
    li $t1, -1
    j done
positive:
    li $t1, 1
done:
```

</details>

The second one starts `$t0` at 75 and wants the grade of the chain above in `$t1`: `'A'` for 90 and
over, `'B'` for 60 and over, `'C'` otherwise. `'B'` is `0x42`.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": 75 },
    "expectedRegisters": { "$t1": "0x42" }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    bge $t0, 90, grade_a    # the constant goes through $at
    bge $t0, 60, grade_b
    li $t1, 'C'
    j done
grade_a:
    li $t1, 'A'
    j done
grade_b:
    li $t1, 'B'
done:
```

</details>
