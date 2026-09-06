A program is instructions and the data they work on, and something has to say where each of them goes
in memory. MIPS and RISC-V do it with sections, `.data` and `.text`. The M68K assembler here has no
sections at all: it starts at an address, walks your source from top to bottom, and puts each
instruction and each piece of data at the next free address. Four directives control that walk.

## org: where the next thing goes

`org $2000` sets the address the next line is assembled at. Everything after it follows on from
there, four bytes per instruction and as many bytes as it needs per piece of data, until the next
`org`.

A new M68K project starts with `ORG $1000`, and `$1000` is also where this editor assembles from when
you write no `org` at all. The program starts running at your **first instruction**, wherever in
memory it landed, not at the lowest address, so a data block placed before the code with an earlier
`org` does not get executed.

One rule: an `org` can only move **forwards**. `org $1000` after something has already been
assembled at `$3000` is a build error saying that the address must be greater than the previous one.

```m68k|playground|memory|no-flags
    move.l #1, d0       ; this instruction is at $1000
    move.l #2, d1       ; and this one at $1004
here:   dc.l $AABBCCDD  ; and this long at $1008, right after the code

    org $2000
there:  dc.l $11223344  ; while this one is at $2000, where the org put it
```

Build it, then type `1008` in the memory panel's address box: the four bytes `AA BB CC DD` are there,
because nothing separated the data from the code. Type `2000` and `11 22 33 44` is there instead.

The program stops after `move.l #2, d1`, and it stops for a plain reason: there is no next
instruction. The bytes of `here` are data and the simulator has no instruction assembled at `$1008`,
so the run ends. On a real 68000 those bytes would be decoded as an instruction and executed,
whatever they happened to mean, which is why real programs never fall off the end into their data.

## Labels

A label is a name for the address of whatever comes next, and on this assembler it **ends with a
colon**: `here:`, `start:`, `numbers:`. A name without a colon in front of an instruction is read as
an instruction name and fails to assemble. The one exception is `equ`, whose name is written first
and takes no colon.

A label is nothing but its address, so nothing distinguishes a label on an instruction from a label
on a `dc`. `bra here` and `move.l here, d0` are both legal on the same label, and one of them makes
sense.

## dc, ds and dcb: what is in memory

- **`dc`** defines constants. `dc.b`, `dc.w` and `dc.l` write the values you list as bytes, words or
  longs, in that order, right where the line is. A string in single quotes is written as its
  characters, one byte each, and a label written as a value becomes its address.
- **`ds`** defines storage. `ds.b 8` reserves eight bytes, `ds.w 2` two words, `ds.l 6` six longs,
  and it gives them no value: what is in that room until your program writes it is whatever was
  there.
- **`dcb`** defines a constant block: `dcb.b 4, $7E` writes `$7E` four times over. It is `ds` with
  something in it.

```m68k|playground|memory|no-flags
    lea greeting, a0

    org $2000
greeting: dc.b 'Hi', 0
counts:   dc.w 1, 2
total:    dc.l $DEADBEEF
room:     ds.w 2
filler:   dcb.b 4, $7E
pointer:  dc.l greeting
```

| label      | address | bytes         | what it is                            |
| ---------- | ------- | ------------- | ------------------------------------- |
| `greeting` | `$2000` | `48 69 00`    | `H`, `i` and the terminator you wrote |
| `counts`   | `$2003` | `00 01 00 02` | two words                             |
| `total`    | `$2007` | `DE AD BE EF` | one long, most significant byte first |
| `room`     | `$200B` | four bytes    | reserved and not written              |
| `filler`   | `$200F` | `7E 7E 7E 7E` | four copies of `$7E`                  |
| `pointer`  | `$2013` | `00 00 20 00` | the address of `greeting`, as a long  |

`a0` comes out at `00002000`, the same address `pointer` holds. Two things in that table are worth
reading twice. `counts` starts at `$2003`, an **odd** address, because `greeting` took three bytes
and the assembler pads nothing, so `move.w counts, d0` on this layout is an address error. And
`pointer` is a long whose value is an address, which is how you write the equivalent of `char *p =
greeting;` in C.

## equ: a name for a number

`equ` gives a name to a number, and the assembler replaces the name with the number everywhere it
appears. It reserves no memory and produces no instruction: after assembling, nothing of the name is
left in the program.

```m68k|playground|memory|no-flags
count   equ 6           ; a name for 6, using no memory
size    equ 4
    move.l #count, d0       ; the number 6
    move.l #count*size, d1  ; 24, multiplied while assembling
    move.l stored, d2       ; the long at stored, read from memory

    org $2000
stored: dc.l 6
```

`d0` and `d2` both come out at `00000006`, and they got there in completely different ways: `count`
became a `#6` inside the instruction, while `stored` became the address `$2000` and the instruction
went to memory. `d1` is `00000018`, which is 24, worked out by the assembler.

Use `equ` for anything you would write as a `#define` in C: the length of an array, the size of an
element, a trap task number, a screen width. Change the number in one place and every use of it
changes with it. The one thing it will not do here is arithmetic on another `equ` with `*`, so write
sizes as sums (`limit equ 640-40`) or repeat the number.

## The shape of a real program

Put together, an M68K program in this editor looks like this: constants at the top, code from
`$1000`, data under its own `org` after it.

```m68k|playground|memory|no-flags
BUFSIZE equ 8

    org $1000
start:
    lea buffer, a0          ; where the room begins
    move.l #BUFSIZE, d0     ; how much of it there is
    move.b #'A', (a0)       ; one byte written into it

    org $2000
message: dc.b 'Hi', 0
buffer:  ds.b BUFSIZE
```

`a0` ends at `00002003`, which is where `buffer` begins, three bytes after `message`. Look at `$2000`
in the memory panel after running and the four bytes read `48 69 00 41`: the string, its terminator,
and the `A` the program wrote into the first byte of the room.

The `org $2000` is what keeps the data out of the way. Without it `message` would sit right after the
last instruction, and every instruction you add above would move it, which is fine for the program
and inconvenient every time you want to look at a fixed address in the memory panel.

## Your turn

Write a data block at `$3000` holding the three words 100, 200 and 300, followed by eight bytes of
room, and leave the address of that room in `a0`. It comes out at `$3006`, since three words take
six bytes.

```m68k|playground|memory|exercise
* your code here
```

```testcase
{
    "expectedRegisters": { "a0": "0x3006" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x3000", "bytes": 2, "expected": [100, 200, 300] }
    ]
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    lea room, a0        ; the address of the reserved room

    org $3000
values: dc.w 100, 200, 300
room:   ds.b 8
```

</details>

The second one wants two names, `rows` for 4 and `cols` for 5, and their product in `d0`, multiplied
by the assembler rather than by the program.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "expectedRegisters": { "d0": 20 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
rows equ 4
cols equ 5
    move.l #rows*cols, d0   ; the 20 is in the instruction
```

</details>
