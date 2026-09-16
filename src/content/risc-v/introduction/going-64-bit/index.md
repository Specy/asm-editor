The programs so far have used **RV32**, the 32-bit form of RISC-V. In this editor, that is the
**RISC-V** project type. RISC-V also has a 64-bit form called **RV64**. To create an RV64 project,
choose **RISC-V-64** instead. Every Playground on this page already uses that mode.

The project mode matters because it sets the width of the integer registers and the instructions
available to the program. RV32 and RV64 source often looks similar, but the same instruction can
produce a wider result in RV64.

## Wider registers and doublewords

RV64 still has the same 32 integer registers with the same names. Each register now holds 64 bits,
so the register panel displays sixteen hexadecimal digits instead of eight. A register can contain
any 64-bit pattern. The bits do not carry a permanent signed or unsigned type.

Plain arithmetic and logic instructions such as `add`, `sub`, `and` and `slli` operate on all 64
bits in RV64. Addresses also occupy 64-bit registers.

Memory gains one more useful size: an 8-byte **doubleword**.

- `.dword` places an 8-byte value in the data section.
- `ld` loads an 8-byte doubleword into a register.
- `sd` stores a register as an 8-byte doubleword in memory.

This example copies one doubleword and also loads its low word in two different ways:

```riscv64|playground|memory
.data
big:  .dword 0x11223344AABBCCDD
copy: .dword 0

.text
main:
    la t0, big
    ld  t1, 0(t0)       # load all eight bytes
    lw  t2, 0(t0)       # load four bytes and sign extend
    lwu t3, 0(t0)       # load four bytes and zero extend

    la t4, copy
    sd  t1, 0(t4)       # store all eight bytes
```

After the loads, the registers contain:

| register | value              | reason                                     |
| -------- | ------------------ | ------------------------------------------ |
| `t1`     | `11223344AABBCCDD` | `ld` loaded the complete doubleword        |
| `t2`     | `FFFFFFFFAABBCCDD` | `lw` copied bit 31 into the upper 32 bits  |
| `t3`     | `00000000AABBCCDD` | `lwu` filled the upper 32 bits with zeroes |

The four bytes read by both word loads represent `0xAABBCCDD`. In RV64, `lw` treats that word as a
signed 32-bit value and **sign extends** it: the word's top bit, bit 31, is copied into every bit
above it. `lwu` treats the word as unsigned and **zero extends** it instead.

The bytes stored at `copy` are `DD CC BB AA 44 33 22 11` in increasing address order. RV64 uses the
same little-endian byte order as RV32. The editor also keeps its data in the familiar displayed
address range; wider registers do not move this example to a visibly different part of memory.

## Arithmetic on 32-bit values

RV64 programs still work with many 32-bit values, including values loaded from `.word` data. For
these, RV64 provides arithmetic instructions whose names end in **`w`**. Here `w` means that the
result is a 32-bit word.

A `w` operation follows three steps:

1. Use the low 32 bits of the input register or registers.
2. Compute a 32-bit result, discarding anything beyond those 32 bits.
3. Sign extend that result to fill the 64-bit destination register.

Sign extension in step 3 is a rule of these particular operations. It is not a rule for every
32-bit-looking pattern held in an RV64 register. A plain 64-bit instruction can leave bit 31 set
while bits 32 through 63 remain zero.

Compare the plain and `w` forms in this example:

```riscv64|playground
.text
main:
    li   t0, 0x40000000
    add  t1, t0, t0     # full 64-bit addition
    addw t2, t0, t0     # 32-bit result, then sign extended

    li   t3, 0x80000000
    add  t4, t3, t3     # the carry remains in bit 32
    addw t5, t3, t3     # the carry is outside the low 32 bits
```

The first pair produces `0000000080000000` in `t1` and `FFFFFFFF80000000` in `t2`. Their low 32
bits match, but their complete 64-bit patterns do not. `add` produced a 64-bit result. `addw`
produced the 32-bit pattern `80000000`, then copied bit 31 into the upper half.

The second pair makes the 32-bit wrap visible. `t4` becomes `0000000100000000`, while `t5` becomes
`0000000000000000`. The `addw` result keeps only the low 32 bits, so the carry into bit 32 is
discarded; the remaining 32-bit result is zero.

Use this decision rule:

- Use a plain instruction for an address or a calculation that should use all 64 bits.
- Use a `w` instruction when the calculation should wrap to 32 bits and leave a sign-extended
  32-bit result.
- When loading a word, choose `lw` for sign extension and `lwu` for zero extension.

The naming pattern is regular enough to use as a lookup:

| operation           | full 64-bit form             | 32-bit-result form               |
| ------------------- | ---------------------------- | -------------------------------- |
| add                 | `add`, `addi`                | `addw`, `addiw`                  |
| subtract            | `sub`                        | `subw`                           |
| shift               | `sll`, `srl`, `sra`          | `sllw`, `srlw`, `sraw`           |
| multiply            | `mul`                        | `mulw`                           |
| divide or remainder | `div`, `divu`, `rem`, `remu` | `divw`, `divuw`, `remw`, `remuw` |

Immediate shift forms follow the same pattern, such as `slliw`, `srliw` and `sraiw`. You do not
need to memorize the table. First decide whether the calculation is 64 bits or 32 bits, then choose
the matching form.

## Your turn

`big` holds the doubleword `0x1122334455667788`. Leave its **top** 32 bits in `t1`, as
`0x0000000011223344`, and its **bottom** 32 bits in `t2`, as `0x0000000055667788`.

Hint: the high word begins four bytes after `big`. Make sure both results have zeroes in their upper
32 bits.

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
    la  t0, big
    lwu t2, 0(t0)       # low word, zero extended
    lwu t1, 4(t0)       # high word starts four bytes later
```

</details>
