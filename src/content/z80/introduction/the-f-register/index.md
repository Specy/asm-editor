Here is a program with a decision in it. It puts 1 in `b` when `a` is smaller than 5, and leaves `b`
at 0 otherwise.

```z80|playground
    .org 0x8000
    ld a, 3
    cp 5            ; 3 - 5 borrows
    ld b, 0
    jp nc, done     ; 5 or more, so skip the next line
    ld b, 1         ; a was smaller
done:
    halt
```

Look at the third and fourth lines. `cp 5` does not write to any register, and `jp nc` does not
mention `a` or the number 5. Between them something has to carry the answer to "was `a` smaller",
and there is nowhere in the registers panel for it to sit.

It sits in a byte called `f`, and the flags panel above the registers is that byte, drawn one bit at
a time. `cp 5` subtracts 5 from `a`, throws the answer away, and keeps only what the subtraction did
to those bits. 3 minus 5 has to **borrow**, and the bit that records a borrow is `C`, the carry. `jp
nc` reads it: jump if there was no carry. There was one, so the jump is not taken and `ld b, 1`
runs.

Six bits like that one live in `f`, and the rest of this lecture is what each of them records and
which instructions write them.

## cp and unsigned comparison

`cp n` computes `a - n`, throws the answer away and keeps the flags. Two of them answer the four
questions you ask about unsigned numbers, which means numbers read as 0 to 255:

| you want | after `cp n` | because                                        |
| -------- | ------------ | ---------------------------------------------- |
| `a == n` | `jp z`       | subtracting equal numbers gives zero           |
| `a != n` | `jp nz`      | the same bit, the other way round              |
| `a < n`  | `jp c`       | a subtraction borrows only when `a` is smaller |
| `a >= n` | `jp nc`      | no borrow means `a` was at least as big as `n` |

`a > n` and `a <= n` have no condition of their own. You get them by swapping which number is in `a`,
or by writing the test as "not less, and not equal".

## The six bits

| bit |   7 |   6 |     5 |   4 |     3 |     2 |   1 |   0 |
| --- | --: | --: | ----: | --: | ----: | ----: | --: | --: |
| is  | `S` | `Z` | undoc | `H` | undoc | `P/V` | `N` | `C` |

- **`C`**, carry. The bit that would not fit off the top of an addition, the borrow of a
  subtraction, and the bit that falls out of the end of a shift. This is the one you have just used.
- **`Z`**, zero. 1 when the result was zero. Equality tests are this flag.
- **`S`**, sign. A copy of bit 7 of the result, so it is 1 when the result read as a signed number is
  negative.
- **`P/V`**, parity or overflow. One bit doing three different jobs, which gets a section of its own
  below.
- **`H`** and **`N`** are bookkeeping for one instruction, `daa`, which fixes up decimal arithmetic.
  Nothing else reads them and you will never branch on either.

Bits 3 and 5 are copies of bits 3 and 5 of the result. Zilog never documented them, real programs
did use them, and the flags panel does not show them.

The [instruction reference](/documentation/z80/instruction) gives the flag effects of every
instruction, which is where to look when you are not sure whether something you just wrote clobbered
a comparison.

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

`jr` takes only the first four, because a two byte instruction had no room to encode more, and that
is the practical difference between `jr` and `jp` beyond the range. `po` and `pe` can also be
written `nv` and `v`, which is the spelling to reach for when the flag is holding an overflow rather
than a parity; the assembler accepts both names.

One thing to watch: the `c` in `jp c, label` is the **carry flag**, not the register `c`. `jp c,
done` and `ld a, c` have nothing to do with each other, and the assembler tells them apart by where
the `c` is.

## What survives between the comparison and the jump

A flag is written from the result, forced to 0 or 1, or left exactly as it was. Which of the three
is the difference between a comparison that works and a comparison something quietly destroyed two
lines later. Three rules cover almost everything you will write.

**A load never touches a flag.** So you can compare two things, then spend as many `ld` instructions
as you need fetching whatever the branch is going to act on, and the flags are still the ones the
`cp` left.

**`inc` and `dec` on an 8 bit register leave `C` alone.** A loop can count down with `dec b` while
holding on to a carry from an addition made before it.

**`inc` and `dec` on a pair touch nothing at all.** After `dec bc` there is no zero flag to read, so
"has `bc` reached zero" cannot be asked with a jump. You have to put the two halves together
yourself, which is why `ld a, b`, `or c` turns up in so much Z80 code.

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

Step through it with the flags panel open and watch `C` alone:

| after this line | `C` | why                                |
| --------------- | --: | ---------------------------------- |
| `add a, 100`    |   1 | 300 needs nine bits                |
| `ld b, a`       |   1 | a load, so nothing was written     |
| `inc a`         |   1 | `inc r` does not write `C`         |
| `add hl, de`    |   0 | a 16 bit add does, and 2 fits fine |

Two lines of unrelated work went past and the carry was still there. Then one arithmetic instruction
wiped it.

The full table of which instruction writes which flag is long and not worth memorising. These are
the rows that catch people out:

| instruction                                    | `S` | `Z` | `H` | `P/V`    | `N` | `C` |
| ---------------------------------------------- | --: | --: | --: | -------- | --: | --: |
| `add`, `adc`, `sub`, `sbc`, `cp`, `neg`        |   ✓ |   ✓ |   ✓ | overflow |   ✓ |   ✓ |
| `inc r`, `dec r`                               |   ✓ |   ✓ |   ✓ | overflow |   ✓ |   - |
| `and`, `or`, `xor`                             |   ✓ |   ✓ |   ✓ | parity   |   0 |   0 |
| `add hl,rr`, `add ix,rr`                       |   - |   - |   ✓ | -        |   0 |   ✓ |
| `inc rr`, `dec rr`                             |   - |   - |   - | -        |   - |   - |
| `ld`, `ex`, `exx`, `push`, `pop`, `jp`, `call` |   - |   - |   - | -        |   - |   - |

✓ means set from the result, `0` and `1` mean forced to that value, `-` means untouched.

## P/V does three jobs

One flag, three meanings, and which one you get depends on the instruction that set it:

- After **arithmetic** (`add`, `sub`, `cp`, `inc`, `dec`, `neg`, `adc hl`, `sbc hl`) it is the
  **signed overflow**: 1 when the true answer did not fit in the signed range of a byte, which is
  -128 to 127.
- After **logic and shifts** (`and`, `or`, `xor`, the rotates) it is the **parity** of the result: 1
  when the number of 1 bits in it is even.
- After a **block instruction** (`ldi`, `ldir`, `cpi`, `cpir` and the rest) it says **`bc` is not
  zero**, which is how a program copying one byte at a time knows there is more to do.

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

`P/V` goes 1, then 0, then 1 again, and only the last of the three is about a number being too big.

`or a` is worth stopping on. It computes `a | a`, which leaves every bit of `a` exactly as it was,
and sets `S`, `Z` and `P/V` from it while forcing `C` to 0. So it is how you ask "is `a` zero"
without writing `cp 0`, and how you clear the carry before an `sbc`. `and a` does the same job.

## Comparing signed numbers

Everything above reads a byte as 0 to 255. Once a byte is allowed to mean -128 to 127, `C` is the
wrong flag, and `S` on its own is not enough either.

```z80|playground
    .org 0x8000
    ld a, 0x80      ; -128 as a signed byte
    cp 1
    halt
```

`0x80` is `1000 0000`. Read as a signed byte that is -128, and -128 is obviously less than 1. But
run this and `S` comes out at 0, meaning "the answer is positive".

Follow the subtraction and you can see why. -128 minus 1 is -129, and a signed byte only reaches
down to -128, so the answer does not fit. What lands in the byte is `0x7F`, whose top bit is 0, and
`S` is a copy of that top bit. The sign is a lie, and the flag that says so is `P/V`, which comes
out at 1: the subtraction overflowed.

So `S` tells the truth when `P/V` is 0, and is inverted when `P/V` is 1. Four pairs of bytes, worked
through:

| `a`           | `cp n`    | lands in the byte | `S` | `P/V` | true sign | so          |
| ------------- | --------- | ----------------- | --: | ----: | --------- | ----------- |
| `0x80` (-128) | `cp 1`    | `0x7F`            |   0 |     1 | negative  | -128 < 1    |
| `0x07` (7)    | `cp 5`    | `0x02`            |   0 |     0 | positive  | 7 >= 5      |
| `0xFB` (-5)   | `cp 1`    | `0xFA`            |   1 |     0 | negative  | -5 < 1      |
| `0x7F` (127)  | `cp 0x80` | `0xFF`            |   1 |     1 | positive  | 127 >= -128 |

Read the `S` and `P/V` columns together and the rule falls out: the rows where they **differ** are
the rows where `a` is less. That is the whole test, and there is no single condition that reads both
bits at once, so it takes two jumps to ask.

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

Five instructions for one comparison. That is why 8 bit programs keep their numbers unsigned
wherever they can get away with it, and why sizes, counts and addresses on this machine are unsigned
by habit.

## Two to write

The first one starts `a` at 0. Leave 1 in `b` if `a` is zero and 0 if it is not, without changing
`a`. The `or a` idiom is the whole answer.

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
    jr nz, done     ; not zero, so leave b at 0
    ld b, 1
done:
    halt
```

</details>

The second starts `a` at 100 and `c` at 200. Leave `a` at the larger of the two read as **unsigned**
numbers, which is 200. One `cp` and one conditional jump.

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
    jr nc, done     ; a is already the larger
    ld a, c         ; otherwise take c
done:
    halt
```

</details>
