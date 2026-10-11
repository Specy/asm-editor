# Loops and dbra

A branch can go to a label above itself. That backward branch is what lets a group of instructions
run again.

Here is a loop that adds the values from 1 through 10. Read it as four jobs:

1. **Test before the body.** Leave when the current value is greater than 10.
2. **Body.** Add the current value to the total.
3. **Update.** Increase the current value by 1.
4. **Backward branch.** Return to the test.

```m68k|playground|pc
    move.l #0, d0       ; total = 0
    move.l #1, d1       ; current value = 1
loop_test:
    cmp.l #10, d1       ; compare the current value with 10
    bgt loop_done       ; leave when it is greater than 10
    add.l d1, d0        ; body: add the current value
    add.l #1, d1        ; update: move to the next value
    bra loop_test       ; backward branch: test again
loop_done:
```

The first two passes, the tenth pass, and the final test look like this:

| visit to `loop_test` | `d1` before the test | is `d1 > 10`? | body changes `d0` to | update changes `d1` to | next step      |
| -------------------- | -------------------: | ------------- | -------------------: | ---------------------: | -------------- |
| first                |                    1 | no            |                    1 |                      2 | branch back    |
| second               |                    2 | no            |                    3 |                      3 | branch back    |
| tenth                |                   10 | no            |                   55 |                     11 | branch back    |
| final test           |                   11 | yes           |      body is skipped |      update is skipped | leave the loop |

The backward `bra` does not decide whether the loop should continue. It simply returns to
`loop_test`. The `cmp` and `bgt` make the decision on every visit.

This loop terminates because `d1` changes on every pass: it increases by 1 and eventually becomes
11, which satisfies the exit condition. The body sees exactly the ten values 1 through 10, so it
runs ten times. If the initial value in `d1` were already 11, the first test would branch to
`loop_done`; the body and update would run zero times. Testing before the body gives a loop this
zero-pass possibility.

## Count passes with familiar instructions

Sometimes the body should run a fixed number of times. One register can hold the number of passes
still to perform. This version also adds 1 through 10, but `d1` is now a pass counter and `d2` holds
the value added by the body:

```m68k|playground|no-flags
    move.l #0, d0       ; total = 0
    move.l #10, d1      ; 10 passes remain
    move.l #1, d2       ; first value to add

    tst.l d1
    beq count_done      ; a requested count of 0 skips the body
count_loop:
    add.l d2, d0        ; body
    add.l #1, d2        ; prepare the next value
    sub.l #1, d1        ; one fewer pass remains
    bne count_loop      ; repeat while the count is not zero
count_done:
```

The `sub` is immediately before `bne`, so the branch reads the flags produced by the counter
update. The counter progresses like this:

| `d1` before the body | `d1` after `sub.l #1,d1` | action after the update |
| -------------------: | -----------------------: | ----------------------- |
|                   10 |                        9 | branch back             |
|                    9 |                        8 | branch back             |
|                  ... |                      ... | branch back             |
|                    2 |                        1 | branch back             |
|                    1 |                        0 | fall through            |

There are ten starting values from 10 down through 1, so there are ten body executions. The top
`tst` handles the separate case of zero requested passes before execution reaches the body.

## Let `dbra` update and test the counter

The M68K instruction `dbra Dn,label` combines the final two loop-control instructions. Its name is
commonly read as “decrement and branch again.” Its exact steps are:

1. Decrement only the low word of data register `Dn`.
2. If the new low word is not `$FFFF`, branch to `label`.
3. If the new low word is `$FFFF`, fall through to the next instruction.

`dbra` preserves the upper word of the register and does not change the CCR flags.

Because the decrement happens after the body, a counter starting at 9 gives ten passes:

```m68k|playground|no-flags
    move.l #0, d0       ; total = 0
    move.w #9, d1       ; 10 passes: initialize to 10 - 1
    move.l #1, d2       ; first value to add
loop:
    add.l d2, d0
    add.l #1, d2
    dbra d1, loop
```

| body execution | low word before `dbra` | low word after decrement | result       |
| -------------- | ---------------------: | -----------------------: | ------------ |
| first          |                `$0009` |                  `$0008` | branch       |
| second         |                `$0008` |                  `$0007` | branch       |
| ...            |                    ... |                      ... | branch       |
| ninth          |                `$0001` |                  `$0000` | branch       |
| tenth          |                `$0000` |                  `$FFFF` | fall through |

For an intended count of `N` passes, where `N` is from 1 through 65,536, initialize the counter's
low word to `N - 1`. The body then runs once for each low-word value from `N - 1` down through 0.
After the last execution, `dbra` changes the low word from 0 to `$FFFF` and leaves the loop. This is
the off-by-one rule to remember: **passes = initial low word + 1**.

### The counter is one word

Only the low 16 bits take part in the count. The upper 16 bits remain exactly as they were:

```m68k|playground|no-flags
    move.l #$ABCD0003, d1
    move.l #0, d0
loop:
    add.l #1, d0
    dbra d1, loop
```

The body runs four times, for the starting low-word values 3, 2, 1, and 0. At the end, `d0` is 4
and `d1` is `$ABCDFFFF`. The upper word `$ABCD` was preserved, while the low word reached the
ending value `$FFFF`.

A 16-bit word has 65,536 different bit patterns, so one `dbra` can control at most 65,536 passes.
That largest count starts with the low word `$FFFF`; after the first body execution it becomes
`$FFFE` and branches, and it eventually reaches 0 before the final decrement ends the loop.

### Guard a count that can be zero

The label in a `dbra` loop is normally placed at the body. Without an earlier guard, this body-first
shape always executes at least once: execution reaches the body before `dbra` gets its first chance
to test the counter. If a requested count can be zero, test it before preparing and entering the
loop:

```m68k|playground|no-flags
    move.l #0, d0       ; count the body executions
                       ; d2 holds the requested count, from 0 through 65536
    tst.l d2
    beq done            ; zero requested passes
    move.l d2, d1
    sub.l #1, d1        ; prepare N - 1
loop:
    add.l #1, d0
    dbra d1, loop
done:
```

With `d2` equal to 0, the branch reaches `done` and the body runs zero times. With `d2` equal to 1,
`d1` is prepared as 0, the body runs once, and `dbra` falls through after changing the low word to
`$FFFF`.

## Reset the inner counter in a nested loop

A loop can contain another loop. Each outer pass needs a fresh inner count, so the inner counter is
initialized at the beginning of every outer pass:

```m68k|playground|no-flags
    move.l #0, d0       ; count all inner-body executions
    move.w #2, d1       ; 3 outer passes
outer:
    move.w #3, d2       ; reset for 4 inner passes
inner:
    add.l #1, d0
    dbra d2, inner
    dbra d1, outer
```

The inner body runs four times during each of three outer passes, so `d0` ends at 12.

If `move.w #3,d2` were placed before `outer:`, only the first outer pass would begin with 3. That
first inner loop would leave the low word of `d2` at `$FFFF`. On the second outer pass, the body
would execute once before `dbra` changed `$FFFF` to `$FFFE` and branched. Including that first
execution, the inner body would run 65,536 times on that pass. The third outer pass would do the
same. The mistaken program would therefore finish with `d0` equal to 131,076 instead of 12.
Resetting `d2` inside the outer loop restores the intended four inner executions every time.

## Check your understanding

### 1. Test before the body

Write two top-tested loops using `cmp`, a conditional branch, an update, and a backward `bra`.

- `d0` starts at 4. Add each value from `d0` through 7 to `d1`, increasing `d0` by 1 after each
  addition. Initialize `d1` to 0. The loop should stop with `d0` equal to 8 and `d1` equal to 22.
- `d2` starts at 8 and `d3` contains a sentinel. Use the same upper limit of 7 and add `d2` to `d3`
  only inside the loop body. Because the first test should leave immediately, both registers must
  keep their starting values.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": 4,
        "d1": "0xDEADBEEF",
        "d2": 8,
        "d3": "0xA5A5A5A5"
    },
    "expectedRegisters": {
        "d0": 8,
        "d1": 22,
        "d2": 8,
        "d3": "0xA5A5A5A5"
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l #0, d1
sum_test:
    cmp.l #7, d0
    bgt sum_done
    add.l d0, d1
    add.l #1, d0
    bra sum_test
sum_done:

zero_test:
    cmp.l #7, d2
    bgt all_done
    add.l d2, d3
    add.l #1, d2
    bra zero_test
all_done:
```

</details>

### 2. Prepare a `dbra` counter

Make a `dbra` loop whose body adds 3 to `d0` exactly five times. `d0` starts at 0. The full value
of the counter register `d1` starts at `$A5A5BEEF`; initialize only its low word with the value that
gives five passes.

The final values should demonstrate all three parts of the rule: five body executions make `d0`
equal 15, `dbra` leaves the low word at `$FFFF`, and the upper word `$A5A5` is preserved.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": 0,
        "d1": "0xA5A5BEEF"
    },
    "expectedRegisters": {
        "d0": 15,
        "d1": "0xA5A5FFFF"
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.w #4, d1       ; five passes use an initial low word of five minus one
loop:
    add.l #3, d0
    dbra d1, loop
```

</details>
