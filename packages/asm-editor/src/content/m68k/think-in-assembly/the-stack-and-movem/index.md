# The stack, -(sp) and movem

The **stack** is a region of memory used for temporary values. The stack pointer, `sp` (another
name for `a7`), tracks its current position. You add a value at the top, called a **push**, and
take the top value back, called a **pop**. The last value pushed is the first one popped: **last in,
first out** (LIFO).

On M68K, the stack grows toward lower addresses. Pushing moves `sp` down to make room and writes
there. Popping reads at `sp` and moves it up. The predecrement `-(sp)` and postincrement `(sp)+`
modes do those pointer changes as part of the memory access.

## Push and pop

`move.l d0, -(sp)` subtracts 4 from `sp`, then stores the four bytes of `d0` at the new address.
`move.l (sp)+, d2` reads four bytes at `sp` into `d2`, then adds 4 to `sp`. The `.l` selects a
long-sized memory access, so each pointer change is four bytes.

In this playground, memory ends at `$FFFFFF` and `sp` starts at `$1000000`, one byte beyond it. The
example sets `sp` explicitly to that address so you can trace every change:

```m68k|playground|memory|no-flags
    move.l #$1000000, sp
    move.l #$11223344, d0
    move.l #$55667788, d1
    move.l d0, -(sp)    ; sp = $FFFFFC; store d0 there
    move.l d1, -(sp)    ; sp = $FFFFF8; store d1 there
    move.l (sp)+, d2    ; d2 = $55667788; sp = $FFFFFC
    move.l (sp)+, d3    ; d3 = $11223344; sp = $1000000
```

| after this step | `sp`       | long at `$FFFFF8` | long at `$FFFFFC` |
| --------------- | ---------- | ----------------- | ----------------- |
| set `sp`        | `$1000000` | unspecified       | unspecified       |
| push `d0`       | `$FFFFFC`  | unspecified       | `$11223344`       |
| push `d1`       | `$FFFFF8`  | `$55667788`       | `$11223344`       |
| pop into `d2`   | `$FFFFFC`  | `$55667788`       | `$11223344`       |
| pop into `d3`   | `$1000000` | `$55667788`       | `$11223344`       |

The first push stores `$11223344` in big-endian order: byte `$11` at `$FFFFFC`, `$22` at
`$FFFFFD`, `$33` at `$FFFFFE`, and `$44` at `$FFFFFF`. The second push uses the four addresses
immediately below those. After both pops, `sp` is back where it started. The old bytes remain in
memory; a pop changes the pointer, not the bytes. A later push may overwrite them.

Each push must have a matching pop of the same size and in the reverse order when you want `sp`
back at its starting address. A word push, `move.w d0, -(sp)`, moves it down by 2; a matching
`move.w (sp)+, d0` moves it back up by 2. Use the same access size when retrieving a value so the
pointer advances past exactly what was stored.

For a byte-sized access through `sp`, real 68000 hardware makes a special exception: `-(sp)` and
`(sp)+` change `sp` by **2**, keeping it even. This playground currently changes it by **1**.
Word and long accesses change `sp` by 2 and 4 respectively in both the 68000 and this playground.

## Save several registers with `movem`

`movem` moves a **register list** between registers and memory. A hyphen selects a range, so
`d0-d2` means `d0`, `d1`, and `d2`; a slash joins parts, so `d0-d1/a0` names three registers.
`movem.l d0-d1/a0, -(sp)` saves their full long values on the stack. The matching
`movem.l (sp)+, d0-d1/a0` restores them and brings `sp` back.

```m68k|playground|memory|no-flags
    move.l #$1000000, sp
    move.l #$11111111, d0
    move.l #$22222222, d1
    move.l #$AAAAAAAA, a0
    movem.l d0-d1/a0, -(sp)     ; save three longs; sp = $FFFFF4
    move.l #$FF, d0
    move.l #$FF, d1
    move.l #$FF, a0
    movem.l (sp)+, d0-d1/a0     ; restore them; sp = $1000000
```

The hardware uses a fixed save order; changing the spelling order of the list does not change
where values go. With predecrement, it saves selected address registers from `a7` down to `a0`,
then selected data registers from `d7` down to `d0`. Here each long moves `sp` down by 4:

| save step | new `sp`  | value stored there | from |
| --------- | --------- | ------------------ | ---- |
| first     | `$FFFFFC` | `$AAAAAAAA`        | `a0` |
| second    | `$FFFFF8` | `$22222222`        | `d1` |
| third     | `$FFFFF4` | `$11111111`        | `d0` |

Postincrement restore reads from the lowest address upward: `d0`, then `d1`, then `a0` in this
example. All three registers regain their original values, and `sp` increases by 12 bytes to
`$1000000`. Use the same register list and access size on both lines. `movem.w` uses two bytes per
register; `movem.l` uses four and preserves each complete register value. `movem` leaves the
condition-code flags unchanged.

## Your turn

### 1. Swap two registers

`d0` starts at `$11111111`, `d1` at `$22222222`, and `sp` at `$1000000`. Swap the two values in
three `move.l` instructions, using the stack instead of a third register. Finish with
`sp` back at `$1000000`. The pushed long will remain in memory at `$FFFFFC`.

```m68k|playground|exercise
; your three instructions here
```

```testcase
{
    "startingRegisters": { "d0": "0x11111111", "d1": "0x22222222", "a7": "0x1000000" },
    "expectedRegisters": { "d0": "0x22222222", "d1": "0x11111111", "a7": "0x1000000" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0xFFFFFC", "bytes": 4, "expected": [286331153] }
    ]
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l d0, -(sp)
    move.l d1, d0
    move.l (sp)+, d1
```

</details>

### 2. Save and restore a register list

`d0`, `d1`, and `d2` start at 1, 2, and 3; `sp` starts at `$1000000`. Add one `movem.l` before
the three writes and one after them. End with all three original register values and `sp` back at
`$1000000`. The saved longs should remain in memory at `$FFFFF4` through `$FFFFFF`.

```m68k|playground|exercise
; save d0, d1 and d2 here

    move.l #$FF, d0
    move.l #$FF, d1
    move.l #$FF, d2

; restore d0, d1 and d2 here
```

```testcase
{
    "startingRegisters": { "d0": 1, "d1": 2, "d2": 3, "a7": "0x1000000" },
    "expectedRegisters": { "d0": 1, "d1": 2, "d2": 3, "a7": "0x1000000" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0xFFFFF4", "bytes": 4, "expected": [1, 2, 3] }
    ]
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    movem.l d0-d2, -(sp)

    move.l #$FF, d0
    move.l #$FF, d1
    move.l #$FF, d2

    movem.l (sp)+, d0-d2
```

</details>
