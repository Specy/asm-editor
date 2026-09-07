An `if` in C becomes a `goto`, and on MIPS a `goto` becomes one instruction, because the comparison
happens inside the branch. There is no flag to set first and nothing between the two lines to get in
the way.

## The condition you write is the one you invert

Flattening an `if` was the Assembly basics lecture on branching, and the shape it arrived at is
this: jump **over** the true branch when the condition is false.

```c
int x = 50;
if (x > 10) {
    x = 100;
} else {
    x = 200;
}
```

```c
    int x = 50;
    if (x <= 10) goto else_branch;
    x = 100;
    goto end;
else_branch:
    x = 200;
end:
```

The `>` in the C became a `<=` in the flat version, because the branch is taken when the `if` is
**not**. In MIPS that inverted condition is the mnemonic you write:

```mips|playground
.text
main:
    li $t0, 50              # x = 50
    li $t1, 10
    ble $t0, $t1, else      # if(x <= 10) goto else
    li $t0, 100             # x = 100
    j end
else:
    li $t0, 200             # x = 200
end:
```

`$t0` comes out at 100. Change `li $t0, 50` to `li $t0, 5` and it comes out at 200 instead.

The `j end` is the flat version's `goto end`, and leaving it out is the most common bug in hand
written control flow: the program runs the true branch, walks straight into the false one and the
second answer wins.

## Which branch says which condition

Six of these are real instructions and the rest are pseudo-instructions built out of `slt`, which
"Comparing without flags" takes apart. What matters when you are writing a program is the table.

| the C condition | signed              | unsigned   |
| --------------- | ------------------- | ---------- |
| `a == b`        | `beq $a, $b, label` | the same   |
| `a != b`        | `bne $a, $b, label` | the same   |
| `a < b`         | `blt`               | `bltu`     |
| `a <= b`        | `ble`               | `bleu`     |
| `a > b`         | `bgt`               | `bgtu`     |
| `a >= b`        | `bge`               | `bgeu`     |
| `a == 0`        | `beqz $a, label`    | the same   |
| `a != 0`        | `bnez $a, label`    | the same   |
| `a < 0`         | `bltz $a, label`    | never true |
| `a > 0`         | `bgtz $a, label`    | `bnez`     |

Every one of them takes a **label**, and the assembler works out the distance. A branch reaches about
32 kilobytes either way, which is thousands of instructions, so in practice you write the label and
forget about it.

The right hand column is the reminder to pick the family your numbers belong to. An address or a
count of bytes compared with `blt` is being read as a signed number, and one of them above two
billion comes out negative.

## else if

`else if` is a second comparison at the label the first branch fell through to, and every answer ends
with a jump to the end.

```c
char grade;
if (score >= 90)      grade = 'A';
else if (score >= 60) grade = 'B';
else                  grade = 'C';
```

```mips|playground
.text
main:
    li $t0, 75              # score = 75
    li $t1, 90
    bge $t0, $t1, grade_a   # if(score >= 90) goto grade_a
    li $t1, 60
    bge $t0, $t1, grade_b   # if(score >= 60) goto grade_b
    li $t2, 'C'             # grade = 'C'
    j done
grade_a:
    li $t2, 'A'
    j done
grade_b:
    li $t2, 'B'
done:
```

`$t2` comes out at `00000042`, which is `0x42`, the ASCII code of `B`. The `li $t1, 90` and
`li $t1, 60` are there because `bge` compares two registers and 90 and 60 have to be in one; `bge`
also accepts a constant directly, and then the assembler puts it in `$at` for you.

Try changing `li $t0, 75` to `li $t0, 95` and to `li $t0, 12` and watching `$t2`.

## An if with no branch at all

When the two sides of an `if` are one value each, three instructions do it without jumping anywhere.
`slt` puts the condition in a register, and `movn` and `movz` copy a register **only if** a third one
is or is not zero.

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

`$t2` comes out at 1, and `$t3` and `$t4` both at 3, the larger of the two. `movn $t3, $t1, $t2`
reads "move if not zero": it writes `$t1` into `$t3` when `$t2` is not zero and does nothing when it
is. That is C's `t3 = t2 ? t1 : t3`, and a CPU likes it because there is no jump to guess about.

`slt` on its own is already `x = (a < b)` with no branch: when what you want is the 1 or the 0 rather
than two different pieces of code, that one instruction is the whole `if`.

## Testing one bit

The M68K has `btst`, which tests a bit and sets a flag. MIPS has no such instruction and no such
flag, so you compute the `and` into a register and branch on whether it came out zero.

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

`$t2` comes out at 1, because bit 3 of 1010 is set, and `$t4` at 0, because bit 0 is not. `andi` with
a single bit set is C's `x & 8`, and `beqz` on the answer is C's `if (!(x & 8))`.

For a bit whose position the program worked out, shift instead: `srlv $t1, $t0, $t2` brings bit `$t2`
down to the bottom and `andi $t1, $t1, 1` keeps it.

## j, b and jr

Three ways to go somewhere unconditionally.

- **`j label`** is the jump, and it carries the target's address in the instruction.
- **`b label`** is the assembler's name for `beq $zero, $zero, label`, a branch that is always taken.
  It reaches 32 kilobytes where `j` reaches 256 megabytes, and inside one program they are
  interchangeable.
- **`jr $t0`** jumps to the address **in a register**, which is how a program returns from a
  subroutine (`jr $ra`) and how it jumps through a table of addresses it computed.

A label is an address like any other, so `la $t0, done` puts one in a register and `jr $t0` goes
there. That is the whole of a computed jump, and a `switch` with a jump table is a `.word` of labels,
an index scaled by four, an `lw` and a `jr`.

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
    bltz $t0, negative      # if(x < 0)
    bgtz $t0, positive      # if(x > 0)
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
