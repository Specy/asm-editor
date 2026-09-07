The Z80 keeps six bits about how the last instruction came out, and they live in one byte called `f`.
The flags panel above the registers is that byte drawn one bit at a time, in the order the bits sit
in it, high bit first.

| bit |   7 |   6 |     5 |   4 |     3 |     2 |   1 |   0 |
| --- | --: | --: | ----: | --: | ----: | ----: | --: | --: |
| is  | `S` | `Z` | undoc | `H` | undoc | `P/V` | `N` | `C` |

- **`S`**, sign. A copy of bit 7 of the result, so it is 1 when the result read as a signed number is
  negative.
- **`Z`**, zero. 1 when the result was zero.
- **`H`**, half carry. The carry out of bit 3 into bit 4, which nothing but `daa` reads.
- **`P/V`**, parity or overflow. Three different jobs, below.
- **`N`**, add or subtract. 1 when the last instruction was a subtraction, which nothing but `daa`
  reads.
- **`C`**, carry. The carry out of bit 7 (or bit 15), the borrow of a subtraction, and the bit that
  falls out of a shift or a rotate.

Bits 3 and 5 are copies of bits 3 and 5 of the result. Zilog never documented them, real programs did
use them, and this editor does not show them.

The [instruction reference](/documentation/z80/instruction) prints the flags of each instruction as a
six character string in the order `C N P/V H Z S`, which is this table read from the bottom up, so
`add a,b` is `+0V+++`: `C` from the result, `N` reset, `P/V` holding the overflow, and `H`, `Z` and
`S` from the result.

## Which instructions write which

A flag is written from the result, forced to 0 or 1, or left exactly as it was, and knowing which is
the difference between a working comparison and a comparison that was destroyed two lines later.

| instruction                                    | `S` | `Z` | `H` | `P/V`    | `N` | `C` |
| ---------------------------------------------- | --: | --: | --: | -------- | --: | --: |
| `add`, `adc`, `sub`, `sbc`, `cp`, `neg`        |   ✓ |   ✓ |   ✓ | overflow |   ✓ |   ✓ |
| `inc r`, `dec r`                               |   ✓ |   ✓ |   ✓ | overflow |   ✓ |   - |
| `and`, `or`, `xor`                             |   ✓ |   ✓ |   ✓ | parity   |   0 |   0 |
| `rlc`, `rl`, `rrc`, `rr`, `sla`, `sra`, `srl`  |   ✓ |   ✓ |   0 | parity   |   0 |   ✓ |
| `rlca`, `rla`, `rrca`, `rra`                   |   - |   - |   0 | -        |   0 |   ✓ |
| `bit n, r`                                     |   ? |   ✓ |   1 | ?        |   0 |   - |
| `add hl,rr`, `add ix,rr`                       |   - |   - |   ✓ | -        |   0 |   ✓ |
| `adc hl,rr`, `sbc hl,rr`                       |   ✓ |   ✓ |   ✓ | overflow |   ✓ |   ✓ |
| `inc rr`, `dec rr`                             |   - |   - |   - | -        |   - |   - |
| `ld`, `ex`, `exx`, `push`, `pop`, `jp`, `call` |   - |   - |   - | -        |   - |   - |
| `ldi`, `ldd`, `ldir`, `lddr`                   |   - |   - |   0 | `bc` ≠ 0 |   0 |   - |
| `scf`                                          |   - |   - |   0 | -        |   0 |   1 |
| `ccf`                                          |   - |   - |   ✓ | -        |   0 |   ✓ |

✓ means set from the result, `0` and `1` mean forced, `-` means untouched, `?` means undefined.

Three rows of that decide how a program is written. **A load never touches a flag**, so unlike the
M68K, where a plain `move` sets them, you can compute an address in the middle of a comparison and
the branch still sees what the `cp` left. **`inc` and `dec` on an 8 bit register leave `C` alone**, so
a loop can count with `dec b` while keeping a carry from an addition. And **`inc` and `dec` on a pair
touch nothing at all**, so after `dec bc` there is no zero flag and you cannot branch on it.

```z80|playground
    .org 0x8000
    ld a, 200
    add a, 100      ; 300 does not fit: C goes to 1
    ld b, a         ; a load, which changes nothing
    ld a, 5
    inc a           ; writes S, Z, H and P/V, and leaves C alone
    ld hl, 1
    ld de, 1
    add hl, de      ; writes C and H, and leaves S, Z and P/V alone
    halt
```

| after this line | `S` | `Z` | `H` | `P/V` | `N` | `C` |
| --------------- | --: | --: | --: | ----: | --: | --: |
| `add a, 100`    |   0 |   0 |   0 |     0 |   0 |   1 |
| `ld b, a`       |   0 |   0 |   0 |     0 |   0 |   1 |
| `inc a`         |   0 |   0 |   0 |     0 |   0 |   1 |
| `add hl, de`    |   0 |   0 |   0 |     0 |   0 |   0 |

Step through it and watch `C`. It goes to 1 on the second line, survives the load and the `inc`, and
only the `add hl, de` on the last line puts it back to 0.

## The eight conditions

`jp`, `call` and `ret` all take a condition, and the same eight are written the same way:

| written | jumps when                 | reads      |
| ------- | -------------------------- | ---------- |
| `nz`    | not zero                   | `Z` is 0   |
| `z`     | zero                       | `Z` is 1   |
| `nc`    | no carry                   | `C` is 0   |
| `c`     | carry                      | `C` is 1   |
| `po`    | parity odd, or no overflow | `P/V` is 0 |
| `pe`    | parity even, or overflow   | `P/V` is 1 |
| `p`     | plus                       | `S` is 0   |
| `m`     | minus                      | `S` is 1   |

`jr` takes only the first four, because there was no room in a two byte instruction for more, and
that is the practical difference between `jr` and `jp` beyond the range. `po` and `pe` can also be
written `nv` and `v`, the spelling to reach for when the flag is holding an overflow. This assembler
accepts both names for the same condition.

The `c` in `jp c, label` is the **carry flag**, not the register `c`. `jp c, done` and `ld a, c`
have nothing to do with each other, and the assembler tells them apart by where the `c` is.

## cp, and comparing unsigned numbers

`cp n` computes `a - n`, throws the answer away and keeps the flags. For **unsigned** numbers the two
flags you want are `Z` and `C`, and the four cases fall out of them:

| you want | after `cp n` |
| -------- | ------------ |
| `a == n` | `jp z`       |
| `a != n` | `jp nz`      |
| `a < n`  | `jp c`       |
| `a >= n` | `jp nc`      |

`C` is set when the subtraction had to borrow, which is exactly when `a` was the smaller of the two.
`a > n` and `a <= n` have no condition of their own, so you either swap the operands or write the
test as "not less and not equal".

```z80|playground
    .org 0x8000
    ld a, 3
    cp 5            ; 3 - 5 borrows
    ld b, 0
    jp nc, done     ; if(a >= 5) skip
    ld b, 1         ; a was smaller
done:
    halt
```

`b` comes out at `01`, with `C` at 1 and `S` at 1. Try changing `ld a, 3` to `ld a, 7`: the subtraction
does not borrow, the jump is taken and `b` stays 0.

## P/V does three jobs

One flag, three meanings, and which one you get depends on the instruction that set it:

- After **arithmetic** (`add`, `sub`, `cp`, `inc`, `dec`, `neg`, `adc hl`, `sbc hl`) it is the
  **signed overflow**: 1 when the true answer did not fit in the signed range.
- After **logic and shifts** (`and`, `or`, `xor`, the `CB` rotates, `in r,(c)`) it is the **parity**
  of the result: 1 when the number of 1 bits is even.
- After a **block instruction** (`ldi`, `ldir`, `cpi`, `cpir` and the rest) it says **`bc` is not
  zero**, which is how a program that copies one byte at a time knows there is more to do.

```z80|playground
    .org 0x8000
    ld a, 0b00000011    ; two 1 bits, an even number of them
    or a                ; P/V is the parity: 1
    ld b, a
    ld a, 0b00000111    ; three 1 bits, an odd number
    or a                ; P/V is the parity: 0
    ld c, a
    ld a, 127
    add a, 1            ; P/V is the overflow now: 1
    halt
```

Step through it with the flags panel open. `P/V` goes 1, then 0, then 1 again, and only the third one
is about a number being too big.

`or a` with `a` as the operand is the idiom in the middle of that program. It computes `a | a`, which
leaves `a` exactly as it was, and sets `S`, `Z` and `P/V` from it while forcing `C` to 0. So it is how
you ask "is `a` zero" without a `cp 0`, and how you clear the carry before an `sbc hl, de`. `and a`
does the same job.

## The comparison the Z80 has no condition for

For **signed** numbers `C` is the wrong flag, and `S` on its own is not enough either. When a
subtraction overflows, the sign of the answer is the opposite of the truth.

```z80|playground
    .org 0x8000
    ld a, 0x80      ; -128 as a signed byte
    cp 1
    halt
```

`S` comes out at 0 and `P/V` at 1. -128 minus 1 is -129, which does not fit in a byte, so the answer
wrapped round to `0x7F`, whose top bit is 0. `jp m` would not jump, and -128 really is less than 1.

The M68K has a `blt` that reads `N` and `V` together and gets this right. The Z80 has no such
condition, so the two flags are read one after the other: **`a < n` signed is true when `S` and `P/V`
differ**.

```z80|playground
    .org 0x8000
    ld a, 0x80      ; -128
    cp 1
    ld b, 0
    jp pe, flipped  ; the subtraction overflowed, so S is inverted
    jp m, less      ; it did not, so S tells the truth
    jr done
flipped:
    jp p, less      ; inverted: plus means less
    jr done
less:
    ld b, 1
done:
    halt
```

`b` comes out at `01`, which is the right answer. Try changing `ld a, 0x80` to `ld a, 7` and `cp 1` to
`cp 5`: 7 is not less than 5, no overflow happens, and `b` stays 0.

Five instructions for one signed comparison is why 8 bit programs keep their numbers unsigned
wherever they can, and why sizes, counts and addresses on this machine are unsigned by habit.

## Your turn

The test starts `a` at 0. Leave 1 in `b` if `a` is zero and 0 if it is not, without changing `a`. The
idiom above is the whole answer.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": 0 },
    "expectedRegisters": { "a": 0, "bc": "0x0100" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld b, 0
    or a            ; a stays as it was, the flags come from it
    jr nz, done     ; if(a != 0) skip
    ld b, 1
done:
    halt
```

</details>

The second one starts `a` at 100 and `c` at 200. Leave `a` at the larger of the two read as
**unsigned** numbers, which is 200. One `cp` and one conditional jump.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": 100, "bc": 200 },
    "expectedRegisters": { "a": 200 }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    cp c            ; a - c
    jr nc, done     ; if(a >= c) a is already the larger
    ld a, c         ; otherwise take c
done:
    halt
```

</details>
