The **stack** is a part of memory used for temporary two-byte values. Its top is tracked by the 16-bit register `sp`, the **stack pointer**. In this editor's playground, a program starts with `sp = 0xFFFF`. That is the initial playground state, not a value every Z80 program can assume.

The stack grows toward smaller addresses. A stack item in this lesson is always one 16-bit pair, so it occupies two bytes.

## Put a pair on the stack, then take it back

`push` and `pop` are the instructions that automatically move `sp`:

| Instruction | What it does                                                     |
| ----------- | ---------------------------------------------------------------- |
| `push rr`   | Subtracts 2 from `sp`, then writes pair `rr` at the new address. |
| `pop rr`    | Reads a pair from the address in `sp`, then adds 2 to `sp`.      |

Here `rr` can be `af`, `bc`, `de`, `hl`, `ix`, or `iy`. There is no `push a`: the stack instructions work with whole pairs.

Build this program, open the memory panel at `fff8`, and use **Step**.

```z80|playground|memory|no-flags
    .org 0x8000
    ld hl, 0x1234
    ld bc, 0x5678
    ld de, 0x9ABC
    push hl
    push bc
    push de
    pop hl
    halt
```

At first, `sp` is `0xFFFF`. The stack is empty; the marker shows the value in `sp`.

| Address  | Byte    |
| -------- | ------- |
| `0xFFF9` | unknown |
| `0xFFFA` | unknown |
| `0xFFFB` | unknown |
| `0xFFFC` | unknown |
| `0xFFFD` | unknown |
| `0xFFFE` | unknown |
| `0xFFFF` | 🟢 `sp` |

`push hl` changes `sp` to `0xFFFD`. It then stores `0x1234` beginning at that address. Memory is little endian, so the low byte `34` is at `0xFFFD` and the high byte `12` is at `0xFFFE`.

| Address  | Byte    |
| -------- | ------- |
| `0xFFFD` | 🟢 `34` |
| `0xFFFE` | `12`    |
| `0xFFFF` | unused  |

After `push bc` and `push de`, `sp` is `0xFFF9`. Each pair below is shown as its two separate bytes.

| Address  | Byte    | Pair beginning at this address |
| -------- | ------- | ------------------------------ |
| `0xFFF9` | 🟢 `BC` | `0x9ABC`                       |
| `0xFFFA` | `9A`    |                                |
| `0xFFFB` | `78`    | `0x5678`                       |
| `0xFFFC` | `56`    |                                |
| `0xFFFD` | `34`    | `0x1234`                       |
| `0xFFFE` | `12`    |                                |

`pop hl` reads the pair beginning at `0xFFF9`, so `hl` becomes `0x9ABC`. Then `sp` becomes `0xFFFB`.

The bytes `BC` and `9A` remain in memory, but they are no longer part of the stack. A later `push` can overwrite them. The pair pushed last is the first pair popped: this order is called **LIFO**, for “last in, first out.”

## LIFO lets pairs cross or copy

To get a pair back unchanged, pop it in the reverse order from the pushes. Sometimes you deliberately choose another destination. This swaps `bc` and `de`:

```z80|playground|no-flags
    .org 0x8000
    ld bc, 0x1111
    ld de, 0x2222
    push bc
    push de
    pop bc          ; bc receives 0x2222
    pop de          ; de receives 0x1111
    halt
```

The first `pop` receives the value from the most recent `push`. There are two pushes and two pops, so `sp` finishes at `0xFFFF`.

The same rule can copy a pair into another pair:

```z80|playground|no-flags
    .org 0x8000
    ld hl, 0xBEEF
    push hl
    pop de          ; de becomes 0xBEEF; hl is unchanged
    halt
```

## Preserve `a` and the flags together

`af` is a pair: `a` is its high byte and the flags register is its low byte. Saving `af` keeps both the accumulator and the result of a comparison while other work changes them.

```z80|playground
    .org 0x8000
    ld a, 5
    cp 5            ; Z becomes 1
    push af         ; save a and the flags together
    ld a, 200
    add a, 100      ; changes a and the flags
    pop af          ; restore the saved a and flags
    halt
```

After the `pop`, `a` is `05` and `Z` is 1 again. With the flags panel open, step through the instructions and watch the saved comparison result return.

## Keep the stack balanced in a nested loop

The useful pattern is simple: push a pair before work that needs to overwrite it, then pop that pair after the work. The pops must be in reverse order. This nested loop needs `b` for both counters and uses `hl` for inner work, while `hl` also keeps the outer count.

```z80|playground|no-flags
    .org 0x8000
    ld hl, 0
    ld b, 3
outer:
    push hl         ; save hl, the outer count
    push bc         ; save bc, including the outer loop counter in b
    ld hl, 0x9000   ; inner work may now use hl
    ld b, 4
inner:
    inc hl
    djnz inner
    pop bc          ; restore the outer loop counter
    pop hl          ; restore the outer count
    inc hl
    djnz outer
    halt
```

`hl` finishes at `0x0003`, and `sp` is back at `0xFFFF`. If the two `pop` instructions were reversed, `bc` would receive the saved `hl` value and `hl` would receive the saved `bc` value. The outer `djnz` would then use the wrong counter.

Keep one rule in mind: every path through a piece of code must leave the stack at the same depth it entered. For example, a jump that skips a matching `pop` leaves `sp` two bytes lower. Repeating that path in a loop keeps moving the stack into lower memory and overwrites whatever is there.

## Your turn on the stack

The test starts `bc` at `0x1111` and `de` at `0x2222`. Swap them using only the stack: four instructions and no `ld`. Leave the stack balanced.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "bc": "0x1111", "de": "0x2222" },
    "expectedRegisters": { "bc": "0x2222", "de": "0x1111", "sp": "0xFFFF" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    push bc
    push de
    pop bc
    pop de
    halt
```

</details>

The test starts `bc` at `0x0000` and `hl` at `0xBEEF`. Preserve that value while using `hl` as a three-step counter. Leave 3 in `a`, leave `hl` unchanged, and leave the stack balanced. `b` is available for `djnz`.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "bc": "0x0000", "hl": "0xBEEF" },
    "expectedRegisters": { "a": 3, "bc": "0x0000", "hl": "0xBEEF", "sp": "0xFFFF" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    push hl
    ld hl, 0
    ld b, 3
count:
    inc hl
    djnz count
    ld a, l
    pop hl
    halt
```

</details>
