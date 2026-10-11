This program finds the length of `Assembly is fun`. The text starts at `$2000` and has a zero byte
after its last character. `a0` walks through the bytes, `d1` remembers the starting address, and
`d0` receives the length: 15.

In this course, a string uses that zero byte as its end marker. The program has to read until it
finds the marker; the characters have no separate count stored beside them.

```m68k|playground|memory|allow-open
    lea text, a0        ; address of the first character
    move.l a0, d1       ; remember where the string starts
scan:
    tst.b (a0)+         ; test one byte, then advance a0
    bne scan            ; repeat if that byte was not zero
    move.l a0, d0       ; address just past the zero byte
    sub.l d1, d0        ; bytes crossed, including the zero
    subq.l #1, d0       ; exclude the zero from the length

    org $2000
text: dc.b 'Assembly is fun', 0
```

`tst.b` sets the `Z` flag according to the byte it reads: `Z=0` for a nonzero character and `Z=1`
for the zero marker. It does not change that byte. The `+` in `(a0)+` advances `a0` by one **after**
the read, even when the byte is zero. `bne` branches when `Z=0`, so the loop stops only after it has
read the marker.

## Run it and follow the addresses

Select **Build**, then **Run**. In the registers panel, `d0` shows `0000000F` (hexadecimal `$F` is
decimal 15). `d1` shows `00002000`, and `a0` shows `00002010`. The register display uses hexadecimal
without `0x`.

Select **Build** again, then select **Step**. After `lea` and `move.l`, both `a0` and `d1` show
`00002000`. Step through the first `tst.b`: it reads `A` at `$2000`, leaves `Z=0` in the flags panel,
and advances `a0` to `00002001`. The following `bne` takes the branch back to `scan`.

Keep stepping until `a0` is `0000200F`, the address of the zero byte. The next `tst.b` reads that
zero, sets `Z=1`, and advances `a0` to `00002010`. Now `bne` falls through. The subtraction gives
`$2010 - $2000 = $10`, or 16 bytes crossed; `subq.l #1` removes the marker, leaving 15 in `d0`.
The final arithmetic changes the flags, so inspect `Z` immediately after each `tst.b` when following
the loop.

You could count characters as they are read instead. Start `d0` at zero, then increment it only
after a nonzero byte passes the test:

```m68k
    lea text, a0
    clr.l d0
count:
    tst.b (a0)+
    beq done
    addq.l #1, d0
    bra count
done:
```

The address method used in the playground lets the loop do only the test and branch on each byte.
Its final `move.l`, `sub.l`, and `subq.l` calculate the length after the scan.

## Try a shorter string

Change the data line to `text: dc.b 'Hi', 0`. Before selecting **Build** and **Run**, predict `d0`
and `a0`. Step through the two letters and the marker to check when `Z` becomes 1.

<details>
<summary>Show answer</summary>

`d0` ends at `00000002`. The two letters and marker occupy `$2000` through `$2002`, so the last
`tst.b` leaves `a0` at `00002003` and sets `Z=1`.

</details>
