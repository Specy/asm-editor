# org, db, dw and ds

An assembler turns instructions into bytes in memory. A **directive** tells the assembler where to put bytes or which data bytes to make. The CPU does not execute directives.

## Place bytes with `.org`

`.org 0x8000` means the next byte goes at address `0x8000`. Each following byte takes the next address. A second `.org` can place data elsewhere. Here the code starts at `0x8000` and the data at `0x9000`.

A **label** names the address of the next byte. In `text: .db "Hi"`, `text` means the address of `H`. `ld de, text` puts that address in `de`. Parentheses mean something different: `ld a, (byte1)` reads the byte *at* the address named `byte1`.

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, (byte1)       ; read one byte
    ld hl, (word1)      ; read two bytes
    ld de, text         ; hold the address of text
    halt

    .org 0x9000
byte1:  .db 0x2A
word1:  .dw 0x1234
text:   .db "Hi", 0
list:   .db 1, 2, 3
```

Run it, then enter `9000` in the memory panel's address box. The bytes there are `2A 34 12 48 69 00 01 02 03`. `a` holds `2A`, `hl` holds `1234`, and `de` holds `9003`, the address of `text`. The zero after `Hi` is a byte we explicitly asked `.db` to write.

## Make bytes with `.db`

`.db` writes one byte for each number or character, and one byte for each character in a string:

```z80
values: .db 1, 2, 3       ; three bytes
letter: .db 'A'           ; one byte: 41 in hexadecimal
greet:  .db "Hi", 0       ; three bytes: 48 69 00
```

The label `greet` names the address of `48`, the first byte. A label itself adds no byte.

## Make two-byte values with `.dw`

`.dw` writes a 16-bit value in the little-endian order you have seen: low byte first. `.dw 0x1234` writes `34` at the first address and `12` at the next. A two-byte load such as `ld hl, (word1)` joins them back into `0x1234`.

You can also write an address: `.dw greet` makes two bytes containing the address named `greet`. For example, if `greet` is at `0x9003`, those bytes are `03 90`.

## Leave room with `.ds`

`.ds count` advances the next address by `count` bytes without writing values into those bytes. `.ds count, value` both reserves the space and fills it with `value`.

```z80|playground|memory|no-flags
    .org 0x8000
    ld hl, buffer       ; hl holds buffer's address
    ld (hl), 0x11       ; write its first byte
    inc hl              ; move to the next address
    ld (hl), 0x22
    halt

    .org 0x9000
buffer: .ds 4           ; addresses 9000 through 9003
filled: .ds 3, 0xEE     ; addresses 9004 through 9006
marker: .db 0xFF        ; address 9007
```

Before Run, this editor shows `00 00 00 00` at `buffer` because fresh emulator memory starts cleared, not because `.ds 4` wrote zeroes. It shows `EE EE EE` at `filled` because that line *does* write bytes. After Run, the first two bytes of `buffer` are `11 22`. `inc hl` adds one to the address in `hl`; it does not change the byte at the old address.

## Give a number a name with `equ`

`equ` defines a number for the assembler to substitute. It does not reserve memory. This is useful when a value is repeated or when a name makes its purpose clear.

```z80|playground|memory|no-flags
COUNT equ 3

    .org 0x8000
    ld a, COUNT         ; the assembler uses 3 here
    halt

    .org 0x9000
items: .ds COUNT, 0x7F  ; three bytes, each 7F
```

Changing `COUNT` to `4` changes both places. Unlike a label such as `items`, which names an address determined by the layout, `COUNT` names the number you assigned to it.

## Try it yourself

Put the two-byte value `0x1234` at `0x9000`, followed by the byte `0x56`. Read the byte **after** the two-byte value into `a`. Your code needs one `ld` and `halt`; use `.org`, `.dw`, and `.db` for the data.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "a": "0x56" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": ["0x34", "0x12", "0x56"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld a, (0x9002)      ; the byte after the word
    halt

    .org 0x9000
    .dw 0x1234
    .db 0x56
```

</details>

Now give a three-byte filled area the label `buffer` at `0x9000`. Define `SIZE equ 3`, use it with `.ds` to fill those bytes with `0x2A`, and read the first byte into `a` using the label.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "a": "0x2A" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": ["0x2A", "0x2A", "0x2A"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
SIZE equ 3

    .org 0x8000
    ld a, (buffer)
    halt

    .org 0x9000
buffer: .ds SIZE, 0x2A
```

</details>
