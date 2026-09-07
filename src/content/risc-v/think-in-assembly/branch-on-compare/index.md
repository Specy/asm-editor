An `if` in C becomes a `goto`, and on RISC-V a `goto` becomes one instruction, because the comparison
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
**not**. In RISC-V that inverted condition is the mnemonic you write:

```riscv|playground
.text
main:
    li t0, 50           # x = 50
    li t1, 10
    ble t0, t1, else    # if(x <= 10) goto else
    li t0, 100          # x = 100
    j end
else:
    li t0, 200          # x = 200
end:
```

`t0` comes out at 100. Change `li t0, 50` to `li t0, 5` and it comes out at 200 instead.

The `j end` is the flat version's `goto end`, and leaving it out is the most common bug in hand
written control flow: the program runs the true branch, walks straight into the false one and the
second answer wins.

## Which branch says which condition

Six of these are real instructions and the other four are the same six with the operands swapped,
which "Comparing without flags" takes apart. What matters when you are writing a program is the
table.

| the C condition | signed            | unsigned   |
| --------------- | ----------------- | ---------- |
| `a == b`        | `beq a, b, label` | the same   |
| `a != b`        | `bne a, b, label` | the same   |
| `a < b`         | `blt`             | `bltu`     |
| `a <= b`        | `ble`             | `bleu`     |
| `a > b`         | `bgt`             | `bgtu`     |
| `a >= b`        | `bge`             | `bgeu`     |
| `a == 0`        | `beqz a, label`   | the same   |
| `a != 0`        | `bnez a, label`   | the same   |
| `a < 0`         | `bltz a, label`   | never true |
| `a > 0`         | `bgtz a, label`   | `bnez`     |

Every one of them is one instruction and every one takes a **label**, and the assembler works out
the distance. A branch reaches about 4 kilobytes either way, which is a thousand instructions, so in
practice you write the label and forget about it. Past that the build says
`Branch target word address beyond 12-bit range` and you jump to a `j` instead, which reaches a
megabyte.

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

```riscv|playground
.text
main:
    li t0, 75           # score = 75
    li t1, 90
    bge t0, t1, grade_a # if(score >= 90) goto grade_a
    li t1, 60
    bge t0, t1, grade_b # if(score >= 60) goto grade_b
    li t2, 'C'          # grade = 'C'
    j done
grade_a:
    li t2, 'A'
    j done
grade_b:
    li t2, 'B'
done:
```

`t2` comes out at `00000042`, which is `0x42`, the ASCII code of `B`. The `li t1, 90` and
`li t1, 60` are there because every RISC-V branch compares two **registers**: there is no branch with
a constant in it, and the assembler will not put one there for you, so a comparison against a number
costs a `li` first.

Try changing `li t0, 75` to `li t0, 95` and to `li t0, 12` and watching `t2`.

## An if with no branch at all

MIPS has `movn` and `movz`, which copy a register only if a third one is or is not zero, so a
two-way choice between two values needs no jump. **RISC-V has no conditional move**, so the same
thing is done with arithmetic: `slt` gives you a 0 or a 1, `sub` from `zero` turns that into a mask
of all zeroes or all ones, and two `xor`s pick between the operands.

```riscv|playground
.text
main:
    li t0, -5
    li t1, 3
    slt t2, t0, t1      # 1 when t0 is the smaller
    sub t3, zero, t2    # 00000000 or FFFFFFFF, a mask
    xor t4, t0, t1      # the bits the two differ in
    and t4, t4, t3      # kept when the mask is all ones, dropped when it is 0
    xor t4, t4, t0      # so this is t0, or t0 flipped into t1
```

`t2` comes out at 1, `t3` at `FFFFFFFF` and `t4` at 3, the larger of the two. The `xor`, `and`, `xor`
is the standard trick for choosing without jumping: `a ^ ((a ^ b) & mask)` is `a` when the mask is
zero and `b` when it is all ones.

Five instructions where a branch takes three, so this is what you write when the jump itself is what
you are trying to avoid, which on a real pipelined chip is a branch the CPU cannot predict. When you
only want the 0 or the 1, `slt` on its own is already the whole `if`.

## Testing one bit

The M68K has `btst`, which tests a bit and sets a flag. RISC-V has no such instruction and no such
flag, so you compute the `and` into a register and branch on whether it came out zero.

```riscv|playground
.text
main:
    li t0, 10           # 1010 in binary
    andi t1, t0, 8      # keep bit 3
    beqz t1, clear
    li t2, 1            # bit 3 was set
    j done
clear:
    li t2, 0
done:
    andi t3, t0, 1      # bit 0, which is 0 in 1010
    bnez t3, odd
    li t4, 0            # so the number is even
    j finished
odd:
    li t4, 1
finished:
```

`t2` comes out at 1, because bit 3 of 1010 is set, and `t4` at 0, because bit 0 is not. `andi` with a
single bit set is C's `x & 8`, and `beqz` on the answer is C's `if (!(x & 8))`. The constant of
`andi` is 12 bits, so a bit above 11 has to go into a register with `li` first, or be brought down
with a shift.

For a bit whose position the program worked out, shift instead: `srl t1, t0, t2` brings bit `t2` down
to the bottom and `andi t1, t1, 1` keeps it.

## j, jal and jr

Three ways to go somewhere unconditionally, and all three are the same two instructions underneath.

- **`j label`** is `jal zero, label`: jump, and throw the return address away.
- **`jal label`** is `jal ra, label`: jump, and write the address of the next instruction into `ra`,
  which is a call.
- **`jr t0`** is `jalr zero, t0, 0`: jump to the address **in a register**, which is how a subroutine
  returns (`ret` is `jr ra` with the register spelled out) and how a program jumps through a table of
  addresses it computed.

A label is an address like any other, so a `.word` can hold one, and `lw` and `jr` between them turn
a `switch` into a table lookup.

```riscv|playground|memory
.data
table: .word case0, case1, case2

.text
main:
    li t0, 2            # i = 2
    la t2, table
    slli t3, t0, 2      # i * 4, since a table entry is a word
    add t3, t2, t3
    lw t4, 0(t3)        # the address of the case
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

`t1` comes out at 30 and `t4` at `0040002C`, the address of `case2`, which the assembler wrote into
the third word of `table` and the program read back out. Try changing `li t0, 2` to `li t0, 0` and
watching `t1` come out at 10.

A jump table is one load and one jump whatever the number of cases, where a chain of `bge` costs two
instructions per case it walks past. What it does not do is check the index: a `t0` of 7 reads a
word past the end of the table and jumps to whatever was there.

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
    bltz t0, negative   # if(x < 0)
    bgtz t0, positive   # if(x > 0)
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
    slli t3, t0, 2      # i * 4
    add t3, t2, t3      # &table[i]
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
