This program fills ten words in memory with the numbers 1 through 10. `a0` holds the address of
the word to write, `d0` holds the next value, and `d1` counts the loop passes.

```m68k|playground|memory|no-flags|allow-open
count equ 10

    lea numbers, a0     ; address of the first word
    move.w #count-1, d1 ; 9 gives ten passes with dbra
    move.w #1, d0       ; first value to write
fill:
    move.w d0, (a0)     ; write d0 to memory at the address in a0
    addq.l #2, a0       ; advance to the next word
    addq.w #1, d0       ; prepare the next value
    dbra d1, fill

    org $2000
numbers: ds.w count
```

`org $2000` places `numbers` at address `$2000`. `ds.w count` reserves ten words there: 20 bytes
starting at `$2000`. It gives them no values during Build. In this simulator, those bytes initially
show as `FF` in the memory panel. The loop supplies their values when the program runs.

`lea numbers, a0` puts the first word's address in `a0`. In `move.w d0, (a0)`, `(a0)` accesses
memory at the address in `a0`; it does not write into the address register itself. Each `move.w`
writes two adjacent bytes. Then `addq.l #2, a0` advances the address by two bytes so the next
write starts at the next word. If it advanced by only one byte, the next word write would start at
an odd address, which this M68K does not allow.

## Run it and inspect memory

Select **Build**, then **Run**. In the memory panel, enter `2000` in the address box. Each pair of
adjacent bytes forms one word, with its first byte at the address shown below:

| word   | starting address | bytes after Run | value       |
| ------ | ---------------- | --------------- | ----------- |
| first  | `$2000`          | `00 01`         | `0001` (1)  |
| second | `$2002`          | `00 02`         | `0002` (2)  |
| tenth  | `$2012`          | `00 0A`         | `000A` (10) |

The other words follow the same pattern at `$2004`, `$2006`, and so on. The last word ends at
`$2013`, inside the 20 bytes reserved from `$2000` through `$2013`.

## Step through the loop

Select **Build** again to reset the program, then select **Step** once per instruction. After the
first three instructions, `a0` shows `00002000`, `d0` shows `00000001`, and `d1` shows `00000009`
in the registers panel. These displays are hexadecimal without `0x`.

On the first visit to `fill`, `move.w` writes `0001` at `$2000`. The next two instructions change
`a0` to `00002002` and `d0` to `00000002`. Then `dbra` decrements the low word of `d1` from 9 to 8
and branches back to `fill`. On the final pass, it decrements that low word from 0 to `$FFFF`
(word value -1) and falls through. Starting at `count-1`, or 9, therefore gives ten writes. At
the end, `a0` shows `00002014`, `d0` shows `0000000B`, and `d1` shows `0000FFFF`. The address in
`a0` is then just past the reserved space; the loop does not write there.

## Try it

Change `count equ 10` to `count equ 5`. Before selecting **Build** and **Run** again, predict the
five words in memory and the final values of `a0`, `d0`, and `d1`.

<details>
<summary>Show answer</summary>

The words at `$2000`, `$2002`, `$2004`, `$2006`, and `$2008` are `0001` through `0005`.
`ds.w count` now reserves ten bytes, ending at `$2009`. At the end, `a0` is `0000200A`, `d0` is
`00000006`, and `d1` is `0000FFFF`.

</details>
