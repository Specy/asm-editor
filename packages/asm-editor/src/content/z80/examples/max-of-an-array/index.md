Eight signed bytes sit in memory. This program finds the largest one and its position in the array.
It keeps the best value so far in `c` and its index in `d`.

Open the program in the editor, choose **Build**, then use **Step** to watch the S and P/V flags
after each `cp (hl)`. You can also choose **Run** to see the final answer. The registers panel shows
hexadecimal values.

```z80|playground|memory|allow-open
count equ 8

    .org 0x8000
    ld hl, numbers  ; hl = address of the first element
    ld a, (hl)
    ld c, a         ; best = numbers[0]
    inc hl          ; next element to check
    ld d, 0         ; index of best
    ld e, 0         ; current index
    ld b, count-1   ; seven elements left
loop:
    inc e           ; move to the current element's index
    ld a, c         ; compare best with the byte at hl
    cp (hl)         ; set flags as if subtracting current from best
    jp pe, flipped  ; overflow: read S the other way around
    jp m, take      ; no overflow, negative: current is larger
    jr next
flipped:
    jp p, take      ; overflow, positive: current is larger
    jr next
take:
    ld a, (hl)
    ld c, a         ; save the new best
    ld d, e         ; save its index
next:
    inc hl          ; address of the next element
    djnz loop
    halt

    .org 0x9000
numbers: .db -100, 37, -4, 8, 99, -50, 2, 60
```

The first element goes into `c` before the loop. That gives the program a real value from the array
to compare against, even if every element is negative. Starting the best at zero would leave zero
as the answer for an all-negative array, although zero might not occur in it. `hl` then moves past
the first byte, so `b` starts at `count-1`: seven comparisons remain.

`cp (hl)` compares by calculating `best - current` for the flags; it leaves `a` and `c` unchanged.
For signed bytes, a negative result normally means the current element is larger. But an 8-bit
subtraction can wrap past the signed range of -128 through 127. Then the S flag describes the sign
of the wrapped byte, and P/V is set to report the overflow. These three comparisons show why both
flags matter:

| Best in `c` | Current at `(hl)` | Subtraction and wrapped byte | S   | P/V | Route                      |
| ----------- | ----------------- | ---------------------------- | --- | --- | -------------------------- |
| -100        | 37                | -137 wraps to `77` (+119)    | 0   | 1   | `pe` then `p`: take 37     |
| 37          | -4                | 41 is `29` (+41)             | 0   | 0   | neither jump: keep 37      |
| 99          | -50               | 149 wraps to `95` (-107)     | 1   | 1   | `pe`, then no `p`: keep 99 |

In the first row, -100 really is less than 37, despite the positive-looking wrapped result. In the
last row, 99 really is greater than -50, despite the negative-looking result. `jp pe` takes the
overflow route when P/V is set. With no overflow, `jp m` takes the new value when S is set. With
overflow, `jp p` takes it when S is clear. Thus a new value wins exactly when S and P/V differ.
The Z80 has no `jr pe`, `jr m`, or `jr p`, so those branches use `jp`.

The final best is 99, which appears as `63` in `c`. It is element 4 when counting from index 0,
so `d` is `04`. After the loop checks element 4, `e` continues through 5, 6, and 7, while `d`
stays at 4. The panel ends with `bc = 0063` and `de = 0407`.

Try treating the same bytes as _unsigned_: replace the five jumps in the comparison and the
`flipped:` label with just `jr nc, next`. Build and run, then predict `c` and `d` before looking at
the panel. `nc` means the comparison needed no borrow, so the current byte replaces the best only
when it is larger as an unsigned value.

<details>
<summary>Check your answer</summary>

`-4` is stored as `FC`, or 252 when read as unsigned. It is larger than every other byte here, so
the unsigned version ends with `c = FC` and `d = 02`.

</details>
