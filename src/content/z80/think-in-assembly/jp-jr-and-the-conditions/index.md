Here is something to write: a number starts at 50, and it should end up at 100 if it is 10 or more
and at 200 if it is smaller.

There is nothing in assembly that groups instructions together. No braces, no blocks, and the
indentation means nothing to the assembler. A program is a list of instructions and the CPU walks
down it, one after another, for ever. The only way to not run something is to jump over it.

So every choice in assembly comes out the same shape: test, then jump over the part you do not want.
And the part you do want has to end with a jump of its own, or the CPU carries straight on into the
other one.

```z80|playground
    .org 0x8000
    ld a, 50        ; x = 50
    cp 10           ; compare x with 10
    jr c, smaller   ; if a is less than 10, skip the next two lines
    ld a, 100       ; the 10-or-more answer
    jr done         ; and jump over the other arm
smaller:
    ld a, 200       ; the smaller answer
done:
    halt
```

Follow the two paths through it:

```
        ld a, 50
        cp 10
        jr c, smaller  ------+   taken only when a is less than 10
        ld a, 100            |
        jr done  ---------+  |   jumps over the other arm
smaller:                  |  |
        ld a, 200  <------|--+
done:                     |
        halt       <------+
```

`cp 10` computes `a - 10`, throws the answer away and keeps only what the subtraction did to the
flags. `C` is set when that subtraction had to borrow, which is exactly when `a` was the smaller of
the two, so `jr c` means "jump if `a` was less than 10", reading both as unsigned numbers.

`smaller` and `done` are labels, which is to say names for addresses. The `jr done` in the middle is
the instruction people leave out: without it the program finishes the first arm and then walks
straight into the second one, so `a` ends up at 200 no matter what the comparison said.

## Two jumps

The Z80 has two unconditional jumps and they go to the same place by different means.

| written    | bytes | reaches               | how                               |
| ---------- | ----- | --------------------- | --------------------------------- |
| `jp label` | 3     | anywhere in the 64 KB | the address is in the instruction |
| `jr label` | 2     | 128 back, 127 forward | a signed byte added to `pc`       |

```z80|playground|memory|no-flags
    .org 0x8000
    jr next         ; 18 00: the opcode and a displacement of 0
next:
    jp after        ; C3 05 80: the opcode and the address 0x8005
after:
    halt
```

Build it and read the memory panel: `18 00 C3 05 80 76`. The `jr` carries the number 0, which is how
far to jump from the instruction after it, and the `jp` carries `05 80`, which is `0x8005` written
little endian.

The assembler works the displacement out from the label, so you write the same thing either way. What
it cannot do is stretch it: a `jr` to a label more than 127 bytes ahead fails the build with
"destination is too far by 73 bytes for relative jump; use jp", and the fix is in the message.

Which to write: `jr` inside a loop or an `if`, where the target is a few instructions away, and `jp`
for anything that leaves the neighbourhood. On a real Z80 `jr` is one byte shorter and slower when
taken, so the choice was never obvious; here it is a matter of range.

## The conditions

`jp` takes all eight conditions from the F register lecture. **`jr` takes only four**, because a two
byte instruction had no room for more:

| condition | `jp` | `jr` | jumps when                            |
| --------- | ---- | ---- | ------------------------------------- |
| `nz`      | yes  | yes  | `Z` is 0                              |
| `z`       | yes  | yes  | `Z` is 1                              |
| `nc`      | yes  | yes  | `C` is 0                              |
| `c`       | yes  | yes  | `C` is 1                              |
| `po`      | yes  | no   | `P/V` is 0, no overflow               |
| `pe`      | yes  | no   | `P/V` is 1, overflow                  |
| `p`       | yes  | no   | `S` is 0, the result was not negative |
| `m`       | yes  | no   | `S` is 1, the result was negative     |

So a branch on the sign or on an overflow is a `jp`, whatever the distance.

`cp` writes `Z` and `C` in one go as well, so a less, equal, greater decision is two conditional
jumps and no second comparison. This one asks all three questions in a row.

```z80|playground
    .org 0x8000
    ld a, 0
    or a            ; the flags now describe a
    jp z, zero      ; a was zero: go to the zero case
    ld b, 1
    jp checked
zero:
    ld b, 2
checked:
    ld a, 0x80      ; -128
    add a, 0x80     ; -128 + -128, which does not fit
    jp pe, over     ; P/V is the overflow after arithmetic
    ld c, 1
    jp compare
over:
    ld c, 2
compare:
    ld a, 5
    cp 5            ; one comparison, three answers
    jr z, same      ; Z says equal
    jr c, lower     ; C says a was smaller
    ld d, 1         ; and otherwise it was larger
    jr done
lower:
    ld d, 2
    jr done
same:
    ld d, 3
done:
    halt
```

`b` comes out at `02`, `c` at `02` and `d` at `03`. Neither `z` on the first test nor `pe` on the
second has a `jr` form here, so both of those jumps had to be `jp`; the three way comparison at the
end tests `Z` and `C`, which `jr` can do.

The order of the last two jumps matters, and getting it wrong is a quiet bug. `jr z` has to come
first, because a `cp` of two equal numbers leaves `C` at 0. Write them the other way round and the
`jr nc` catches the equal case on its way past, so "equal" reports itself as "larger".

## Branching on one bit

`bit n, r` tests one bit and sets `Z` from it, and the sense is backwards from what you would guess:
**`Z` is 1 when the bit is 0**. So `jr z` after a `bit` means "the bit was clear" and `jr nz` means
"the bit was set".

```z80|playground
    .org 0x8000
    ld a, 0b00000101
    ld b, 0
    bit 0, a        ; bit 0 is 1, so Z goes to 0
    jr z, done      ; not taken
    ld b, 1
done:
    halt
```

`or a` is the same idea for the whole register. It leaves `a` alone and sets `Z` from it, so
`or a` and `jr z` is how a program asks "is `a` zero", and it is one byte where `cp 0` is two.

## Jumping to an address in a register

`jp (hl)` sets the program counter to whatever `hl` holds. The parentheses are a lie inherited from
Zilog's own syntax: nothing is read from memory, the jump goes to the address _in_ `hl`, which is why
some assemblers spell it `jp hl`.

```z80|playground|no-flags
    .org 0x8000
    ld hl, second   ; a label is just an address
    jp (hl)         ; and this jumps to it
    ld a, 99        ; never runs
second:
    ld a, 7
    halt
```

`a` comes out at `07`. `jp (ix)` and `jp (iy)` do the same with the index registers, and there is no
conditional form of any of the three.

This is how you choose between many destinations without a chain of comparisons. Put the addresses
in a table with `.dw`, use the number you are switching on as the index into that table, load the
address it holds into `hl`, and `jp (hl)`. One lookup, however many cases there are. The Jump table
Example does exactly that.

## Two branches to write

The test starts `a` at 200. Leave 1 in `b` if `a` is 100 or more, and 2 if it is less, reading `a` as
an unsigned number. One `cp` and one conditional jump.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": 200 },
    "expectedRegisters": { "bc": "0x0100" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    cp 100          ; a - 100
    jr c, less      ; C is set when a was smaller
    ld b, 1
    jr done
less:
    ld b, 2
done:
    halt
```

</details>

The second one starts `a` at `0b00010000`. Leave 1 in `c` if bit 4 of `a` is set and 0 if it is not,
without changing `a`.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": "0b00010000" },
    "expectedRegisters": { "a": "0x10", "bc": "0x0001" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld c, 0
    bit 4, a        ; Z is 1 when the bit is 0
    jr z, done
    ld c, 1
done:
    halt
```

</details>
