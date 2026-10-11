# Addressing on the Z80

An instruction needs to say where its values come from and, when it writes a value, where it goes. An **addressing mode** is the spelling an instruction uses to tell the CPU that. The spellings you need most often are a number, a register, memory at an address in `hl`, and memory at a fixed address.

For example, these two instructions both put a byte in `a`:

```z80
    ld a, 7
    ld a, (hl)
```

In the first line, `7` is written in the instruction. In the second, the CPU uses the value currently in `hl` as an address, then reads the byte stored at that address. In these load instructions, parentheses mean a memory access.

## A value, a register, or memory

Here are the main forms side by side. You do not need to memorise their names; read the operand and ask where the value is coming from.

| Example         | What it means                                                  |
| --------------- | -------------------------------------------------------------- |
| `ld a, 7`       | Put the number 7 in `a`. The number is an **immediate value**. |
| `ld b, a`       | Copy the value already in register `a` to register `b`.        |
| `ld a, (hl)`    | Read the byte in memory at the address held in `hl`.           |
| `ld (hl), a`    | Write the byte in `a` to memory at the address held in `hl`.   |
| `ld a, (total)` | Read the byte at the fixed address named `total`.              |
| `ld (total), a` | Write `a` to the fixed address named `total`.                  |

The following program uses each of these ideas. Build it, open the memory panel, and step through it.

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, 7             ; the number is part of this instruction
    ld b, a             ; copy from one register to another
    ld hl, place        ; hl receives an address
    ld (hl), a          ; write 7 at that address
    ld a, 0
    ld a, (hl)          ; read the byte back through hl
    halt

place: .db 0
```

At the end, `a` and `b` both hold 7, and the byte at `place` is 7. `hl` holds the address of `place`; `(hl)` means the byte at that address. The pair itself is not memory and is unchanged by the read or write.

## A fixed address and an address in a pair

An address can be written directly in parentheses:

```z80
    ld a, (0x9000)
    ld (0x9000), a
```

These instructions always use address `0x9000`. A label is a name for the address where the assembler placed something, so it is often clearer to use a label instead of writing the number yourself.

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, (total)       ; read the first byte at total
    ld b, a
    ld a, 0x56
    ld (total), a       ; replace that first byte
    halt

total: .dw 0x1234
```

`.dw 0x1234` writes two bytes: `34` first, then `12`. This is the little-endian order you have already seen. Therefore the first read puts `34` in `a`, and the final write changes that first byte to `56`. The label `total` names the address of `34`.

The difference between `(total)` and `(hl)` is where the address comes from. The assembler puts the address of `total` into the instruction. With `(hl)`, the instruction uses whichever address is in `hl` when the CPU reaches it. That makes `hl` useful when a program needs to work at nearby addresses: `inc hl` changes the address for the next `(hl)` access.

## Other pairs that can point at a byte

`bc` and `de` can also hold addresses. Their memory forms have a specific job: they transfer a byte to or from `a`.

```z80|playground|memory|no-flags
    .org 0x8000
    ld bc, source
    ld de, destination
    ld a, (bc)          ; read the byte at source
    ld (de), a          ; write it at destination
    halt

source:      .db 0x2A
destination: .db 0
```

After it runs, `a` and the byte at `destination` are `2A`. Here `(bc)` and `(de)` use the addresses held in those pairs, just as `(hl)` does. For ordinary byte work, `(hl)` is the flexible form you will use most; `(bc)` and `(de)` are useful for this read-through-`a`, write-through-`a` pattern.

## Try it yourself

The runner starts `hl` at `0x9000` and puts the byte `0x3C` at that address. Read that byte into `a`. The parentheses belong around `hl`.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "hl": "0x9000" },
    "startingMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": ["0x3C"] }
    ],
    "expectedRegisters": { "a": "0x3C" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld a, (hl)
    halt
```

</details>

This exercise includes a label in the source itself. The byte at `total` starts as `0x19`. Read it into `a` using the label.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt

total: .db 0x19
```

```testcase
{
    "expectedRegisters": { "a": "0x19" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld a, (total)
    halt

total: .db 0x19
```

</details>
