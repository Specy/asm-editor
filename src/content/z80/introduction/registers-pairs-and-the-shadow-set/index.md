# Registers, pairs and the shadow set

In the first program, `a` held one number, `b` held another, and `add a, b` left the answer in `a`. Let's get to know the registers behind that small example. Keep the registers panel open and use **Step** when you want to see one change at a time.

## Seven places for a byte

The Z80 has seven everyday registers that each hold one byte: `a`, `b`, `c`, `d`, `e`, `h` and `l`. You can put a number into any of them with `ld`. You can also copy a byte between them: `ld c, b` copies the value in `b` into `c`; it does not empty `b`.

`a` is called the **accumulator**. The addition you have seen uses it as the place for the answer. Subtraction does too, though its spelling is shorter: `sub b` means subtract `b` from `a` and leave the answer in `a`.

```z80|playground|no-flags
    .org 0x8000
    ld a, 10
    ld b, 3
    sub b           ; a becomes 7; b stays 3
    add a, b        ; a becomes 10 again
    halt
```

Step through it and watch `a` change while `b` stays at 3. The panel displays hexadecimal, so 10 appears as `0A`.

## Two bytes together

Three names let you look at six of those registers in pairs: `bc` joins `b` and `c`, `de` joins `d` and `e`, and `hl` joins `h` and `l`. Each pair holds two bytes. Its first letter is the high byte, and its second letter is the low byte. For example, if `b` is `12` and `c` is `34` in hexadecimal, the panel shows `bc` as `1234`.

The pair is another view of the same registers, not an extra place to store a value. `ld bc, 0x1234` puts `0x12` in `b` and `0x34` in `c`. The `0x` prefix marks a hexadecimal number in source code.

```z80|playground|no-flags
    .org 0x8000
    ld bc, 0x1234   ; b = 0x12, c = 0x34
    ld c, 0x56      ; bc now reads 0x1256
    inc bc          ; bc now reads 0x1257
    dec bc          ; bc is back to 0x1256
    halt
```

`inc` adds one and `dec` subtracts one. Written with a pair, they change the *whole* two-byte value. Try changing `ld c, 0x56` to `ld c, 0xFF`, then step through `inc bc`: the low byte rolls over to `00` and the high byte goes up by one.

A pair can hold a larger number than a single byte. It can also hold a memory address, since the Z80 uses two-byte addresses. `hl` is especially useful for visiting a byte in memory.

## A byte at the address in `hl`

In an instruction, `hl` means the value held by the pair. `(hl)` means **the byte in memory at the address held by `hl`**. The parentheses tell the CPU to look in memory.

This example uses address `0x8100`. First it writes the byte 7 there; then it reads that same byte into `a`.

```z80|playground|memory|no-flags
    .org 0x8000
    ld hl, 0x8100   ; hl holds an address
    ld (hl), 7      ; memory at that address becomes 7
    ld a, (hl)      ; a becomes 7
    inc hl          ; hl now holds the next address, 0x8101
    ld (hl), 9      ; memory at the next address becomes 9
    add a, (hl)     ; a becomes 16 (shown as 10 in hexadecimal)
    halt
```

With **Step**, watch `hl` and the memory view as well as `a`. `inc hl` changes the address in the pair; it does not change the byte at the old address. You can use `ld (hl), a` to write the value in `a` to memory too.

## A second set you can swap in

There is a hidden second copy of each of the three pairs: `bc'`, `de'` and `hl'`. The apostrophe means “the other copy.” You cannot write `ld bc', 5` to use one directly. Instead, `exx` swaps all three visible pairs with their hidden copies at once.

| After this instruction | Visible `bc` | Other `bc'` |
| --- | --- | --- |
| `ld bc, 0x1111` | `1111` | `0000` |
| first `exx` | `0000` | `1111` |
| `ld bc, 0x2222` | `2222` | `1111` |
| second `exx` | `1111` | `2222` |

The table assumes both copies started at zero, as they do in this example. The same swap happens to `de` and `hl`. Nothing is copied or lost: the two sets simply trade places.

```z80|playground|no-flags
    .org 0x8000
    ld bc, 0x1111
    exx             ; the other bc, de and hl are now visible
    ld bc, 0x2222
    exx             ; the first set is visible again
    halt
```

## Try it yourself

The first exercise starts with `bc = 0x1111`, `de = 0x2222` and `hl = 0x3333`. Their other copies start at zero. Leave the three visible pairs at zero and put the starting values in their other copies. It takes one instruction.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "bc": "0x1111", "de": "0x2222", "hl": "0x3333" },
    "expectedRegisters": {
        "bc": 0,
        "de": 0,
        "hl": 0,
        "bc'": "0x1111",
        "de'": "0x2222",
        "hl'": "0x3333"
    }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    exx
    halt
```

</details>

For the second exercise, the three bytes **are already in memory**: 5 at address `0x8100`, 7 at `0x8101`, and 9 at `0x8102`. `hl` already holds `0x8100`. Read each byte through `(hl)`, move `hl` to the next address with `inc hl`, and leave their sum in `a`. The answer is 21, displayed as `15` in hexadecimal.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "hl": "0x8100" },
    "startingMemory": [{ "type": "number-chunk", "address": "0x8100", "bytes": 1, "expected": [5, 7, 9] }],
    "expectedRegisters": { "a": "0x15" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld a, (hl)
    inc hl
    add a, (hl)
    inc hl
    add a, (hl)
    halt
```

</details>
