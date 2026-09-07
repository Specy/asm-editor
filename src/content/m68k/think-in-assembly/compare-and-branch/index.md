An `if` in C becomes a `goto`, and a `goto` becomes two M68K instructions: a `cmp` that sets the
flags and a `b<cc>` that reads them. The `cmp` takes its operands in the order that reads backwards,
and the branches come in a signed family and an unsigned one.

## cmp source, destination computes destination minus source

`cmp.l #10, d0` subtracts 10 from `d0`, throws the answer away and keeps the flags. So the branch
after it talks about **`d0` against 10**, in that order, even though 10 is what you wrote first.

```m68k|playground|pc
    move.l #3, d0
    cmp.l #10, d0       ; d0 - 10
    blt smaller         ; taken, because 3 - 10 is negative
    move.l #999, d1     ; skipped
    bra end
smaller:
    move.l #1, d1
end:
```

`blt` after that `cmp` means "if `d0` < 10", and `d1` comes out at 1. Read the pair as one sentence
with the operands swapped back, `d0` first: `cmp.l #10, d0` / `blt` is `if (d0 < 10) goto`.

Try changing `move.l #3, d0` to `move.l #30, d0` and stepping through it. The branch is not taken,
`d1` gets 999 and the `bra end` jumps over the label.

The comparison instructions come in the same family shapes as the arithmetic ones:

- **`cmp`** compares anything with a register.
- **`cmpi`** compares an immediate with a memory operand or a register, and `cmp.l #10, d0` is
  assembled as one of these.
- **`cmpa`** compares with an address register, which `cmp.l a1, a0` becomes.
- **`cmpm`** compares two memory operands through `(a0)+` and `(a1)+`, which is how you compare two
  strings without loading either byte into a register.
- **`tst`** compares one operand with zero, which is `cmp #0` written shorter.

## Two families of conditions

The fourteen conditions split into a **signed** group and an **unsigned** group, and picking the
wrong one gives a working program with wrong answers.

| in C, if the values are | branch when greater | greater or equal | less             | less or equal |
| ----------------------- | ------------------- | ---------------- | ---------------- | ------------- |
| signed (`int`)          | `bgt`               | `bge`            | `blt`            | `ble`         |
| unsigned (`unsigned`)   | `bhi`               | `bhs` (or `bcc`) | `blo` (or `bcs`) | `bls`         |

`beq` and `bne` belong to neither, because equality is the same question either way. `bmi`, `bpl`,
`bvs` and `bvc` read one flag each, and the full table of which flags every condition reads is in
[the condition code register](/learn/courses/m68k/introduction/the-condition-code-register).

```m68k|playground
    move.l #$FFFFFFFF, d0   ; -1 signed, 4294967295 unsigned
    cmp.l #1, d0
    bgt signed_bigger       ; not taken: -1 is not greater than 1
    move.l #0, d1
    bra next
signed_bigger:
    move.l #1, d1
next:
    cmp.l #1, d0
    bhi unsigned_bigger     ; taken: 4294967295 is higher than 1
    move.l #0, d2
    bra end
unsigned_bigger:
    move.l #1, d2
end:
```

`d1` comes out at 0 and `d2` at 1, from the same two `cmp` instructions on the same two values. The
rule of thumb: addresses, sizes, counts of bytes and anything you built out of a `lea` are unsigned;
differences, coordinates and anything that can go below zero are signed.

## tst and the zero flag

`tst.l d0` sets `N` and `Z` from `d0` itself, which is what you want before `beq`, `bne`, `bmi` and
`bpl`. Any instruction that writes the flags does the same job, so a program that has just computed
something into `d0` can branch on it without a `tst` at all.

```m68k|playground
    move.l #0, d0
    tst.l d0            ; is d0 zero?
    beq is_zero
    move.l #1, d1
    bra next
is_zero:
    move.l #2, d1
next:
    move.l #-4, d2
    tst.l d2            ; is d2 negative?
    bmi is_negative
    move.l #1, d3
    bra end
is_negative:
    move.l #2, d3
end:
```

Both branches are taken, so `d1` and `d3` both come out at 2. The `tst.l d0` on the second line is
not needed, because the `move.l #0, d0` above it already set `Z`; it is written out because a program
you can read is worth two instructions.

## The instruction in between

A flag says what the **last** instruction did. Put anything that writes the flags between your `cmp`
and your `b<cc>` and the branch reads that instead.

```m68k|playground|pc
    move.l #5, d0
    cmp.l #5, d0        ; Z goes to 1
    move.l #7, d1       ; and this move puts it straight back to 0
    beq equal           ; so the branch is not taken
    move.l #100, d2
    bra end
equal:
    move.l #200, d2
end:
```

`d2` comes out at 100, and the program looks right. Step through it with the flags panel open and
`Z` goes to 1 after the `cmp` and back to 0 after the `move`.

Two ways out. Move the `move.l #7, d1` above the `cmp`, which is what you normally do. Or use one of
the instructions that leave the flags alone: `lea`, `movea`, `adda`, `suba`, `exg` and `movem` all
sit happily between a comparison and its branch, which is why `lea` rather than `move` is how you
work out an address in the middle of one.

## A chain of conditions

`else if` is a second comparison at the label the first branch fell through to. In C:

```c
char grade;
if (score >= 90)      grade = 'A';
else if (score >= 60) grade = 'B';
else                  grade = 'C';
```

Flattened, each test jumps to its own answer and each answer jumps to the end:

```m68k|playground
    move.l #75, d0          ; score = 75
    cmp.l #90, d0
    bge grade_a             ; if(score >= 90) goto grade_a
    cmp.l #60, d0
    bge grade_b             ; if(score >= 60) goto grade_b
    move.l #'C', d1         ; grade = 'C'
    bra end
grade_a:
    move.l #'A', d1
    bra end
grade_b:
    move.l #'B', d1
end:
```

`d1` comes out at `00000042`, which is `$42`, the code of `B`. Every branch of the chain ends with a
`bra end` except the last one written, which falls into `end` on its own. Forgetting one of those
`bra` instructions is the most common bug in hand written control flow: the program runs the next
answer as well and the last one wins.

Try changing `move.l #75, d0` to `move.l #95, d0` and to `move.l #12, d0` and watching `d1`.

## bra, jmp and the branchless answer

`bra label` is the unconditional jump, and `jmp` is the other one. On a real 68000 `bra` and every
`b<cc>` encode the distance from here to the label, which keeps them short and puts a limit on how
far they can reach. `jmp` carries a full address and can go anywhere, including an address worked out
while the program runs: `jmp (a0)` jumps to whatever `a0` holds. In this simulator both reach
everywhere, and `jmp (a0)` is still what a jump table is built out of.

When the two sides of an `if` are one value each, `s<cc>` writes the answer without any branch at
all: `cmp.l d1, d0` followed by `sgt d2` leaves `$FF` in `d2` when `d0` is greater, which is C's
`d2 = (d0 > d1)`.

## Your turn

The test starts `d0` at -5 and `d1` at 3, and wants the larger of the two, read as **signed**
numbers, in `d2`.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": -5, "d1": 3 },
    "expectedRegisters": { "d2": 3 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l d0, d2       ; assume d0 is the larger
    cmp.l d1, d0        ; d0 - d1
    bge done            ; if(d0 >= d1) it was
    move.l d1, d2       ; otherwise take d1
done:
```

</details>

The second one starts `d0` at -7 and wants its sign in `d1`: -1 when `d0` is negative, 0 when it is
zero and 1 when it is positive. Since `d0` is -7 here, `d1` comes out at `$FFFFFFFF`.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": -7 },
    "expectedRegisters": { "d1": "0xFFFFFFFF" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    tst.l d0
    beq zero            ; if(d0 == 0) goto zero
    bmi negative        ; if(d0 < 0) goto negative
    move.l #1, d1       ; d1 = 1
    bra done
negative:
    move.l #-1, d1      ; d1 = -1
    bra done
zero:
    clr.l d1            ; d1 = 0
done:
```

</details>
