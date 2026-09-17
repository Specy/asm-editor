# The M68K instruction set

An **instruction set** is the collection of operations a processor can perform. In M68K assembly,
the instruction name is a short word called a **mnemonic**. For example, `move` names the operation
that copies a value, while `add` names the operation that adds one value to another.

An instruction usually works with one or more **operands**: the values or registers named after the
mnemonic. The size suffix `.b`, `.w` or `.l` selects a byte, word or long, just as it did for `move`
in the previous lesson.

## A map of the instruction set

M68K instructions have several broad kinds of job:

- **Moving data** copies values between the places where a program keeps them.
- **Arithmetic** performs calculations such as addition and subtraction.
- **Logic and bit operations** work with the individual bits inside a value.
- **Comparing and testing** asks questions about values so that a program can make decisions.
- **Changing execution order** chooses which instruction the processor carries out next.
- **Processor and system operations** control parts of the machine beyond an ordinary calculation.

These categories organize instructions by the kind of work they perform. A practical starting set
has three instructions for calculating with register values: `move`, `add` and `sub`.

## Instructions have different shapes

Some instructions have two operands. The forms used in this lesson put the source first and the
destination second:

```text
name.size source, destination
```

The instruction decides what happens to the destination. `move` replaces it with a copy, while
`add` and `sub` update it with a calculated result. The source remains unchanged in all three forms
taught here.

Other instructions have one operand. You have already used the one-operand form `ext.w d0`, where
`d0` is the register changed by the instruction. Some M68K instructions use zero operands.
Each instruction form defines how many operands it needs and what each one means.

## Copy with `move`

`move` has this form:

```text
move.size source, destination
```

In the form used here, the source is a literal or a data register and the destination is a data
register. `move` copies the selected byte, word or long from the source into the destination. A byte
or word copy preserves the part of the destination register above the selected size. A long copy
replaces the whole register.

```m68k|playground|no-flags
    move.l #$12345678, d0   ; copy a literal into all of d0
    move.l #$AABBCCDD, d1   ; give d1 an explicit starting value
    move.w d0, d1           ; copy d0's low word into d1's low word
```

The first two lines establish the register values. The third copies `$5678` into the low word of
`d1`, making its full value `$AABB5678`.

## Add with `add`

For the register calculations in this lesson, `add` has this form:

```text
add.size source, destination
```

Here, the source is a literal or a data register and the destination is a data register. `add` adds
the selected source value to the selected part of the destination and writes the sum back to the
destination. The source is unchanged.

```m68k|playground|no-flags
    move.l #10, d0
    move.l #3, d1
    add.l d1, d0            ; d0 = 10 + 3
```

After these instructions, `d0` contains 13 and `d1` still contains 3.

The suffix controls the width of the calculation as well as the part of a data register that is
updated. A byte calculation updates only the low byte, a word calculation updates only the low word,
and a long calculation updates all 32 bits:

```m68k|playground|no-flags
    move.l #$11223310, d0
    move.l #$11223310, d1
    move.l #$11223310, d2

    add.b #$05, d0          ; d0 becomes $11223315
    add.w #$0020, d1        ; d1 becomes $11223330
    add.l #$00000100, d2    ; d2 becomes $11223410
```

The upper 24 bits of `d0` survive the byte addition, and the upper 16 bits of `d1` survive the word
addition. When a sum needs more room than the chosen size provides, the destination keeps the part
that fits within the selected byte, word or long. The upper part outside that size remains unchanged.

For example, when `d0` starts at `$AABBCCF0`, adding `$20` as a byte makes the low byte `$10` while
the upper three bytes remain `$AABBCC`:

```m68k|playground|no-flags
    move.l #$AABBCCF0, d0
    add.b #$20, d0          ; d0 becomes $AABBCC10
```

## Subtract with `sub`

For the register calculations in this lesson, `sub` has this form:

```text
sub.size source, destination
```

Here too, the source is a literal or a data register and the destination is a data register. `sub`
subtracts the selected source value from the selected part of the destination and writes the
difference back to the destination:

```text
destination = destination - source
```

```m68k|playground|no-flags
    move.l #10, d0
    move.l #3, d1
    sub.l d1, d0            ; d0 = 10 - 3
```

After these instructions, `d0` contains 7 and `d1` still contains 3. Source-first order matters
especially for subtraction: the value on the right is the one being reduced.

## Check your understanding

### 1. Preserve the starting values

`d0` starts at 9, `d1` starts at 4 and `d2` starts at `$DEADBEEF`. Copy `d0` into `d2`, then
subtract `d1` from `d2`. Use long-sized instructions. The final values in `d0` and `d1` must remain
unchanged.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": 9,
        "d1": 4,
        "d2": "0xDEADBEEF"
    },
    "expectedRegisters": {
        "d0": 9,
        "d1": 4,
        "d2": 5
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l d0, d2
    sub.l d1, d2
```

</details>

### 2. Add three different sizes

Each register starts at `$AABBFFF0`. Add the literal `$20` to `d0` as a byte, to `d1` as a word and
to `d2` as a long. The starting value makes the three sizes produce three different full-register
results.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": "0xAABBFFF0",
        "d1": "0xAABBFFF0",
        "d2": "0xAABBFFF0"
    },
    "expectedRegisters": {
        "d0": "0xAABBFF10",
        "d1": "0xAABB0010",
        "d2": "0xAABC0010"
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    add.b #$20, d0
    add.w #$20, d1
    add.l #$20, d2
```

</details>
