The lectures so far have used about twenty instructions, and if you open the full list you will find
well over a thousand entries. That number is much less frightening than it looks, because almost all
of it is repetition: every combination of registers is its own entry, so `ld b, c` and `ld b, d`
count as two, and `ld` on its own runs to hundreds.

Nobody learns a list like that. What you learn is the shape one instruction takes and the handful of
families they fall into, and then the [instruction
reference](/documentation/z80/instruction) answers everything else when you need it.

## The shape

A Z80 instruction is **one to four bytes**, and the first byte is usually the whole opcode. The
operands are what make it longer: an 8 bit immediate adds one byte, a 16 bit address adds two.

One byte holds 256 different values, so a machine whose opcodes are one byte can have at most 256
instructions. The Z80 has far more than that, and the trick is four **prefix** bytes. A prefix does
not do anything itself; it says "read the next byte from a different table":

| prefix | what it selects                                              |
| ------ | ------------------------------------------------------------ |
| `CB`   | the bit, shift and rotate instructions                       |
| `ED`   | the block instructions, `neg`, `im`, `in r,(c)`, `sbc hl,rr` |
| `DD`   | the same instruction again, with `ix` in place of `hl`       |
| `FD`   | the same instruction again, with `iy` in place of `hl`       |

Build this one without running it and read the bytes in the memory panel.

```z80|playground|memory|no-flags
    .org 0x8000
    nop             ; 00
    ld a, 5         ; 3E 05
    ld hl, 0x1234   ; 21 34 12
    ld ix, 0x1234   ; DD 21 34 12
    bit 7, a        ; CB 7F
    ld a, (ix+2)    ; DD 7E 02
    halt            ; 76
```

The panel reads `00 3E 05 21 34 12 DD 21 34 12 CB 7F DD 7E 02 76`, which is the comments spelled out.
`ld ix, 0x1234` is `ld hl, 0x1234` with a `DD` in front of it, and that is literally how the CPU
decodes it: the prefix says "wherever this instruction would have used `hl`, use `ix`". That is also
why `(ix+dd)` costs an extra prefix byte and an extra displacement byte over `(hl)`, and why the
index registers are slower.

## The families

| family                | instructions                                                                   |
| --------------------- | ------------------------------------------------------------------------------ |
| load and exchange     | `ld`, `ex`, `exx`, `push`, `pop`                                               |
| 8 bit arithmetic      | `add`, `adc`, `sub`, `sbc`, `inc`, `dec`, `cp`, `neg`, `daa`                   |
| 16 bit arithmetic     | `add hl,rr`, `adc hl,rr`, `sbc hl,rr`, `inc rr`, `dec rr`                      |
| logic                 | `and`, `or`, `xor`, `cpl`                                                      |
| rotate and shift      | `rlc`, `rl`, `rrc`, `rr`, `sla`, `sra`, `srl`, `rld`, `rrd`, and the `a` forms |
| bits                  | `bit`, `set`, `res`                                                            |
| jump, call and return | `jp`, `jr`, `djnz`, `call`, `ret`, `rst`, `reti`, `retn`                       |
| block                 | `ldi`, `ldd`, `ldir`, `lddr`, `cpi`, `cpd`, `cpir`, `cpdr`                     |
| input and output      | `in`, `out`, `ini`, `ind`, `inir`, `indr`, `outi`, `outd`, `otir`, `otdr`      |
| CPU control           | `nop`, `halt`, `di`, `ei`, `im`, `scf`, `ccf`                                  |

Two of those families are worth naming now, because they are where this machine surprises people.
**Input and output** is a second address space of its own, reached only with `in` and `out`, and it
is where printing lives; the last module of this course is about it. **Block** instructions do a
whole loop in a single instruction.

## The block instructions read as three letters

`ldir` looks like noise until you take it apart, and then the eight of them fall out of one pattern:

- the first two letters are the operation: **`ld`** copies a byte from `(hl)` to `(de)`, **`cp`**
  compares `(hl)` against `a`.
- the next letter is the direction: **`i`** increments the pointers after each byte, **`d`**
  decrements them.
- an **`r`** on the end means **repeat**, until `bc` counts down to zero.

So `ldi` copies one byte and steps forward, `ldir` copies `bc` bytes forward, `lddr` copies `bc`
bytes backwards, `cpir` searches forward for the byte in `a`, and `cpdr` searches backwards. All
eight of them use `hl` as the source, `de` as the destination and `bc` as the count, which is where
those three pairs got the jobs the registers lecture gave them.

```z80|playground|memory|no-flags
    .org 0x8000
    ld hl, source   ; from
    ld de, dest     ; to
    ld bc, 4        ; how many bytes
    ldir            ; one instruction, four bytes copied
    halt
source: .db 0xAA, 0xBB, 0xCC, 0xDD
dest:   .ds 4
```

Type `800b` into the memory panel's address box and run it. The four bytes appear after the four
originals, `bc` comes out at 0, and `hl` and `de` are both one past the end of what they touched.

## The letters on the end of a mnemonic

Most of the odd looking names are an abbreviation plus a suffix, and the suffix is doing the work:

- **`c` on a rotate** means **circular**: `rlc` rotates left and the bit that falls off the top comes
  back in at the bottom, while `rl` rotates left **through the carry**, so the bit that falls off goes
  into `C` and the old `C` comes in at the bottom.
- **`a` on a rotate** means the one byte form that works on the accumulator: `rlca`, `rla`, `rrca` and
  `rra`. They do the same rotation as `rlc a`, `rl a` and so on, in one byte instead of two, and they
  set fewer flags: only `C`, `H` and `N`, leaving `S`, `Z` and `P/V` alone.
- **`c` on an arithmetic instruction** means **with carry**: `adc` adds the carry in as well as the
  two operands, `sbc` subtracts it. That is how you add numbers wider than the registers.
- **`ret` plus a letter** is `reti` and `retn`, the returns from an interrupt and from a non maskable
  interrupt, which the interrupts lecture comes to.

```z80|playground
    .org 0x8000
    ld a, 0x81      ; 1000 0001
    rlca            ; circular: the 1 comes back in at the bottom
    ld b, a
    ld a, 0x81
    scf             ; C = 1
    rla             ; through the carry: the old C comes in at the bottom
    ld c, a
    ld a, 0x0F
    cpl             ; a = ~a, the one's complement
    halt
```

`b` and `c` both come out at `03` and `a` at `F0`. The two rotates landing on the same answer is an
accident of this input: the carry happened to be 1 and the bit that fell off the end was 1 as well,
so it made no difference which of them came round. Replace the `scf` with `ccf` so the carry is 0
instead and they part company, `c` coming out at `02` while `b` stays `03`.

## Names to recognise

Some of the mnemonics are short for something you would not guess:

| written | short for                      | what it does                                  |
| ------- | ------------------------------ | --------------------------------------------- |
| `ld`    | load                           | copies anything to anything, the only move    |
| `cp`    | compare                        | `a` minus the operand, flags only             |
| `cpl`   | complement                     | flips every bit of `a`                        |
| `jp`    | jump                           | jumps to a 16 bit address                     |
| `jr`    | jump relative                  | jumps by a signed byte, so nearby only        |
| `djnz`  | decrement and jump if not zero | one instruction of loop, counting in `b`      |
| `scf`   | set carry flag                 | `C` = 1                                       |
| `ccf`   | complement carry flag          | `C` = not `C`                                 |
| `daa`   | decimal adjust accumulator     | fixes `a` up after adding BCD digits          |
| `rst`   | restart                        | a one byte call to one of eight low addresses |
| `im`    | interrupt mode                 | picks how the CPU answers an interrupt        |

`rst n` calls address `0x00`, `0x08`, `0x10` up to `0x38` in one byte, which is why those addresses
are reserved, and on a real machine the ROM put a useful routine at each of them. This editor loads
nothing into low memory, so a `rst` here calls into a run of zeroes and the run ends there. Recognise
it in other people's code and do not write it in yours.

## Undocumented instructions

Zilog's manual does not list every opcode the silicon actually implements. `sll`, which shifts left
and puts a 1 in at the bottom, works on every Z80 ever made and appears in no official document, and
so do `ixh` and `ixl`, the two halves of `ix` used as ordinary 8 bit registers.

People found them, used them, and printed programs containing them in magazines. This emulator runs
them and the instruction reference marks them with a badge, so a listing you type in from somewhere
will work here.

## Your turn

The test starts `hl` at `0x9000`, `de` at `0x9010` and `bc` at 5, with the five bytes 1 to 5 sitting
at `0x9000`. Copy them to `0x9010` in one instruction.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "hl": "0x9000", "de": "0x9010", "bc": 5 },
    "startingMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": [1, 2, 3, 4, 5] }
    ],
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9010", "bytes": 1, "expected": [1, 2, 3, 4, 5] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ldir            ; copy bc bytes from (hl) to (de), going forwards
    halt
```

</details>

The second one starts `a` at `0x0F` and asks for `0xF0` in `b` and `0x1E` in `c`. One of those is `a`
with every bit flipped and the other is `a` shifted one place left, and each of them is a single
instruction plus the `ld` that moves the answer out of the accumulator.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": "0x0F" },
    "expectedRegisters": { "bc": "0xF01E" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    cpl             ; a = ~a, which is 0xF0
    ld b, a
    cpl             ; back to 0x0F
    rlca            ; shifted one place left, which is 0x1E
    ld c, a
    halt
```

</details>
