# Loops and `djnz`

A program normally goes from one written instruction to the next. A **loop** repeats a section by
jumping back to a label before that section. The instructions between the label and the backward
jump are the **body** of the loop.

A loop also needs a way to decide when to stop. A count is a simple choice: do the body while a
counter is not zero.

## A loop written out

This program adds 3 to `a` five times. `b` is its counter. It starts at 5, and each trip through the
body reduces it by one.

```z80|playground
    .org 0x8000
    ld b, 5         ; five trips through the body
    ld a, 0
loop:
    add a, 3        ; the body
    dec b           ; one fewer trip remains
    jr nz, loop     ; go back while b is not zero
    halt
```

Follow the first trip in order. Execution reaches `loop`, adds 3, changes `b` from 5 to 4, then
`jr nz, loop` takes the backward jump because `dec b` left `Z` clear. When `b` finally becomes 0,
`dec b` sets `Z`; the jump is not taken and execution continues at `halt`.

The label is nearby, so `jr` is suitable. The assembler works out the short backward distance to
`loop`.

## `djnz`: count down and jump

The Z80 has an instruction for this common pattern:

```z80
    djnz label
```

`djnz` means **decrement `b`, then jump to `label` if `b` is not zero**. It always uses `b` as its
counter. Keep the count in `b` for the loop, and do not change `b` in the body unless changing the
count is the job of that instruction.

Here is the same five additions with `djnz`:

```z80|playground
    .org 0x8000
    ld b, 5
    ld a, 0
loop:
    add a, 3        ; the body
    djnz loop       ; b becomes 4, 3, 2, 1, then 0
    halt
```

After the fifth addition, `djnz` changes `b` from 1 to 0 and does not jump. `a` holds 15, shown as
`0F` in the registers panel, and `b` holds `00`.

Put the body before `djnz`. The instruction performs its decrement and test after that body has
run, so a positive count gives exactly that many body executions.

## A count of zero

`djnz` decrements before it tests. A starting count of 0 therefore does not mean zero trips: the
first `djnz` changes `b` from `00` to `FF` and jumps back. The body runs 256 times before `b`
returns to zero.

When a count can be zero and zero must skip the body, test it before entering the loop. In this
example, `b` contains the requested count and `c` will count completed trips.

```z80|playground
    .org 0x8000
    ld b, 0         ; requested count; try 4 as well
    ld c, 0
    ld a, b
    or a
    jr z, done      ; with b = 0, skip the body
loop:
    inc c
    djnz loop
done:
    halt
```

`ld a, b` copies the count so that `or a` can set `Z`. With the shown starting value, the jump goes
to `done` and `c` stays 0. Change the first line to `ld b, 4`: the body runs four times, leaving
`c` at 4 and `b` at 0.

## Try it yourself

Add the numbers from 10 down to 1 and leave the total in `a`. The total is 55, or `37` in
hexadecimal. Start `b` at 10, add it to `a` in the body, and let `djnz` count down.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "a": "0x37", "b": "0x00" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld b, 10
    ld a, 0
loop:
    add a, b
    djnz loop
    halt
```

</details>

For a second loop, fill three consecutive byte locations starting at `0x9000` with `0x2A`. Start
`hl` at the first location. The body writes one byte, then moves `hl` to the next location. Use `b`
as the count.

```z80|playground|exercise|memory
    .org 0x8000
    ld hl, 0x9000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "b": "0x00", "hl": "0x9003" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": ["0x2A", "0x2A", "0x2A"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld hl, 0x9000
    ld b, 3
loop:
    ld (hl), 0x2A
    inc hl
    djnz loop
    halt
```

</details>
