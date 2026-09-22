# The 64 KB address space

Memory holds bytes, and each byte has an address. The Z80 uses 16-bit addresses, from `0x0000` through `0xFFFF`. That gives it 65,536 addresses, or 64 KB, in the address map it can use directly. A 16-bit pair such as `hl` can hold any address in that map.

In these examples, `.org 0x8000` places the program at `0x8000`, as it did in earlier programs. We will use addresses around `0x9000` for data so they are easy to find in the memory panel. These are choices for our editor examples, not a rule dividing every Z80 machine's memory in the same way.

## A byte at an address

You have used `ld a, (hl)` to read the byte at the address held in `hl`. If you already know the address you want, you can put it directly in the parentheses: `ld a, (0x9000)` reads the byte at `0x9000`, while `ld (0x9000), a` writes `a` there. The parentheses still mean “the contents of memory at this address.” Without them, `0x9000` is just a number.

```z80|playground|memory
    .org 0x8000
    ld a, 0x56
    ld (0x9000), a     ; put 56 at address 0x9000
    ld a, 0
    ld a, (0x9000)     ; read it back into a
    halt
```

Build and Run, then enter `9000` in the memory panel's address box. The byte there is `56`, and `a` holds `56` too. The `ld a, 0` between the write and read makes it clear that the final value came from memory.

You can also keep an address in a pair, which is useful when you want to move to a nearby byte. `ld hl, 0x9000` followed by `ld a, (hl)` reads the same address. Then `inc hl` changes the address in `hl` to `0x9001`; it leaves the byte at `0x9000` alone.

## A two-byte number in memory

A pair holds two bytes. `ld (0x9000), hl` stores both bytes of `hl` in memory, starting at `0x9000`. `ld de, (0x9000)` reads those two bytes back into `de`.

```z80|playground|memory
    .org 0x8000
    ld hl, 0x1234
    ld (0x9000), hl
    ld de, (0x9000)
    halt
```

After Run, `de` holds `1234`. Look at the two memory addresses separately:

| Address | Byte |
| --- | --- |
| `0x9000` | `34` |
| `0x9001` | `12` |

In the pair, `0x12` is the high byte and `0x34` is the low byte. In memory, the **low byte goes at the lower address**. This byte order is called **little endian**. A two-byte load from `0x9000` puts those bytes back together as `0x1234`.

You can read either byte on its own. In the next program, `b` receives the low byte and `a` receives the high byte. Notice that it uses the two explicit addresses, not a pair load.

```z80|playground|memory
    .org 0x8000
    ld hl, 0xBEEF
    ld (0x9000), hl
    ld a, (0x9000)
    ld b, a
    ld a, (0x9001)
    halt
```

The result is `b = EF` and `a = BE`. Step through the two reads if you want to see which address supplied each byte. A two-byte value can start at an odd address too: storing `hl` at `0x9001` puts its low byte there and its high byte at `0x9002`.

## Instructions have addresses too

The assembler turns each instruction into bytes and places them in memory. That is why `.org 0x8000` matters: after Build, you can enter `8000` in the memory panel and see the bytes of the program itself. Some instructions take one byte; others take more. The CPU reads those bytes as instructions when it runs, while a memory-reading instruction can read the same bytes as data. Each byte has an **address** and a **value** stored at that address.

This editor displays untouched memory as `00`. Write a value before relying on it: the starting contents of RAM on a physical machine are not something a program can assume.

## Try it yourself

Write the two-byte number `0xBEEF` starting at `0x9000`, then read the byte at `0x9001` into `a`.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "a": "0xBE" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": ["0xEF", "0xBE"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld hl, 0xBEEF
    ld (0x9000), hl
    ld a, (0x9001)
    halt
```

</details>

For a second exercise, three bytes are already in memory: `0x11`, `0x22`, and `0x33` at `0x9000`, `0x9001`, and `0x9002`. Copy them in the same order to `0x9010`, `0x9011`, and `0x9012`. Use `hl` for the address you read and `de` for the address you write. `ld (de), a` writes the byte in `a` to the address held in `de`. After each copy, `inc hl` and `inc de` advance both addresses by one. Three copies written out are enough.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": ["0x11", "0x22", "0x33"] }
    ],
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9010", "bytes": 1, "expected": ["0x11", "0x22", "0x33"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld hl, 0x9000       ; address to read
    ld de, 0x9010       ; address to write
    ld a, (hl)
    ld (de), a
    inc hl              ; next source address
    inc de              ; next destination address
    ld a, (hl)
    ld (de), a
    inc hl
    inc de
    ld a, (hl)
    ld (de), a
    halt
```

</details>
