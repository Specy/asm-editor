Every instruction has to say what it works on, and there is more than one way to say it. `ld a, 7`
names a number outright. `ld a, (hl)` names no number at all; it points at a register that holds an
address, and the value is fetched from there when the instruction runs. Those are two different
**addressing modes**, and the Z80 has seven of them.

Learning them is not bookkeeping. Which modes exist is what decides whether a piece of code is three
instructions or ten, and the one mode this machine does not have shapes more of your code than any
of the seven it does.

## The seven

| mode              | written        | where the value comes from                                      |
| ----------------- | -------------- | --------------------------------------------------------------- |
| immediate         | `7`, `0x1234`  | the number is part of the instruction itself                    |
| register          | `a`, `hl`      | it is already in the CPU, and no memory is touched              |
| register indirect | `(hl)`         | from memory, at whatever address the pair holds when it runs    |
| extended          | `(0x9000)`     | from memory, at a fixed address written into the instruction    |
| indexed           | `(ix+2)`       | from memory, at `ix` plus a fixed offset in the instruction     |
| relative          | `jr loop`      | the jump target is the program counter plus a small signed step |
| implied           | `and b`, `daa` | the second value is not written down, because it is always `a`  |

Open the memory panel and step through this one. Every line is labelled with the mode it uses.

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, 7             ; immediate:  the 7 is in the instruction
    ld b, a             ; register:   no memory is touched
    ld a, (numbers)     ; extended:   the address is in the instruction
    ld hl, numbers      ; immediate again, 16 bits of it this time
    ld c, (hl)          ; indirect:   the address is in hl
    ld ix, numbers
    ld d, (ix+2)        ; indexed:    ix plus two, read
    ld (ix+2), a        ; and the same mode, writing
    halt
numbers: .db 10, 20, 30, 40
```

`a` and `c` both come out at `0A`, one read through the address the assembler knew and one through
the address in `hl`. `b` is 7 and `d` is `1E`, which is 30. The last instruction wrote 10 over
`numbers[2]`, so the four bytes at `0x8015` read `0A 14 0A 28` when the program finishes.

## Immediate, and what fits in one

An immediate is a number written into the instruction, and there are two sizes because the
destination has two sizes: `ld a, 7` carries one byte, `ld hl, 0x1234` carries two. A label is a 16
bit immediate, since a label is just the address of whatever comes after it, which is why
`ld hl, numbers` and `ld hl, 0x8015` assemble to the same three bytes in the program above.

Only `ld` takes a 16 bit immediate. Everything else that takes an immediate takes a byte, so
`add a, 300` is not an instruction, and the arithmetic on a pair goes through another pair.

## Register indirect, and which pairs can

`(hl)`, `(bc)` and `(de)` all mean "the byte at the address in this pair", and they are not
interchangeable:

- **`(hl)`** works wherever an 8 bit register works, in both directions. `ld b, (hl)`, `ld (hl), c`,
  `add a, (hl)`, `inc (hl)`, `bit 3, (hl)`.
- **`(bc)`** and **`(de)`** work only with `a`, and only as `ld a, (bc)` and `ld (bc), a`.

So a program that walks one array keeps its pointer in `hl`, and one that copies between two keeps
the source in `hl` and the destination in `de`, doing the write through `a`.

## Extended, and who is allowed

`(0x9000)` is an address fixed at the moment the program is assembled, so an `equ` or a label works
just as well as a number. The rule to remember is who is allowed to use it:

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, (total)       ; a can read a bare address
    ld (total), a       ; and write one
    ld hl, (total)      ; the pairs can too, two bytes at a time
    ld (0x9000), hl
    ld sp, (total)      ; sp and the index registers as well
    halt
total:  .dw 0x1234
```

`a` comes out at `34` rather than `12`: `a` is one byte, the word at `total` is two, and the byte it
gets is the one at the lower address, which little endian makes the low half of the number.

`ld b, (total)` is not an instruction and the build fails with "no variant found for ld". Among the 8
bit registers only the accumulator can name an address directly, which is one of the reasons your
values keep passing through `a`.

## Indexed

`(ix+dd)` is `ix` plus a **signed byte written into the instruction**, anywhere from -128 to 127.
It exists for one job: a small bundle of related bytes, kept together in memory, where you want to
reach one particular byte of it. Put the address of the bundle in `ix` once, and every field is a
fixed distance from there.

```z80|playground|memory|no-flags
X       equ 0
Y       equ 1
LIVES   equ 2

    .org 0x8000
    ld ix, player       ; ix = where the player's three bytes start
    ld a, (ix+X)        ; a = the player's x
    add a, (ix+Y)       ; plus the player's y
    ld (ix+LIVES), 3    ; write 3 into the player's lives
    ld iy, enemy        ; a second bundle, in the other index register
    ld b, (iy+X)        ; b = the enemy's x
    halt

player: .db 10, 20, 0
enemy:  .db 90, 60, 0
```

The three `equ` lines at the top are what makes this readable. `(ix+X)` says what it is fetching;
`(ix+0)` would not. And if the bytes are ever rearranged, only those three lines change.

The displacement is a **constant**, decided when the program is assembled. You cannot write
`(ix+e)` to index by a register, and the build fails if you try.

## Relative

`jr` and `djnz` do not carry an address. They carry one signed byte, which the CPU adds to the
program counter, so they reach from 128 bytes back to 127 bytes forward and no further. The assembler
works the byte out from the label you wrote and reports an error when the target is out of reach:
"destination is too far by 73 bytes for relative jump; use jp".

`jp` carries the full 16 bit address instead, and reaches anywhere. That makes `jr` two bytes and `jp`
three, which is the trade, and the branching lecture goes through when to write which.

## Reading `a[i]` when `i` is in a register

Every mode so far adds either nothing or a fixed number written into the instruction. None of them
adds a value the program worked out while it was running, and that is exactly what an array index
is: `i` changes every time round a loop. `(hl+de)` is not an instruction, and neither is `(ix+e)`.

So the addition is written out, and then the result is read through `(hl)`:

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, 2             ; i = 2
    ld e, a             ; the low half of the offset
    ld d, 0             ; and the high half, since a byte index is positive
    ld hl, numbers      ; hl = the start of the array
    add hl, de          ; hl = the start plus i
    ld a, (hl)          ; and read what is there
    halt
numbers: .db 10, 20, 30, 40
```

`a` comes out at `1E`, the third number. Four instructions, and they are the shape every indexed read
on this machine takes: widen the index into a pair, `add hl, de` to get the address, then read
through `(hl)`. Worth learning as one move, because you will write it constantly.

Elements bigger than a byte cost more, because the index has to be scaled first. `numbers` as an
array of 16 bit words would need the index doubled, which is `add hl, hl` on the index before adding
the base, or `sla e` and `rl d` on the pair.

## Two reads to write

The test starts `ix` at `0x9000`, where four bytes are waiting, 10, 20, 30 and 40. Leave the third of
them in `a` in a single instruction.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "ix": "0x9000" },
    "startingMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": [10, 20, 30, 40] }
    ],
    "expectedRegisters": { "a": 30 }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld a, (ix+2)        ; two along from where ix points
    halt
```

</details>

The second one has the index in a register instead. The test starts `hl` at `0x9000` and `a` at 3,
with the same four bytes there. Leave `numbers[a]`, which is 40, in `a`.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "hl": "0x9000", "a": 3 },
    "startingMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": [10, 20, 30, 40] }
    ],
    "expectedRegisters": { "a": 40 }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld e, a             ; widen the index into de
    ld d, 0
    add hl, de          ; the start plus the index
    ld a, (hl)          ; and read it
    halt
```

</details>
