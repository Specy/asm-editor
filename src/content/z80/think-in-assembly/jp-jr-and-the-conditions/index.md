The F register lecture showed `cp` writing the flags and one jump reading them. Let's now write the
control flow of a real program out of those two, starting from the C.

## An if, flattened

Say we want this:

```c
int x = 50;
if (x >= 10) {
    x = 100;
} else {
    x = 200;
}
```

Assembly runs top to bottom and jumps, so the first step is to write the `if` as a `goto`, the way
the general course did. Flip the condition and jump over the true branch:

```c
    int x = 50;
    if (x < 10) goto smaller;
    x = 100;
    goto done;
smaller:
    x = 200;
done:
```

Every line of that has an instruction. `x` lives in `a`, the `if` is a `cp` and a conditional jump,
and the two `goto`s are unconditional jumps.

```z80|playground
    .org 0x8000
    ld a, 50        ; x = 50
    cp 10           ; compare x with 10
    jr c, smaller   ; if(x < 10) goto smaller
    ld a, 100       ; x = 100
    jr done         ; goto done
smaller:
    ld a, 200       ; x = 200
done:
    halt
```

`a` comes out at `64`, which is 100. `cp 10` computes `a - 10` and throws the answer away, and `C` is
set when that subtraction borrowed, which is when `a` was the smaller of the two. So `jr c` is
"jump if `a` was less than 10", reading them as unsigned numbers.

Try changing `ld a, 50` to `ld a, 5` and running again: the jump is taken and `a` comes out at `C8`,
which is 200.

`smaller` and `done` are labels, which is to say addresses, and `jr done` on the fifth line exists
for the same reason the `goto done` does in the C: without it the program would fall into the `else`
branch and run both.

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
    jp z, zero      ; if(a == 0) goto zero
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

Try changing `ld a, 5` to `ld a, 3` and then to `ld a, 9`, and watch `d` come out at 2 and 1. The
order matters: `jr z` has to come first, because a `cp` of two equal numbers leaves `C` at 0, so with
the two jumps the other way round the equal case would fall through into the "larger" branch.

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

`b` comes out at `01`. Try changing `bit 0, a` to `bit 1, a`: bit 1 of `0b101` is 0, `Z` goes to 1,
the jump is taken and `b` stays 0.

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

That is a function pointer in C, `f()` where `f` is a variable, and it is also how a `switch` is
written when the cases are dense: put the addresses in a table with `.dw`, index into it, load the
address into `hl` and `jp (hl)`. The `jump-table` Example of this course does exactly that.

## Your turn

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
