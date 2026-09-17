# Compare and branch

A program normally continues with the instruction immediately after the one it just executed.
Branch instructions can change that order. A **conditional branch** reads the current CCR flags and
chooses whether to go to a label. `cmp` is the usual way to prepare flags for comparing two values,
while `tst` prepares them for questions about one value.

The branch always reads flags that already exist. An immediately preceding `add` or `sub` may have
set exactly the flags the program needs, so an extra comparison is not always required.

## Labels, `bra`, and fall-through

A label names the address of an instruction. The unconditional branch has this form:

```text
bra label
```

`bra` always makes the instruction at the named label the next instruction:

```m68k|playground|pc|no-flags
    move.l #1, d0
    bra chosen
    move.l #99, d0      ; skipped
chosen:
    move.l #2, d1
```

After `bra chosen`, execution continues at `chosen:`. The skipped `move` never runs, so `d0`
remains 1 and `d1` becomes 2.

A conditional branch has the same label operand, but it can have either of two outcomes:

- When its condition is true, the branch is **taken** and execution continues at the label.
- When its condition is false, the branch is **not taken** and execution continues with the next
  instruction. Continuing this way is called **fall-through**.

For example, `beq somewhere` branches when the `Z` flag is 1. If `Z` is 0, execution falls through
to the line after `beq`.

## Compare two values with `cmp`

`cmp` prepares `N`, `Z`, `V`, and `C` by calculating a subtraction without storing its result:

```text
cmp.size source, destination
```

The calculation is `destination - source`. Both operands keep their values, and `X` is preserved.

| instruction     | subtraction used for the flags | values being compared |
| --------------- | ------------------------------ | --------------------- |
| `cmp.l #10, d0` | `d0 - 10`                      | `d0` against 10       |
| `cmp.l d1, d0`  | `d0 - d1`                      | `d0` against `d1`     |
| `cmp.l d0, d1`  | `d1 - d0`                      | `d1` against `d0`     |

Read the comparison destination first: `cmp.l #10, d0` followed by `blt` means “branch if `d0` is
less than 10.”

### Equality uses `Z`

Equal values produce a zero difference, so equality needs only the `Z` flag:

| branch | taken when | meaning after `cmp`  |
| ------ | ---------- | -------------------- |
| `beq`  | `Z = 1`    | the values are equal |
| `bne`  | `Z = 0`    | the values differ    |

Here is a forward if/else shape. The comparison is equal, so `beq equal` is taken and the first
assignment to `d2` is skipped:

```m68k|playground|pc
    move.l #7, d0
    move.l #7, d1

    cmp.l d1, d0       ; d0 - d1
    beq equal
    move.l #0, d2      ; false side: reached by fall-through
    bra done
equal:
    move.l #1, d2      ; true side: reached by the taken branch
done:
```

`d2` ends at 1. If the values differed, `beq` would fall through, set `d2` to 0, and `bra done`
would skip the true side. This is the basic if/else shape:

```text
    prepare flags
    conditional branch to true_side
    false-side instructions
    bra done
true_side:
    true-side instructions
done:
```

## Test one value with `tst`

`tst` prepares flags from one value without changing it. It sets `N` and `Z` from the selected
size, clears `V` and `C`, and preserves `X`.

After `tst`, four direct questions are useful:

| branch | taken when | question about the tested value   |
| ------ | ---------- | --------------------------------- |
| `beq`  | `Z = 1`    | is it zero?                       |
| `bne`  | `Z = 0`    | is it nonzero?                    |
| `bmi`  | `N = 1`    | is its signed value negative?     |
| `bpl`  | `N = 0`    | is its signed value non-negative? |

An if with no else can simply branch past its body. In this example, the body runs only when `d0`
is not zero:

```m68k|playground
    move.l #4, d0
    move.l #0, d1

    tst.l d0
    beq done
    move.l #1, d1
done:
```

Branch instructions preserve the CCR. A three-way sign check can therefore use two conditional
branches after one `tst`, with both branches reading the flags that `tst` prepared.

The instruction directly before a conditional branch only needs to have prepared the right flags.
For example, `sub.l d1, d0` followed immediately by `beq equal` can branch when the subtraction
produces zero. Use `cmp.l d1, d0` when both input values must remain unchanged.

## Signed relational conditions

For signed values, the highest bit can look negative even when a subtraction has overflowed. The
signed relational branches therefore read `N` together with `V`:

| relationship after `cmp`                    | branch | condition in the CCR |
| ------------------------------------------- | ------ | -------------------- |
| destination less than source                | `blt`  | `N ≠ V`              |
| destination greater than or equal to source | `bge`  | `N = V`              |
| destination greater than source             | `bgt`  | `Z = 0` and `N = V`  |
| destination less than or equal to source    | `ble`  | `Z = 1` or `N ≠ V`   |

The `V` part matters at the edge of a signed range. Consider a byte comparison of 127 with -1:

```m68k|playground
    move.l #127, d0
    cmp.b #-1, d0       ; $7F - $FF leaves the byte pattern $80
    bgt greater         ; taken: Z=0 and N=V=1
    move.l #0, d1
    bra done
greater:
    move.l #1, d1
done:
```

The byte-sized subtraction produces `$80`, whose highest bit sets `N`. It also crosses the signed
byte boundary, so `V` is set. Because `N` and `V` are equal and `Z` is clear, `bgt` correctly treats
127 as greater than -1. `d1` ends at 1.

## Unsigned relational conditions

For unsigned subtraction, `C` records whether a borrow was needed. If the destination is lower than
the source, the comparison needs a borrow and sets `C`. `Z` still records equality.

| relationship after `cmp`                  | branch | condition in the CCR |
| ----------------------------------------- | ------ | -------------------- |
| destination lower than source             | `blo`  | `C = 1`              |
| destination higher than or same as source | `bhs`  | `C = 0`              |
| destination higher than source            | `bhi`  | `C = 0` and `Z = 0`  |
| destination lower than or same as source  | `bls`  | `C = 1` or `Z = 1`   |

The same bits can represent different signed and unsigned values. The long pattern `$FFFFFFFF` is
-1 when signed and 4,294,967,295 when unsigned:

```m68k|playground
    move.l #$FFFFFFFF, d0

    cmp.l #1, d0
    bgt signed_greater      ; not taken: signed -1 is less than 1
    move.l #0, d1
    bra unsigned_test
signed_greater:
    move.l #1, d1

unsigned_test:
    cmp.l #1, d0
    bhi unsigned_higher     ; taken: unsigned $FFFFFFFF is higher than 1
    move.l #0, d2
    bra done
unsigned_higher:
    move.l #1, d2
done:
```

`d1` ends at 0 and `d2` ends at 1. Choose the branch family from the meaning of the values. Signed
differences and coordinates can go below zero. Addresses, sizes, and byte counts are normally
unsigned.

## Keep the flags next to the branch

A branch reads the current flags, even if a different instruction changed them after the
comparison:

```m68k|playground|pc
    move.l #5, d0
    cmp.l #5, d0        ; Z becomes 1
    move.l #7, d1       ; Z becomes 0
    beq equal           ; not taken
    move.l #100, d2
    bra done
equal:
    move.l #200, d2
done:
```

The `move` between `cmp` and `beq` replaces the comparison flags with flags describing the value 7.
The branch falls through, so `d2` ends at 100. Keep `cmp` or `tst` directly next to its branch
unless you already know that an intervening instruction preserves the needed flags. Here, moving
`move.l #7, d1` above the `cmp` fixes the control flow.

## Chain several decisions

Several forward comparisons can select one of several outcomes. This program assigns level 3 for a
signed score of at least 90, level 2 for at least 60, and level 1 otherwise:

```m68k|playground
    move.l #75, d0

    cmp.l #90, d0
    bge level_3
    cmp.l #60, d0
    bge level_2
    move.l #1, d1
    bra done
level_3:
    move.l #3, d1
    bra done
level_2:
    move.l #2, d1
done:
```

The first branch is not taken. Execution falls through to the comparison with 60, whose branch is
taken. `d1` therefore ends at 2. Each assigned outcome reaches `done`, so its value remains in
`d1`.

## Check your understanding

### 1. Classify negative, zero, and positive values

The three input values are in `d0`, `d2`, and `d4`. For each one, put -1 in the register beside it
when the input is negative, 0 when it is zero, and 1 when it is positive:

- classify `d0` into `d1`;
- classify `d2` into `d3`;
- classify `d4` into `d5`.

Use `tst`, conditional branches, `bra`, and `move.l`.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": -7,
        "d1": "0xDEADBEEF",
        "d2": 0,
        "d3": "0xDEADBEEF",
        "d4": 12,
        "d5": "0xDEADBEEF"
    },
    "expectedRegisters": {
        "d1": "0xFFFFFFFF",
        "d3": 0,
        "d5": 1
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    tst.l d0
    bmi first_negative
    beq first_zero
    move.l #1, d1
    bra first_done
first_negative:
    move.l #-1, d1
    bra first_done
first_zero:
    move.l #0, d1
first_done:

    tst.l d2
    bmi second_negative
    beq second_zero
    move.l #1, d3
    bra second_done
second_negative:
    move.l #-1, d3
    bra second_done
second_zero:
    move.l #0, d3
second_done:

    tst.l d4
    bmi third_negative
    beq third_zero
    move.l #1, d5
    bra third_done
third_negative:
    move.l #-1, d5
    bra third_done
third_zero:
    move.l #0, d5
third_done:
```

</details>

### 2. Select values using unsigned comparisons

Read both pairs as unsigned longs. Put the higher of `d0` and `d1` in `d4`. Put the lower of `d2`
and `d3` in `d5`. Each pair contains one value whose highest bit is set. The first selection takes
its conditional branch, while the second reaches its assignment by fall-through.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": "0xFFFFFFFF",
        "d1": 1,
        "d2": "0xFFFFFFFE",
        "d3": 2,
        "d4": "0xDEADBEEF",
        "d5": "0xDEADBEEF"
    },
    "expectedRegisters": {
        "d4": "0xFFFFFFFF",
        "d5": 2
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    cmp.l d1, d0
    bhi first_higher
    move.l d1, d4
    bra first_done
first_higher:
    move.l d0, d4
first_done:

    cmp.l d3, d2
    blo second_lower
    move.l d3, d5
    bra second_done
second_lower:
    move.l d2, d5
second_done:
```

</details>

### 3. Observe both equality paths

Compare `d0` with `d1` and put 1 in `d4` if they are equal, or 0 if they differ. Then compare `d2`
with `d3` and put the same kind of answer in `d5`. One pair is equal and the other is different.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": 44,
        "d1": 44,
        "d2": 44,
        "d3": 45,
        "d4": "0xDEADBEEF",
        "d5": "0xDEADBEEF"
    },
    "expectedRegisters": {
        "d4": 1,
        "d5": 0
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    cmp.l d1, d0
    beq first_equal
    move.l #0, d4
    bra first_done
first_equal:
    move.l #1, d4
first_done:

    cmp.l d3, d2
    bne second_different
    move.l #1, d5
    bra second_done
second_different:
    move.l #0, d5
second_done:
```

</details>

### 4. Trace a clobbered comparison

Without running the code, answer these questions about the flag-clobbering example above:

1. What value does the `cmp` place in `Z`?
2. What value does the following `move.l #7, d1` place in `Z`?
3. Is `beq equal` taken, and what value reaches `d2`?
4. Where can that `move` go so that `beq` reads the comparison flags?

<details>
<summary>Show answers</summary>

1. `cmp.l #5, d0` sets `Z` to 1 because the compared values are equal.
2. `move.l #7, d1` sets `Z` to 0 because 7 is nonzero.
3. `beq` is not taken, and `d2` becomes 100.
4. Move `move.l #7, d1` above the `cmp`.

</details>
