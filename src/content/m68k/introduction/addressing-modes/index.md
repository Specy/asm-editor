# Addressing modes

An instruction needs to know where each operand comes from. An **addressing mode** is the rule an
operand uses to obtain a value or name a place that an instruction can change.

Some modes name a value already in the instruction or a register. Other modes access memory. For a
memory operand, the CPU may have to calculate an address first. The final memory address produced by
that calculation is called the **effective address**.

This lesson builds the memory modes one at a time. Every example uses addresses beginning at
`$2000`, away from the program itself, and writes the example data there before reading it.

## The modes already in use

The register and literal operands from earlier lessons are addressing modes too:

```m68k|playground|no-flags
    move.l #7, d0
    move.l d0, d1
    move.l #$2000, a0
    move.l a0, a1
```

- `#7` and `#$2000` use **immediate addressing**. The number itself is part of the instruction.
- `d0` and `d1` use **data-register direct addressing**. The operand is the named data register.
- `a0` and `a1` use **address-register direct addressing**. The operand is the named address
  register.

These four instructions do not read or write data memory. In particular, putting `$2000` in `a0`
does not access memory at `$2000`; it only copies that number into the register.

## Absolute memory: `$2000`

An address written without `#` names memory at that address. This is **absolute addressing** because
the effective address is a fixed number in the instruction.

```m68k|playground|memory|no-flags
    move.l #$11223344, $2000
    move.l $2000, d0
```

The first line writes the long `$11223344` to memory beginning at `$2000`. The second line reads the
same four bytes into `d0`, so `d0` ends at `$11223344`.

The `#` makes these two operands mean different things:

| operand  | meaning                                    |
| -------- | ------------------------------------------ |
| `#$2000` | the number `$2000` itself                  |
| `$2000`  | the value stored in memory beginning there |

For the memory operand, the effective address is simply `$2000`.

## Address-register indirect: `(a0)`

Often a program keeps an address in an address register. Parentheses mean “use the address stored in
this register.” This is **address-register indirect addressing**.

```m68k|playground|memory|no-flags
    move.l #$11223344, $2000
    move.l #$2000, a0
    move.l (a0), d0
```

When the last line runs, `a0` contains `$2000`, so the effective address of `(a0)` is `$2000`.
`d0` receives the long stored there: `$11223344`. The parentheses do not change `a0`.

The same mode can name a destination:

```m68k|playground|memory|no-flags
    move.l #$2000, a0
    move.l #$AABBCCDD, (a0)
```

Here `(a0)` names the four bytes to change, so memory beginning at `$2000` becomes `$AABBCCDD`.

## A fixed displacement: `4(a0)`

A **displacement** is a constant byte offset written before the parentheses. The CPU adds it to the
address register to get the effective address.

```m68k|playground|memory|no-flags
    move.l #10, $2000
    move.l #20, $2004
    move.l #30, $2008

    move.l #$2000, a0
    move.l 4(a0), d0
```

On the last line, the CPU calculates:

```text
effective address = $2000 + 4 = $2004
```

It then reads the long at `$2004`, so `d0` becomes 20. The displacement is measured in bytes. It is
4 here because one long occupies four bytes. A negative displacement works too: if `a0` contained
`$2008`, then `-4(a0)` would also have the effective address `$2004`.

## A register offset: `0(a0,d1.w)`

Sometimes an offset is only known while the program is running. **Indexed addressing** adds an index
register as well as a fixed displacement:

```text
effective address = address register + index register + displacement
```

This example supplies the byte offset 8 directly in `d1`:

```m68k|playground|memory|no-flags
    move.l #10, $2000
    move.l #20, $2004
    move.l #30, $2008
    move.l #40, $200C

    move.l #$2000, a0
    move.l #8, d1
    move.l 0(a0,d1.w), d0
```

The `.w` on `d1.w` says that this 68000 addressing mode uses the low word of `d1` as its signed
index. The leading `0` is the fixed displacement. The effective address is `$2000 + 8 + 0`, so the
last line reads the long at `$2008` and puts 30 in `d0`.

An index is a byte offset, not an element number. The four longs above begin 0, 4, 8 and 12 bytes
after `$2000`. That is why the offset for the third long is 8 rather than 2. The read leaves the base
register `a0` and index register `d1` unchanged; it changes the destination register `d0` to 30.

A nonzero displacement can be combined with the index. With the same register values,
`4(a0,d1.w)` has the effective address `$200C`.

## Use an address, then move it: `(a0)+`

**Postincrement addressing** accesses memory through an address register and then increases that
register. For `a0` through `a6`, the amount added is the operand's access size: 1 for a byte, 2 for
a word and 4 for a long. `a7` is the exception: a byte access changes it by 2. In every case, this
amount comes from the memory access size, not the number of bytes used to encode the instruction.

```m68k|playground|memory|no-flags
    move.b #$7A, $2000
    move.w #$1234, $2002

    move.l #$2000, a0
    move.l #$AABBCCDD, d0
    move.b (a0)+, d0

    move.l #$2002, a1
    move.l #$55667788, d1
    move.w (a1)+, d1
```

The byte read happens at `$2000`, then `a0` increases by 1 to `$2001`. A byte write to a data
register changes only its low byte, so `d0` becomes `$AABBCC7A`.

The word read happens at `$2002`, then `a1` increases by 2 to `$2004`. A word write changes only the
low word of a data register, so `d1` becomes `$55661234`. The `+` is part of the memory operand; the
address register changes automatically after that access.

## Move an address first, then use it: `-(a2)`

**Predecrement addressing** does those actions in the opposite order. It first subtracts the same
amount that postincrement would add, then uses the new address.

```m68k|playground|memory|no-flags
    move.l #$89ABCDEF, $2004
    move.l #$2008, a2
    move.l -(a2), d2
```

Because this is a long access, the last line first changes `a2` from `$2008` to `$2004`. It then
reads the long at `$2004`, making `d2` equal to `$89ABCDEF`. Afterward, `a2` still contains `$2004`.

Postincrement and predecrement are useful whenever a later instruction should use the neighbouring
item in memory. `(a0)+` accesses memory at the current address and then changes `a0`. `-(a0)`
changes `a0` first and then accesses memory at the new address.

## Recap

| mode                       | example      | how it obtains its value or location                 |
| -------------------------- | ------------ | ---------------------------------------------------- |
| immediate                  | `#7`         | the number in the instruction                        |
| data-register direct       | `d0`         | data register `d0`                                   |
| address-register direct    | `a0`         | address register `a0`                                |
| absolute                   | `$2000`      | memory at the fixed address `$2000`                  |
| address-register indirect  | `(a0)`       | memory at the address in `a0`                        |
| indirect with displacement | `4(a0)`      | memory at `a0 + 4`                                   |
| indexed                    | `0(a0,d1.w)` | memory at `a0 +` the signed low word of `d1 + 0`     |
| postincrement              | `(a0)+`      | memory at `a0`, then increase it by the access size  |
| predecrement               | `-(a0)`      | decrease `a0` by the access size, then access memory |

Each instruction allows particular modes for each operand. One dependable rule is that an immediate
operand can be a source but cannot be a destination: an instruction can use a written number, but it
cannot store a result back inside its own literal.

## Check your understanding

### 1. Read with an index

The exercise starts with this memory:

| address | long stored there |
| ------- | ----------------: |
| `$2000` |                10 |
| `$2004` |                20 |
| `$2008` |                30 |
| `$200C` |                40 |

It also starts `a0` at `$2000`, puts the byte offset 8 in `d1`, and gives `d0` the sentinel value
`$DEADBEEF`. Write one indexed `move.l` that reads the long at `a0 + d1` into `d0`. Leave `a0` and
`d1` unchanged.

```m68k|playground|memory|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "a0": "0x2000",
        "d0": "0xDEADBEEF",
        "d1": 8
    },
    "expectedRegisters": {
        "a0": "0x2000",
        "d0": 30,
        "d1": 8
    },
    "startingMemory": [
        {
            "type": "number-chunk",
            "address": "0x2000",
            "bytes": 4,
            "expected": [10, 20, 30, 40]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    move.l 0(a0,d1.w), d0
```

</details>

### 2. Trace both automatic updates

The exercise starts with byte `$7A` at `$2000` and long `$11223344` at `$2004`. It starts `a0` at
`$2000` and `a1` at `$2008`.

1. Use byte-sized postincrement through `a0` to read `$7A` into `d0`.
2. Use long-sized predecrement through `a1` to read `$11223344` into `d1`.

The sentinel in `d0` makes the partial byte write visible. After both instructions, `a0` should be
`$2001` and `a1` should be `$2004`.

```m68k|playground|memory|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "a0": "0x2000",
        "a1": "0x2008",
        "d0": "0xAABBCCDD",
        "d1": "0xDEADBEEF"
    },
    "expectedRegisters": {
        "a0": "0x2001",
        "a1": "0x2004",
        "d0": "0xAABBCC7A",
        "d1": "0x11223344"
    },
    "startingMemory": [
        {
            "type": "number",
            "address": "0x2000",
            "bytes": 1,
            "expected": "0x7A"
        },
        {
            "type": "number",
            "address": "0x2004",
            "bytes": 4,
            "expected": "0x11223344"
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    move.b (a0)+, d0
    move.l -(a1), d1
```

</details>
