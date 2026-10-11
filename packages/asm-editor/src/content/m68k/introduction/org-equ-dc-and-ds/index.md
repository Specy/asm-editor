# org, equ, dc and ds

The assembler must choose a memory address for every instruction and every piece of data. It keeps
a **current assembly address** while it reads the source. Placing an instruction or some data uses
bytes at that address and advances it by the number of bytes placed there.

An **assembler directive** tells the assembler how to build the program. A directive does not
become an instruction for the processor. This page uses four directives:

| directive | job                                               |
| --------- | ------------------------------------------------- |
| `org`     | choose the address for whatever is assembled next |
| `dc`      | place known data in memory                        |
| `ds`      | reserve a chosen amount of memory                 |
| `equ`     | give a name to a number used while assembling     |

## Labels name addresses

A **label** binds a name to the current assembly address. Write the name followed by a colon:

```m68k
start:
    move.l #1, d0

    org $2000
values:
    dc.w 10, 20
```

Here `start` names the address of an instruction, while `values` names the address where the first
word is stored. The label itself occupies no memory. Both names are addresses; their meaning comes
from what the source places at those addresses.

An instruction may use a label before its definition appears. During Build, the assembler reads
the complete source, records each label's address, and resolves those references. For example,
`move.l #values,a0` works even if `values:` is farther down the file. A forward reference is also
allowed in data created by `dc`.

The expressions on `org`, `ds`, and `equ` lines affect the layout itself, so any names in those
expressions must already have been defined.

## `org`: choose the next address

`org $2000` sets the current assembly address to `$2000`. The next instruction or data byte is
placed there, and assembly continues from there until another `org` changes the address.

This editor starts at `$1000` when the source has no earlier `org`. Writing each important address
explicitly makes the layout easy to inspect:

```m68k|playground|memory|no-flags
    org $1000
start:
    move.l #value, a0   ; the address named by value
    move.l value, d0    ; the long stored at that address

    org $2000
value:
    dc.l $11223344
```

The assembler resolves the two uses of `value` to `$2000`. The `#` keeps that number as an
immediate value, so `a0` becomes `$00002000`. Without `#`, `value` is a memory operand, so `d0`
receives `$11223344` from memory.

Build places the instructions beginning at `$1000` and the data beginning at `$2000`. Run starts
at the first assembled instruction and executes the two `move.l` instructions. The `org` and `dc`
lines guide Build, so they are not execution steps.

## `dc`: place known data

`dc` means **define constant**. Its suffix chooses the size of every listed value:

- `dc.b` places one byte for each value;
- `dc.w` places one two-byte word for each value;
- `dc.l` places one four-byte long for each value.

Values are placed in the order written. Words and longs use big-endian byte order, with the most
significant byte at the lowest address.

A word or long must begin at an even address. A byte declaration can leave the current address
odd, and the assembler does not insert alignment bytes automatically. When that happens, declare a
padding byte before the next word or long:

```m68k
    org $2000
first:   dc.b $12
padding: dc.b 0
pair:    dc.w $3456, $789A
wide:    dc.l $BCDEF012
pointer: dc.l first
```

The resulting layout is completely determined during Build:

| label     | address | bytes in memory | explanation                                    |
| --------- | ------- | --------------- | ---------------------------------------------- |
| `first`   | `$2000` | `12`            | one byte                                       |
| `padding` | `$2001` | `00`            | an explicit byte makes the next address even   |
| `pair`    | `$2002` | `34 56 78 9A`   | two big-endian words                           |
| `wide`    | `$2006` | `BC DE F0 12`   | one big-endian long                            |
| `pointer` | `$200A` | `00 00 20 00`   | the address named by `first`, stored as a long |

The value on a `dc` line can be a label. `dc.l first` stores the label's numeric address,
`$00002000`, in four bytes.

## `ds`: reserve uninitialised memory

`ds` means **define storage**. It advances the current assembly address without giving the reserved
bytes known values. The number is a count of the selected size:

| declaration | space reserved    |
| ----------- | ----------------- |
| `ds.b 8`    | 8 bytes           |
| `ds.w 3`    | 3 words = 6 bytes |
| `ds.l 2`    | 2 longs = 8 bytes |

For example:

```m68k
    org $2100
bytes: ds.b 8
words: ds.w 3
longs: ds.l 2
```

`bytes` is `$2100`, `words` is `$2108`, and `longs` is `$210E`. A program must write a reserved
location before relying on its contents. `ds` does not promise zeroes or any other initial value.

## `equ`: name an assembler-time number

`equ` gives a name to a numeric expression. Its name is written without a colon:

```m68k|playground|memory|no-flags
rows  equ 4
cols  equ 5
cells equ rows*cols

    org $1000
    move.l #cells, d0
    move.l stored, d1

    org $2000
stored:
    dc.l cells
```

Define each name before another `equ` expression uses it. In this lesson, an expression can use
decimal or `$`-prefixed hexadecimal integers, earlier `equ` names, parentheses, and the operators
`+`, `-`, `*`, and `/`. Write the expression without spaces, as in `rows*cols` or
`(cols+1)*4`. Multiplication is ordinary assembler-time arithmetic.

The assembler calculates `cells` as 20. It places 20 inside the first `move.l` as an immediate
value and also writes 20 into the long at `stored`. During Run, `d0` receives the immediate 20,
while `d1` reads 20 from memory at `$2000`.

An `equ` line emits no bytes, reserves no bytes, and does not advance the current assembly address.
The name exists for the assembler; the built program contains the resulting number wherever the
name was used.

## Check your understanding

### 1. Declare known data and reserve space

At `$3000`, declare the three words 100, 200, and 300. Immediately after them, reserve eight
uninitialised bytes with the label `room`. Put the address named by `room` in `a0`.

The three `dc.w` values give the six bytes from `$3000` through `$3005` defined initial contents.
`room` begins at `$3006`, and its eight reserved bytes have unspecified contents.

```m68k|playground|memory|exercise
; your code here
```

```testcase
{
    "startingRegisters": { "a0": "0xDEADBEEF" },
    "expectedRegisters": { "a0": "0x3006" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x3000", "bytes": 2, "expected": [100, 200, 300] }
    ]
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    move.l #room, a0

    org $3000
values: dc.w 100, 200, 300
room:   ds.b 8
```

</details>

### 2. Calculate a named value during Build

Define `rows` as 4 and `cols` as 5. Define `cells` from the expression `rows*cols`, then put the
value of `cells` in `d0`.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": { "d0": "0xDEADBEEF" },
    "expectedRegisters": { "d0": 20 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
rows  equ 4
cols  equ 5
cells equ rows*cols
    move.l #cells, d0
```

</details>
