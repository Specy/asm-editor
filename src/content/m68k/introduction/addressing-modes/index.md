The instruction set lecture wrote the two operands of an instruction as `source` and `destination`
without saying what can go in them. This is what can, and the way an operand is written is its
**addressing mode**. Here is the whole set, with the C that means the same thing.

| mode                       | written     | in C                     |
| -------------------------- | ----------- | ------------------------ |
| data register              | `d0`        | `x`                      |
| address register           | `a0`        | `p`                      |
| immediate                  | `#7`        | `7`                      |
| absolute                   | `numbers`   | `total`, a global's name |
| indirect                   | `(a0)`      | `*p`                     |
| indirect with displacement | `4(a0)`     | `p[1]`, `s->field`       |
| indexed                    | `(a0, d1)`  | `p[i]`                   |
| indexed with displacement  | `4(a0, d1)` | `p[i + 1]`               |
| postincrement              | `(a0)+`     | `*p++`                   |
| predecrement               | `-(a0)`     | `*--p`                   |

The first three name a value the CPU already has or the assembler already knows. The rest name an
address, and the instruction goes to memory for what is there.

## Registers, numbers and one fixed address

`d0` and `a0` are the registers themselves, read or written directly. `#7` is the number 7, carried
inside the instruction, and it can be anything the assembler can work out while assembling: `#$FF*2`,
`#'a'`, `#numbers`. `numbers` written without the `#` is the address the assembler gave that label,
and the instruction goes and reads or writes the memory there.

That `#` is the whole difference between three useful instructions:

- `move.l #numbers, a0` puts the **address** of `numbers` in `a0`.
- `move.l numbers, d0` puts the **long stored at** `numbers` in `d0`.
- `lea numbers, a0` puts the address in `a0` as well, and is what you actually write, because `lea`
  works with every address expression and never reads memory.

## The modes that go through an address register

Build this one with the memory panel open and step through it. It uses every mode in the table once.

```m68k|playground|memory|no-flags
    move.l #7, d0           ; immediate
    move.l d0, d1           ; data register
    lea numbers, a0         ; the address of numbers, nothing read
    move.l a0, d2           ; address register
    move.l numbers, d3      ; absolute
    move.l (a0), d4         ; indirect
    move.l 4(a0), d5        ; indirect with displacement
    move.l #8, d6
    move.l (a0, d6), d7     ; indexed

    org $2000
numbers: dc.l 10, 20, 30, 40
```

The `org $2000` puts the four longs at a known address, so `numbers` is `$2000` however long the code
above it gets:

| address | value      | which element |
| ------- | ---------- | ------------- |
| `$2000` | `0000000A` | `numbers[0]`  |
| `$2004` | `00000014` | `numbers[1]`  |
| `$2008` | `0000001E` | `numbers[2]`  |
| `$200C` | `00000028` | `numbers[3]`  |

`d3` and `d4` both come out at `0000000A`, one through the address the assembler wrote into the
instruction and one through the address that was in `a0` when the line ran. `d5` is `00000014`,
because `4(a0)` is `a0` plus 4. `d7` is `0000001E`, because `(a0, d6)` is `a0` plus whatever `d6`
holds, added while the instruction runs.

The three that involve `a0` differ in where the offset comes from:

- **`(a0)`** is the address in `a0`, nothing added.
- **`4(a0)`** adds a **constant** the assembler wrote into the instruction. Use it when you know the
  offset while you are writing the program: the second field of a record, `numbers[1]`.
- **`(a0, d6)`** adds a **register**, so the offset can change while the program runs. Use it when
  the offset is an index your program computed: `numbers[i]`.

`4(a0, d6)` does both, constant plus register plus base. The index register can be a data or an
address register, and `(sp, a0)` is as legal as `(a0, d6)`.

## Indexing an array

C hides the size of an element: `numbers[i]` in C means the address of `numbers` plus `i` times four,
because the elements are 4 byte longs. The M68K adds `d1` to `a0` and nothing else, so scaling the
index is your job, and a shift left by 2 is how it is done.

```m68k|playground|memory|no-flags
    lea numbers, a0
    move.l #2, d0           ; i = 2
    move.l d0, d1
    lsl.l #2, d1            ; i * 4, the size of a long
    move.l (a0, d1), d2     ; d2 = numbers[i]
    move.l 4(a0, d1), d3    ; d3 = numbers[i + 1]
    move.l #99, (a0, d1)    ; numbers[i] = 99

    org $2000
numbers: dc.l 10, 20, 30, 40
```

`d2` comes out at `0000001E`, which is 30, and `d3` at `00000028`, which is 40. The last line is the
same mode used as a destination, and the long at `$2008` becomes `00000063`, which is 99. Try
changing `move.l #2, d0` to `move.l #0, d0` and watching which long changes instead.

## Postincrement and predecrement

Two modes step the address register for you, by the **size of the instruction**: 1 for `.b`, 2 for
`.w`, 4 for `.l`.

- **`(a0)+`** reads or writes at `a0`, then adds the size to `a0`. It is `*p++` in C.
- **`-(a0)`** subtracts the size from `a0` first, then reads or writes at the new address. It is
  `*--p`.

```m68k|playground|memory|no-flags
    lea bytes, a0
    move.b (a0)+, d0    ; a byte, so a0 steps by 1
    move.b (a0)+, d1
    lea words, a1
    move.w (a1)+, d2    ; a word, so a1 steps by 2
    lea end, a2
    move.l -(a2), d3    ; a long, so a2 steps back by 4 first

    org $2000
bytes:  dc.b 1, 2, 3, 4
words:  dc.w $1111, $2222
last:   dc.l $AABBCCDD
end:
```

`d0` is 1 and `d1` is 2, and `a0` ends at `00002002`, two bytes on from where it started. `a1` ends
at `00002006`, two bytes on from `$2004`, because the read was a word. `a2` started at `$200C`, the
address of `end`, stepped back to `$2008` and read the long there, so `d3` is `AABBCCDD` and `a2` is
`00002008`.

Walking an array forwards is `(a0)+` in a loop, and walking it backwards is `-(a0)` in a loop, with
no `add` of your own either way. `-(sp)` and `(sp)+` are the same two modes on `a7`, which is what
makes them a push and a pop; that is the stack lecture.

## Not every instruction takes every mode

The two operands of an instruction each accept their own set, and the sets are not the same. `swap`
takes `Dn`. `lea` takes an address and an address register. `eor` insists on a data register as its
source. `move` takes almost anything on the left and anything but an immediate on the right, since
you cannot write into a number.

The documentation page of each instruction lists what its operands accept, written as `Dn`, `An`,
`(An)`, `Im`, `ea` and `(An, Xn)`. An operand outside that set is a build error on that line.

## Your turn

The four longs are at `$2000`, where the `org` puts them. Leave `numbers[2]` in `d0`, working the
address out at run time with the indexed mode rather than writing `$2008` yourself.

```m68k|playground|memory|exercise
* your code here

    org $2000
numbers: dc.l 10, 20, 30, 40
```

```testcase
{
    "expectedRegisters": { "d0": 30 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    lea numbers, a0     ; the base
    move.l #8, d1       ; element 2 of longs is 8 bytes in
    move.l (a0, d1), d0

    org $2000
numbers: dc.l 10, 20, 30, 40
```

</details>

The second one wants the **address** of `numbers[3]` in `a1`, with nothing read from memory. It is
`$200C`, and `lea` is the instruction that gets it there.

```m68k|playground|memory|exercise
* your code here

    org $2000
numbers: dc.l 10, 20, 30, 40
```

```testcase
{
    "expectedRegisters": { "a1": "0x200C" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    lea numbers, a0     ; the base
    lea 12(a0), a1      ; three longs further on

    org $2000
numbers: dc.l 10, 20, 30, 40
```

</details>
