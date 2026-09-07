Every program so far has been RV32: 32 bit registers, a word of four bytes, and a `li` that fills a
whole register with one constant. RISC-V also has a 64 bit form, **RV64**, and this editor runs it
as a language of its own. Open the projects page, press Create project, and pick **RISC-V-64** in the
language dropdown instead of **RISC-V**; every Playground on this page is already in it.

## The registers get twice as wide

RV64 is the same instruction set with 64 bit registers. `add`, `sub`, `and`, `or`, `slt`, `mul`,
`div` and the branches all read and write the full 64 bits, and nothing about how you write them
changes. What is new is a fourth size, the **doubleword** of 8 bytes, and the three instructions
that move one:

- **`.dword`** writes an 8 byte value in the data section, the way `.word` writes a 4 byte one.
- **`ld`** loads a doubleword into a register and **`sd`** stores one.
- **`lwu`** loads a word and fills the 32 bits above it with zeroes, which `lw` cannot do any more:
  in RV64 `lw` sign extends what it read into the top half of the register.

```riscv64|playground|memory
.data
big:  .dword 0x11223344AABBCCDD
copy: .dword 0

.text
main:
    la t0, big
    ld t1, 0(t0)        # all eight bytes into one register
    lw t2, 0(t0)        # the low word, sign extended into 64 bits
    lwu t3, 0(t0)       # the low word, with zeroes above it
    la t4, copy
    sd t1, 0(t4)        # and eight bytes back out
```

`t1` comes out at `11223344AABBCCDD`, all sixteen hex digits of it, because a register on this
language holds 64 bits and the panel shows every one of them. `t2` is
`FFFFFFFFAABBCCDD` and `t3` is `00000000AABBCCDD`, the same four bytes read twice: `AABBCCDD` has
its top bit set, so `lw` filled the space above with ones and `lwu` with zeroes.

The eight bytes at `copy`, which is `0x10010008`, read `DD CC BB AA 44 33 22 11`. Still little
endian, and now eight bytes of it.

The addresses did not grow. `sp` still starts at `0x7FFFEFFC`, `gp` at `0x10008000` and your data at
`0x10010000`, so the memory map of the previous lecture is the one you still have, sitting in the
bottom four gigabytes of a 64 bit address.

## The w instructions

A 32 bit `add` on a 64 bit machine is a real thing to want: C's `int` is 32 bits on almost every
64 bit target, so `a + b` on two `int`s has to wrap at 32 bits and not at 64. RV64 gives you a
second copy of the arithmetic for it, with a **`w`** on the end.

A `w` instruction reads the low 32 bits of its operands, computes a 32 bit answer, and **sign
extends that answer into all 64 bits** of the destination. Sign extending is what keeps the two
halves of the machine consistent: a 32 bit value living in a 64 bit register always has its top half
holding copies of bit 31, so `blt` and `slt` on it give the answer a 32 bit machine would give.

| 64 bits       | low 32 bits, sign extended |
| ------------- | -------------------------- |
| `add`, `addi` | `addw`, `addiw`            |
| `sub`, `neg`  | `subw`, `negw`             |
| `sll`, `slli` | `sllw`, `slliw`            |
| `srl`, `srli` | `srlw`, `srliw`            |
| `sra`, `srai` | `sraw`, `sraiw`            |
| `mul`         | `mulw`                     |
| `div`, `divu` | `divw`, `divuw`            |
| `rem`, `remu` | `remw`, `remuw`            |

```riscv64|playground
.text
main:
    li t0, 0x40000000
    add t1, t0, t0      # 64 bit, so the answer has room
    addw t2, t0, t0     # the same sum in 32 bits, then sign extended
    li t3, 1000000
    mul t4, t3, t3      # the whole product
    mulw t5, t3, t3     # its low 32 bits, sign extended
    sext.w t6, t1       # the low 32 bits of a register, sign extended
    zext.w s0, t2       # and the same 32 bits zero filled
```

`t1` comes out at `0000000080000000` and `t2` at `FFFFFFFF80000000`: the same 32 bit answer, and the
`w` form put copies of its top bit above it. `t4` is `000000E8D4A51000`, which is
1000000000000, and `t5` is `FFFFFFFFD4A51000`, the bottom eight hex digits of it with a sign on top,
which is the wrapped 32 bit product. `t6` and `s0` are `sext.w` and `zext.w`, the two instructions
that do that widening to a value already in a register.

So the rule for writing RV64 by hand: use the plain instruction when the value is an address or a
64 bit number, and the `w` form when you are working on something that is 32 bits wide because C
said so.

## What this simulator gets wrong

Two of the shift instructions are wrong here, and everything else on this page runs the way the
specification says.

**`slli`, `srli` and `srai` with a shift amount of 31 or less are carried out on the low 32 bits
only, and the answer is sign extended.** The same shifts with an amount of 32 or more are carried
out on all 64 bits and are right. The register forms, `sll`, `srl` and `sra`, are right at every
amount.

```riscv64|playground
.text
main:
    li t0, 1
    slli t1, t0, 32     # 32 or more, so all 64 bits: 0x100000000
    slli t2, t0, 31     # 31 or less, so the low 32 and a sign: 0xFFFFFFFF80000000
    li t3, 31
    sll t4, t0, t3      # the register form, and the right answer: 0x80000000
    li t5, 0x11223344
    slli t6, t5, 8      # the top byte is shifted off the end and lost
```

`t1` is `0000000100000000`, which is 2 to the 32 and what the shift should give. `t2` is
`FFFFFFFF80000000`, where a 64 bit shift of 1 by 31 is `0000000080000000`, and `t4` is that right
answer out of the register form. `t6` is `0000000022334400`: the `11` at the top of `t5` was shifted
out of a 32 bit register instead of moving up into the second half of a 64 bit one.

`li` is built out of those shifts, so **a `li` of a constant that needs more than 32 bits comes out
wrong**. Its expansion is a `lui`, an `addiw` and then a run of `slli` and `addi` pairs with shift
amounts of 11 and 10, every one of them in the broken range.

```riscv64|playground
.text
main:
    li t0, 42                   # small constants are fine
    li t1, 0x12345678           # so is anything that fits in 32 bits
    li t2, 0x1122334455667788   # this one does not survive
    li t3, 0x11223344
    slli t3, t3, 32             # a shift of 32, so the top half lands correctly
    li t4, 0x55667788
    add t3, t3, t4              # and the bottom half is added in
```

`t0` is 42 and `t1` is `0000000012345678`, both right. `t2` comes out at `0000000055667788`, which
is the bottom half of the number you asked for with nothing above it. `t3` is
`1122334455667788`, the whole number, put together out of two `li`s that each fit in 32 bits, one
`slli` of 32 and one `add`.

That three line pattern is the workaround for any 64 bit constant, with one thing to watch: if the
bottom half has its top bit set, the `li` that loads it sign extends and the `add` carries ones into
the top half, so use `zext.w` on it before adding.

## Your turn

`big` holds the doubleword `0x1122334455667788`. Leave its **top** 32 bits in `t1`, which is
`0x11223344`, and its **bottom** 32 bits with zeroes above them in `t2`, which is `0x55667788`.

```riscv64|playground|memory|exercise
.data
big: .dword 0x1122334455667788

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "t1": "0x11223344", "t2": "0x55667788" }
}
```

<details>
<summary>Show solution</summary>

```riscv64|playground|memory|solution
.data
big: .dword 0x1122334455667788

.text
main:
    la t0, big
    ld t3, 0(t0)
    srli t1, t3, 32     # 32 or more, so this shift is the 64 bit one
    zext.w t2, t3       # the low word with the top half cleared
```

</details>

The second one wants `0x00ABCDEF12345678` in `t0`, which `li` cannot give you. Build it out of two
constants that each fit in 32 bits.

```riscv64|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "t0": "0x00ABCDEF12345678" }
}
```

<details>
<summary>Show solution</summary>

```riscv64|playground|solution
.text
main:
    li t0, 0x00ABCDEF
    slli t0, t0, 32     # the top half into place
    li t1, 0x12345678
    add t0, t0, t1      # and the bottom half added in
```

</details>
