The CPU has no `if`. It has one trick: carry on to the next instruction, or go somewhere else
instead. Everything shaped like a decision is built from that, and it always takes two instructions,
a `cmp` that sets the flags and a `b<cc>` that reads them and decides whether to jump.

## cmp source, destination computes destination minus source

This is the part everybody gets backwards at least once. `cmp.l #10, d0` subtracts 10 **from** `d0`,
so the branch after it is talking about `d0` against 10, even though 10 is what you wrote first.

| you write       | it subtracts | the branch after it is asking about |
| --------------- | ------------ | ----------------------------------- |
| `cmp.l #10, d0` | `d0 - 10`    | `d0` against 10                     |
| `cmp.l d1, d0`  | `d0 - d1`    | `d0` against `d1`                   |
| `cmp.l d0, d1`  | `d1 - d0`    | `d1` against `d0`                   |

The trick that makes it readable is to say the operands out loud in the other order, destination
first. `cmp.l #10, d0` then `blt` reads as "if `d0` is less than 10, jump".

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

Watch the **PC** marker as you step: it goes from the `blt` straight to `smaller:`, and the two lines
in between never run at all. That is the whole of what a branch does.

The comparison instructions come in the same family shapes as the arithmetic ones:

- **`cmp`** compares anything with a register.
- **`cmpi`** compares an immediate with a memory operand or a register, and `cmp.l #10, d0` is
  assembled as one of these.
- **`cmpa`** compares with an address register, which `cmp.l a1, a0` becomes.
- **`cmpm`** compares two memory operands through `(a0)+` and `(a1)+`, which is how you compare two
  strings without loading either byte into a register.
- **`tst`** compares one operand with zero, which is `cmp #0` written shorter.

## Two families of conditions

The fourteen conditions split into a **signed** group and an **unsigned** group. Both of them
assemble, both of them run, and picking the wrong one gives you a program that works on most of your
test data and is wrong on the rest.

| if you mean the values to be      | greater | greater or equal | less             | less or equal |
| --------------------------------- | ------- | ---------------- | ---------------- | ------------- |
| signed, so they can be below zero | `bgt`   | `bge`            | `blt`            | `ble`         |
| unsigned, so they cannot          | `bhi`   | `bhs` (or `bcc`) | `blo` (or `bcs`) | `bls`         |

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

`d1` ends at 0 and `d2` at 1, out of the same comparison of the same two values, run twice. Neither
branch is broken. They were asked different questions.

The rule of thumb: addresses, sizes, counts of bytes and anything you built out of a `lea` are
unsigned; differences, coordinates and anything that can go below zero are signed.

## tst and the zero flag

`tst.l d0` sets `N` and `Z` from `d0` itself, which is what you want before `beq`, `bne`, `bmi` and
`bpl`. Any instruction that writes the flags does the same job, so a program that has just computed
something into `d0` can branch on it with no `tst` at all.

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

Both branches are taken. The `tst.l d0` on the second line is not doing any work, because the
`move.l #0, d0` above it already put `Z` where it needed to be; it is there so that the line above
the branch says what the branch is asking.

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

Read that program and it looks correct: it compares, then it branches. `d2` comes out at 100 anyway.
Step through it with the flags panel open and you can watch `Z` go to 1 after the `cmp` and straight
back to 0 after the `move`, three lines before anything reads it.

Two ways out. Move the `move.l #7, d1` above the `cmp`, which is what you normally do. Or use one of
the instructions that leave the flags alone: `lea`, `movea`, `adda`, `suba`, `exg` and `movem` all
sit happily between a comparison and its branch, which is why `lea` rather than `move` is how you
work out an address in the middle of one.

## A chain of conditions

Now something with three outcomes. A score of 90 or more is an `A`, 60 or more is a `B`, and
anything else is a `C`.

Written out as instructions, each test jumps to its own answer, and each answer jumps to the end so
it does not run into the answer below it:

```m68k|playground
    move.l #75, d0          ; score = 75
    cmp.l #90, d0
    bge grade_a             ; 90 or more, go and set an A
    cmp.l #60, d0
    bge grade_b             ; 60 or more, go and set a B
    move.l #'C', d1         ; neither, so C
    bra end
grade_a:
    move.l #'A', d1
    bra end
grade_b:
    move.l #'B', d1
end:
```

`d1` comes out at `00000042`, which is the ASCII code of `B`.

Every answer ends with a `bra end` except the last one written, which reaches `end` by falling off
its own bottom. Forgetting one of those `bra` instructions is the most common bug in hand written
control flow, and it is a quiet one: the program sets the right answer, then runs straight on into
the next answer and overwrites it. Delete the `bra end` after `move.l #'A', d1` and run it with a
score of 95 to see a program that gets `A` right and then hands you a `B`.

## bra, jmp and the branchless answer

`bra label` is the unconditional jump. `bra` and every `b<cc>` store the **distance** from here to
the label rather than the label's address, which is why a branch can also carry a size: `.s` or `.b`
for a short hop, `.w` or `.l` for a longer one. That size describes the distance, not an operand.

`jmp` is the other way to leave. It carries a full address and can go anywhere, including an address
worked out while the program runs: `jmp (a0)` jumps to whatever `a0` is holding at that moment, which
is what a jump table is built out of.

When the two sides of a decision are one value each, you can skip the branching entirely. `s<cc>`
writes the answer straight into a byte: `cmp.l d1, d0` followed by `sgt d2` leaves `$FF` in `d2` when
`d0` is the greater and `$00` when it is not, and nothing jumped anywhere.

## Your turn

`d0` holds -5 and `d1` holds 3. Put the larger of the two in `d2`, reading them as **signed**
numbers.

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
    bge done            ; if d0 is at least d1, it was
    move.l d1, d2       ; otherwise take d1
done:
```

</details>

This one has three outcomes, so it needs a chain. Leave the **sign** of `d0` in `d1`: -1 if `d0` is
negative, 0 if it is zero, 1 if it is positive. `d0` is -7 in the test, so `d1` should end at
`$FFFFFFFF`.

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
    beq zero            ; zero has its own answer
    bmi negative        ; and so does negative
    move.l #1, d1       ; what is left is positive
    bra done
negative:
    move.l #-1, d1
    bra done
zero:
    clr.l d1
done:
```

</details>
