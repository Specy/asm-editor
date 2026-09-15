A loop is a jump backwards, and we already have jumps. What the Z80 adds is one instruction that does
the counting and the jumping together, and it is the reason `b` is the register it is.

## A counted loop, written out

Say you want to do something ten times. Written out by hand, the loop is four pieces:

- a counter, set to its starting value before the loop begins,
- a **test** at the top, which leaves the loop when the counter has gone far enough,
- the body, whatever the loop is actually for,
- a jump back to the test.

That last jump is what makes it a loop. Everything else is ordinary straight line code, and the only
new idea is that a label can be **behind** you as well as ahead of you.

Here it is with the counter in `b`. The comparison has to go through `a`, because `cp` compares
against the accumulator and nothing else.

```z80|playground
    .org 0x8000
    ld b, 0         ; i = 0
loop:
    ld a, b         ; the comparison has to go through a
    cp 10
    jr nc, done     ; 10 or more: leave the loop
    inc b           ; the body: count one on
    jr loop         ; and back to the test
done:
    halt
```

Three of those four instructions are the loop and one is the body. Three quarters of the program is
spent on counting, which is why the next instruction exists.

## djnz

`djnz label` means **decrement `b` and jump if it is not zero**. One instruction, two bytes, and it
replaces the `dec`, the test and the jump.

```z80|playground
    .org 0x8000
    ld b, 5         ; five times round
    ld a, 0
first:
    add a, 3        ; the body
    djnz first      ; b--, and go again while b is not zero

    ld b, 0         ; and this is not "no iterations"
    ld c, 0
second:
    inc c           ; c counts how many times we went round
    djnz second
    halt
```

`a` comes out at `0F`, which is 15, five threes. The counter is **always `b`**, there is no form that
counts in another register, and the jump is **always relative**, so the loop body has to fit in the
128 bytes a `jr` reaches.

Two things follow from `b` being the counter. A loop counts **down**, from the number of iterations
to zero, so if the body needs to know which iteration it is on it has to work it out or keep a second
counter. And `b` is not available to the body, which is what the nested loop below is about.

The third thing is the edge case, which is the second loop in that program. `djnz` decrements first
and then tests, so **`b` at 0 gives 256 iterations**, not none: the first `dec` takes 0 down to 255
and the loop runs the whole way round. `c` comes out at `00`, because it went from 0 all the way
round to 0 again, which is what a byte does after 256 increments. Put `ld c, 1` in that body instead
of the `inc` and step it if you want to watch `b` count down from `FF`.

So a `djnz` loop always runs at least once. If the count can legitimately be zero, and "do it no
times" has to mean no times, the loop needs a test in front of it: `ld a, b`, `or a`, `jr z, skip`.

## Walking memory

The loop that turns up most is one pointer stepping through bytes, and it is `hl` and `inc hl` next
to a `djnz`.

```z80|playground|memory
    .org 0x8000
    ld hl, numbers  ; hl = the start of the array
    ld b, 5         ; five of them
    ld a, 0         ; sum = 0
loop:
    add a, (hl)     ; add the byte hl points at
    inc hl          ; on to the next byte
    djnz loop
    halt

    .org 0x9000
numbers: .db 1, 2, 3, 4, 5
```

`hl` finishes at `9005`, one byte past the last element it read, which is where a walk always ends
up: the pointer is stepped after the last read as well as after the others.

## Looping on something other than a count

A loop that stops on a value instead of a count has no counter at all. Scanning a string for its zero
terminator is the standard one:

```z80|playground|memory
    .org 0x8000
    ld hl, message  ; hl = the start of the string
    ld b, 0         ; n = 0
loop:
    ld a, (hl)      ; the byte hl points at
    or a            ; is c zero?
    jr z, done      ; a zero byte is the end of the string
    inc b           ; n++
    inc hl          ; on to the next byte
    jr loop
done:
    halt

    .org 0x9000
message: .asciz "hello"
```

`b` comes out at `05`. `or a` is the "is `a` zero" idiom from the flags lecture: it leaves `a` alone
and sets `Z` from it, and it is one byte where `cp 0` is two.

## Counting past 255, and nesting

`b` is a byte, so `djnz` counts to 256 and no further. A longer loop counts in a pair, and here the
Z80 gets awkward: **`dec bc` sets no flags**, so there is nothing to jump on afterwards. The way
round it is to `or` the two halves together, since `b | c` is zero exactly when both are.

`djnz` also owns `b`, so an inner `djnz` destroys the outer loop's counter, and the usual fix is to
push it. Both problems are in this one, the long count first and the nested pair second.

```z80|playground|memory
    .org 0x8000
    ld bc, 300      ; three hundred times round
    ld hl, 0
long:
    inc hl          ; the body
    dec bc          ; bc--, and no flag is written
    ld a, b
    or c            ; is bc zero?
    jr nz, long

    ld hl, 0        ; a counter of how many times the nested body ran
    ld b, 3         ; the outer loop, three times
outer:
    push bc         ; the outer counter, kept safe
    ld b, 4         ; the inner loop, four times
inner:
    inc hl          ; the body
    djnz inner
    pop bc          ; and the outer counter comes back
    djnz outer
    halt
```

`hl` reaches `012C`, which is 300, at the end of the first loop, and comes out at `000C`, which is
12, three times four, at the end of the second. Step through it to see both.

The three instructions in the middle of the first loop are the price of a 16 bit counter, and they
destroy `a`, which is why a loop like this keeps its working value in `hl` or in memory. For copying
and searching there is a better answer, which the instruction set lecture already showed: `ldir` and
`cpir` count in `bc` themselves and cost one instruction.

`push bc` and `pop bc` in the second loop are two bytes and eleven clock cycles each on a real Z80,
which is cheap next to a loop body.

The other way is to keep the outer counter somewhere `djnz` cannot reach: `c`, `d`, `e`, the shadow
set through `exx`, or a byte in memory. Counting down `c` with `dec c` and `jr nz` costs three bytes
in the loop instead of two pushes outside it, so which is cheaper depends on how often the outer loop
goes round.

## Two loops to write

Add up the numbers from 1 to 10 and leave the total in `a`, which is 55, or `37` in hexadecimal. A
`djnz` loop counts down from 10 to 1, and adding the counter itself each time round is the whole
program.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "a": "0x37" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld b, 10        ; i = 10
    ld a, 0         ; sum = 0
loop:
    add a, b        ; sum = sum + i
    djnz loop       ; i--, while i != 0
    halt
```

</details>

The second one has the string already written for you and `hl` already pointing at it. Count its
characters, not counting the zero at the end, and leave the count in `b`. The answer is 5.

```z80|playground|exercise|memory
    .org 0x8000
    ld hl, message
    ; your code here
    halt

    .org 0x9000
message: .asciz "hello"
```

```testcase
{
    "expectedRegisters": { "bc": "0x0500" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld hl, message
    ld b, 0         ; n = 0
loop:
    ld a, (hl)      ; the byte hl points at
    or a
    jr z, done      ; a zero byte is the end of the string
    inc b           ; n++
    inc hl          ; on to the next byte
    jr loop
done:
    halt

    .org 0x9000
message: .asciz "hello"
```

</details>
