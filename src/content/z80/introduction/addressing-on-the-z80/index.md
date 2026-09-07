An **addressing mode** is how an instruction names the thing it works on. The general course listed
five of them and said each language spells them differently. Here are the Z80's, which are seven, and
the one it does not have, which shapes more of your code than any of the seven.

## The seven

| mode              | written        | in C           | what the CPU does                                  |
| ----------------- | -------------- | -------------- | -------------------------------------------------- |
| immediate         | `7`, `0x1234`  | `x = 7`        | the number is inside the instruction               |
| register          | `a`, `hl`      | `x = y`        | there is no address, the value is in the CPU       |
| register indirect | `(hl)`         | `x = *p`       | the address is in the pair, read when it runs      |
| extended          | `(0x9000)`     | `x = total`    | the address is inside the instruction              |
| indexed           | `(ix+2)`       | `x = p->field` | the address is `ix` plus a byte in the instruction |
| relative          | `jr loop`      | `goto loop`    | the target is `pc` plus a signed byte              |
| implied           | `and b`, `daa` |                | the operand is not written, `a` is understood      |

The Z80's own manual counts a couple more (bit addressing for `bit 3, a`, and the eight fixed
addresses of `rst`), and those two are really the operand being written into the opcode.

Build this one, open the memory panel and press **Step** through it.

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, 7             ; immediate:  x = 7
    ld b, a             ; register:   y = x
    ld a, (numbers)     ; extended:   z = numbers[0]
    ld hl, numbers      ; immediate again, this time 16 bit: p = numbers
    ld c, (hl)          ; indirect:   w = *p
    ld ix, numbers
    ld d, (ix+2)        ; indexed:    v = p[2]
    ld (ix+2), a        ; and the same mode writing: p[2] = z
    halt
numbers: .db 10, 20, 30, 40
```

`a` and `c` both come out at `0A`, one read through the address the assembler knew and one through
the address in `hl`. `b` is 7 and `d` is `1E`, which is 30. The last instruction wrote 10 over
`numbers[2]`, so the four bytes at `0x8015` read `0A 14 0A 28` when the program finishes.

Try changing `ld d, (ix+2)` to `ld d, (ix+3)` and the read moves to the 40.

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

`(0x9000)` is an address written into the instruction, which is a global variable in C. The rule to
remember is who can use it:

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

`a` comes out at `34`, the low byte of the word at `total`, because `a` is one byte and the low byte
is the one at the lower address. `hl` comes out at `1234`.

`ld b, (total)` is not an instruction and the build fails with "no variant found for ld". Among the 8
bit registers only the accumulator can name an address directly, which is one of the reasons your
values keep passing through `a`.

## Indexed

`(ix+dd)` is `ix` plus a **signed byte written into the instruction**, -128 to 127. In C that is
`p->field`: a pointer to the start of a record and a fixed offset to one field of it.

```z80|playground|memory|no-flags
X       equ 0
Y       equ 1
LIVES   equ 2

    .org 0x8000
    ld ix, player       ; p = &player
    ld a, (ix+X)        ; a = p->x
    add a, (ix+Y)       ; a = a + p->y
    ld (ix+LIVES), 3    ; p->lives = 3
    ld iy, enemy        ; a second record, in the other index register
    ld b, (iy+X)        ; b = q->x
    halt

player: .db 10, 20, 0
enemy:  .db 90, 60, 0
```

`a` comes out at `1E`, which is 30, and `b` at `5A`, which is 90. The `equ` lines are the field names,
so the code reads as `p->x` instead of `(ix+0)`, and moving a field around means changing one line.

The displacement is a **constant**, decided when the program is assembled. You cannot write
`(ix+e)` to index by a register, and the build fails if you try.

## Relative

`jr` and `djnz` do not carry an address. They carry one signed byte, which the CPU adds to the
program counter, so they reach from 128 bytes back to 127 bytes forward and no further. The assembler
works the byte out from the label you wrote and reports an error when the target is out of reach:
"destination is too far by 73 bytes for relative jump; use jp".

`jp` carries the full 16 bit address instead, and reaches anywhere. That makes `jr` two bytes and `jp`
three, which is the trade, and the branching lecture goes through when to write which.

## The mode the Z80 does not have

There is no base plus index mode. On the M68K `(a0, d1)` reads the byte at `a0` plus whatever `d1`
holds when the instruction runs; on MIPS and RISC-V you write the addition out and then load. The Z80
has neither: `(hl+de)` is not an instruction, `(ix+e)` is not an instruction, and the only thing that
gets added to an address is a constant.

So `a[i]`, with `i` in a register, is written out:

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, 2             ; i = 2
    ld e, a             ; the low half of the offset
    ld d, 0             ; and the high half, since a byte index is positive
    ld hl, numbers      ; p = numbers
    add hl, de          ; p = p + i
    ld a, (hl)          ; x = *p, which is numbers[i]
    halt
numbers: .db 10, 20, 30, 40
```

`a` comes out at `1E`, which is `numbers[2]`. Four instructions where the M68K writes one, and this is
the shape every indexed read on this machine takes: widen the index into a pair, `add hl, de`, then
read through `(hl)`.

Elements bigger than a byte cost more, because the index has to be scaled first. `numbers` as an
array of 16 bit words would need the index doubled, which is `add hl, hl` on the index before adding
the base, or `sla e` and `rl d` on the pair.

Try changing `ld a, 2` to `ld a, 3` and see 40 come out instead.

## Your turn

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
    ld a, (ix+2)        ; the third byte of the record ix points at
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
    add hl, de          ; p = p + i
    ld a, (hl)          ; x = *p
    halt
```

</details>
