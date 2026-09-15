So far every operand has been a register or a number written into the instruction. That is enough
for arithmetic and nothing else. The moment your data is an array in memory, you need to say things
like "the long eight bytes past wherever `a0` is pointing", and you need to say them without knowing
the address while you are writing the program.

The way an operand is written is called its **addressing mode**, and the M68K has ten of them. Three
name something the CPU already has. Seven name an address, and the instruction goes to memory for
whatever is there.

Throughout this page, `numbers` is an array of four longs and `numbers[2]` means its third element.

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

Build this one with the memory panel open and step through it.

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

`d3` and `d4` both fetch the first element, one through an address the assembler wrote into the
instruction and one through an address that was sitting in `a0` when the line ran. That second way is
the one that matters, because `a0` can change and the instruction cannot.

The three that involve `a0` differ in where the offset comes from:

- **`(a0)`** is the address in `a0`, nothing added.
- **`4(a0)`** adds a **constant**, decided when you write the program and baked into the
  instruction. That constant is called the **displacement**. Use it for an offset you already know:
  the second field of a record, `numbers[1]`.
- **`(a0, d6)`** adds a **register**, so the offset can be worked out while the program runs. Use it
  when the offset is an index your program computed: `numbers[i]`.

`4(a0, d6)` does both at once: base, plus register, plus constant. The index register can be a data
or an address register, and `(sp, a0)` is as legal as `(a0, d6)`.

## Indexing an array

There is one thing to watch. `(a0, d1)` adds `d1` to `a0` and does nothing else, so `d1` has to be a
number of **bytes**, not a number of elements. The elements here are longs, four bytes each, so
element `i` is at `i * 4`, and shifting left by 2 is how you multiply by 4.

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

Forget that shift and everything still assembles and still runs. Delete the `lsl.l #2, d1` and step
through it: `d1` stays at 2, so the address comes out as `$2002`, two bytes into the first element,
and the long read from there is the back half of `numbers[0]` joined to the front half of
`numbers[1]`, which is `000A0000`. Nothing complained. The index was in the wrong units and the
machine had no way of knowing.

The last line is the same mode used as a destination, which is worth noticing: an addressing mode is
a way of naming a place, and most places can be read from and written to.

## Postincrement and predecrement

Walking an array means adding the element size to a pointer on every pass, which is a whole extra
instruction inside your loop. Two modes do it for you, stepping the address register by the **size of
the instruction**: 1 for `.b`, 2 for `.w`, 4 for `.l`.

- **`(a0)+`** reads or writes at `a0`, then adds the size to `a0`.
- **`-(a0)`** subtracts the size from `a0` first, then reads or writes at the new address.

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

`a0` ends at `00002002`, two bytes on from where it started, because two byte reads moved it by one
each. `a1` ends at `00002006`, two on from `$2004`, because one word read moved it by two. And `a2`
started at `$200C`, which is the address of `end`, stepped **back** to `$2008` and read the long
there, which is why `-(a0)` is what you walk an array backwards with: it arrives at the last element
without you having to work out where the last element is.

`-(sp)` and `(sp)+` are these same two modes applied to `a7`, which is what makes them a push and a
pop. That is the stack lecture.

## All ten, together

| mode                       | written     | what it names                            |
| -------------------------- | ----------- | ---------------------------------------- |
| data register              | `d0`        | the register                             |
| address register           | `a0`        | the register                             |
| immediate                  | `#7`        | a number inside the instruction          |
| absolute                   | `numbers`   | one address, fixed at assembly time      |
| indirect                   | `(a0)`      | the address in `a0`                      |
| indirect with displacement | `4(a0)`     | `a0` plus a constant                     |
| indexed                    | `(a0, d1)`  | `a0` plus a register                     |
| indexed with displacement  | `4(a0, d1)` | `a0` plus a register plus a constant     |
| postincrement              | `(a0)+`     | the address in `a0`, then `a0` moves on  |
| predecrement               | `-(a0)`     | `a0` moves back first, then that address |

The two operands of an instruction each accept their own set of these, and the sets are not the same.
`swap` takes a data register. `lea` takes an address and an address register. `eor` insists on a data
register as its source. `move` takes almost anything on the left and anything but an immediate on the
right, since you cannot write into a number.

Each instruction's documentation page lists what its operands accept, written as `Dn`, `An`, `(An)`,
`Im`, `ea` and `(An, Xn)`. Anything outside that set is a build error on that line.

## Your turn

The four longs sit at `$2000`. Put `numbers[2]` in `d0`, and work the address out at run time with
the indexed mode instead of writing `$2008` into your program.

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

This time the **address** of `numbers[3]`, in `a1`, with nothing read out of memory at all. It comes
to `$200C`.

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
