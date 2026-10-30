`<ea>` stands for an operand using one of the instruction’s supported addressing modes. It can name a register, memory or an immediate value. Check the instruction’s allowed modes and sizes before choosing an operand.

## Direct

Names a register directly. Data registers are `d0` to `d7`; address registers are `a0` to `a7`. `sp` is another name for `a7`. The instruction determines whether the register is read or written. Where an operand can be either kind, the instruction's forms write it `Rn`.

```m68k
d0, a0, sp
```

- `Dn`: Data register
- `An`: Address register
- `Rn`: Data or address register

## Indirect

Accesses memory at the address held in an address register. The instruction determines whether the memory is read or written.

```m68k
(a0), (sp)
```

- `(An)`: Indirect

## Address-register displacement

Accesses memory at the address register plus a displacement, written as `d` in `d(An)`. The assembler evaluates the displacement expression, which must fit a signed 16-bit value (`-32768` to `32767`). Parentheses may also surround the whole operand, as in `(4,a0)`.

```m68k
4(a0), label-base(sp), (8,a1)
```

- `d(An)`: Address-register displacement

## Indirect postincrement/predecrement {#indirect-post-pre-increment}

`(An)+` accesses memory at the address in the register, then increases the register. `-(An)` decreases the register first, then accesses memory at the new address. The change is 1 byte for a byte operation, 2 for a word or 4 for a long. A byte operation through `sp` changes it by 2 to keep the stack pointer even.

`pack` and `unpk` have different source and destination widths. Their instruction pages give the change for each operand.

These are separate addressing modes: an instruction that allows `(An)` does not necessarily allow `(An)+` or `-(An)`. Check the instruction’s supported modes.

```m68k
(a0)+, -(sp)
```

- `(An)+`: Postincrement
- `-(An)`: Predecrement

## Immediate

Supplies a constant value after `#`. `#label` supplies the label’s address as a value; `label` without `#` names memory at that address. Expressions are evaluated at assembly time.

The value must fit the operation’s size: byte `-128` to `255`, word `-32768` to `65535`, or long `-2147483648` to `4294967295`. Signed and unsigned spellings are accepted. Some instructions impose narrower limits; check their immediate-operand description.

```m68k
#1000, #$FF, #@14, #%10010, #'a', #'hey', #label
```

- `#imm`: Immediate
- `#<num>`: Decimal
- `#$<num>`: Hexadecimal
- `#@<num>`: Octal
- `#%<num>`: Binary
- `#'<char/string>'`: Character or packed text

Quoted text is packed into one number, with the first character’s byte highest. For example, `move.l #'hey',d0` sets `d0` to `$00686579`. It supplies one immediate operand; it does not allocate a string in memory. Use up to four characters to fit a long value.

## Absolute memory address {#effective-address}

Accesses memory at an address written as a number, label or expression. A `.w` or `.l` suffix selects how many bytes of the instruction hold the address, independently of the size of the data accessed: `.w` stores it in one word, two bytes, and needs the address expression to be between `-32768` and `32767`; `.l` stores all of it in four. Without a suffix the assembler picks `.w` when it already knows the address, a number or a label defined above the line, and the address fits, and `.l` otherwise, so a label defined further down always takes `.l`. Hover over the instruction after a Build to see its machine code and what it assembled as.

```m68k
$1000, some_label, some_label.w, some_label.l
```

- `abs`: Absolute memory address

## Address-register indexed

Accesses memory at the sum of an address register, an index register and an optional displacement. The displacement must fit a signed 8-bit value (`-128` to `127`); omitting it adds zero.

`Xn` is a data or address register. The index suffix selects how much of that register contributes to the address: `.w` uses its signed low word and `.l` uses its full long value. Omitting the suffix means `.w`. The instruction’s size selects the size of the memory access.

```m68k
4(a0, d2), (sp, a0), (8,a1,d3.w)
```

- `d(An,Xn)`: Address-register indexed

## Program-counter relative

Write the target label or address before `(pc)`, as in `table(pc)`. The assembler calculates the displacement to that target from the operand’s extension word. This is usually two bytes after the instruction’s start, or later if the instruction has other extension words before the operand. For `d(PC)`, the displacement must fit a signed 16-bit value (`-32768` to `32767`).

An indexed operand such as `table(pc,d0.w)` accesses the target address plus the index register. Its calculated displacement must fit a signed 8-bit value (`-128` to `127`). The index uses the same `.w`/`.l` rules as [address-register indexed operands](#address-register-indexed). If the target is omitted, as in `(pc,d0.w)`, the target is the instruction itself, as in EASy68K: the address is the instruction’s start plus the index.

These modes can read memory but cannot write it.

```m68k
table(pc), table(pc,d0.w), (table,pc,a1)
```

- `d(PC)`: PC displacement
- `d(PC,Xn)`: PC displacement with index

## Status registers

`sr` is the 16-bit status register and `ccr` is its low condition-code byte. Only specific forms of [move](/documentation/m68k/instruction/move), [andi](/documentation/m68k/instruction/andi), [ori](/documentation/m68k/instruction/ori) and [eori](/documentation/m68k/instruction/eori) accept them. Check the instruction for the allowed register, size and direction.

```m68k
move.w sr,d0
```

- `sr`: Status register
- `ccr`: Condition-code register

## User stack pointer

`usp` holds the user-mode stack pointer. In user mode it is `a7`. Supervisor code can read or write it with [move](/documentation/m68k/instruction/move) between `usp` and an address register. The 68010 and 68020 also allow [movec](/documentation/m68k/instruction/movec) between `usp` and a data or address register. These transfers are always long and require supervisor mode. See [user and supervisor mode](/documentation/m68k/exceptions#modes).

```m68k
move.l a0, usp
```

- `usp`: User stack pointer

## Control registers

The 68010 adds three control registers. Supervisor code reads or writes them with [movec](/documentation/m68k/instruction/movec), transferring a long to or from a data or address register. Select `opt p=68010` or `opt p=68020` to use them. Their names are reserved on every processor, including the 68000.

- `vbr`, the vector base register, holds the [vector table’s](/documentation/m68k/exceptions#68010) start address. It starts at zero.
- `sfc` and `dfc`, the source and destination function codes, select the address spaces for [moves](/documentation/m68k/instruction/moves). Each retains the low three bits of a written value. The editor has a single address space, so their values do not change which bytes `moves` accesses.

The 68020 adds four more control registers. Select `opt p=68020` to use them. Their names are also reserved on every processor:

- `msp` and `isp`, the master and interrupt stack pointers. In supervisor mode, `a7` uses `msp` when M in `sr` is set and `isp` when M is clear. `isp` corresponds to the 68000’s supervisor stack pointer. See [master and interrupt stacks](/documentation/m68k/exceptions#master-stack).
- `cacr` and `caar`, the cache control and cache address registers. The editor does not simulate a cache. `cacr` retains bits 0 and 1 of a written value, while `caar` retains all 32 bits.

```m68k
movec d0, vbr
```

- `vbr`: Vector base register
- `sfc`: Source function code
- `dfc`: Destination function code
- `msp`: Master stack pointer, 68020 only
- `isp`: Interrupt stack pointer, 68020 only
- `cacr`: Cache control register, 68020 only
- `caar`: Cache address register, 68020 only

## On the 68020 {#68020}

Select the 68020 with `opt p=68020` before any code or data. The choice applies to the whole assembled program, including its included Files.

The 68020 adds scaled indexes, larger displacements, memory indirect addressing and long branches. It also adds instructions that use [register pairs](/documentation/m68k/addressing-mode#register-pairs) and [bit fields](/documentation/m68k/addressing-mode#bit-fields). The instruction pages mark the forms that require a later processor.

Where an instruction accepts `d(An,Xn)` or `d(PC,Xn)`, it also accepts the corresponding 68020 forms below. These forms are unavailable on the 68000 and 68010. The editor offers a quick fix to add `opt p=68020` when one is used without selecting that processor.

The parts go inside parentheses, separated by commas. `bd` is the base displacement, `Xn` the index register, `k` its scale, and `od` the outer displacement. Omitted address components contribute zero.

- `(bd,An,Xn*k)`: [Scaled index](/documentation/m68k/addressing-mode#scaled-index), with a [base displacement](/documentation/m68k/addressing-mode#base-displacements)
- `([bd,An],Xn,od)`: [Memory indirect](/documentation/m68k/addressing-mode#memory-indirect), postindexed
- `([bd,An,Xn],od)`: Memory indirect, preindexed
- `(bd,PC,Xn*k)`, `([bd,PC],Xn,od)`, `([bd,PC,Xn],od)`: The same from the program counter, which can read memory but not write it

The assembler keeps a 68000 encoding when the operand fits it. If a known displacement needs a wider form, or a backward branch exceeds `.w` reach, it selects the 68020 form. A known value is a number or a label already defined in assembly order. Forward references keep the smaller legacy form unless you request the width, as in `(far.l,a0,d1.w)` or `bra.l far`. The full addressing forms have their own [displacement size rules](#base-displacements). Hover over an instruction after Build to inspect its encoding.

## Scaled index {#scaled-index}

On the 68020, `*2`, `*4` or `*8` after an index register scales its contribution to the address. The index is a byte displacement. Scaling an element number by 4 therefore selects a long in a table without a separate multiplication. A `.w` index is sign-extended from its low word before scaling. A `.l` index uses the full register. Omitting the index size means `.w`.

```m68k
    opt p=68020
    lea table, a0
    moveq #2, d1              ; element number 2
    move.l (a0,d1.w*4), d0    ; the long at a0 + 2 × 4: d0 = 30
    simhalt

table:
    dc.l 10, 20, 30, 40
```

The base address register may be omitted. `(table,d1.w*4)` selects the same long directly from `table`, and `(d0.l)` accesses the address held in the full `d0` register. `(d0)` uses only its signed low word. These data-register-only forms require the 68020. On the 68000 or 68010, put the address in an address register and use `(a0)`.

## Base displacements {#base-displacements}

The 68020’s full addressing forms allow signed word or long base displacements. A word ranges from -32768 to 32767, and a long from -2147483648 to 2147483647. Memory indirect forms allow the same sizes for the outer displacement. Write `.w` or `.l` after either displacement to select its size, as in `(512.w,a0,d1.w*2)` or `([a0],d1.w,100000.l)`.

In a full form with no explicit size, a known zero displacement uses no displacement bytes, a known value that fits a signed word uses `.w`, and any other value uses `.l`. A forward-reference displacement uses `.l`. Omitting a displacement adds zero. Ordinary `d(An)` and `d(An,Xn)` syntax keeps its 68000 form while the displacement fits, following the selection rules [above](#68020).

A PC-relative base displacement still names a target address, not a distance to add yourself. For example, `([table,pc,d1.w*4],4)` reads a pointer from `table + d1 × 4`, then adds 4 to that pointer. The assembler calculates the displacement to `table` from the operand’s extension word. The outer displacement is always a distance, even with a PC-relative base.

```m68k
    opt p=68020
    lea grid, a0
    moveq #3, d1
    move.w (512,a0,d1.w*2), d0  ; word 3 of the row 512 bytes after grid: d0 = 4
    simhalt

grid:
    ds.w 256                    ; row 0, 512 bytes
    dc.w 1, 2, 3, 4             ; row 1
```

## Memory indirect {#memory-indirect}

On the 68020, square brackets request a pointer read. The processor adds the components inside the brackets, reads a 32-bit pointer from that address, then adds the components outside the brackets to obtain the final address. Even an instruction such as `lea` reads that pointer, although it does not read data at the final address. An inaccessible pointer location can therefore cause a bus error.

- `([bd,An,Xn],od)` is **preindexed**: the index is inside, so it picks which pointer is read, as from a table of pointers.
- `([bd,An],Xn,od)` is **postindexed**: the index is outside, so it is added to the pointer once it has been read, as to the start of an array.

`messages` below is a table of three pointers, each the address of a string. This program prints string number 2:

```m68k
    opt p=68020
    lea messages, a0
    moveq #2, d1              ; string number 2
    lea ([a0,d1.w*4]), a1     ; a1 = the pointer at a0 + 2 × 4
    move.b #14, d0
    trap #15                  ; prints "two"
    simhalt

messages:
    dc.l zero, one, two
zero:   dc.b 'zero', 0
one:    dc.b 'one', 0
two:    dc.b 'two', 0
```

`([a0,d1.w*4])` works in three steps:

1. Inside the brackets: `a0 + d1 × 4` is `messages + 8`, the third long of the table.
2. The long stored there is the address of `two`.
3. Nothing follows the brackets, so that address is the one the operand names. `lea` puts the address itself in `a1`, where `move` would read the bytes stored there.

In a postindexed operand, the index selects a location relative to the pointer read. Here `current` holds a table address, and the index selects a word in that table:

```m68k
    opt p=68020
    moveq #1, d1
    move.w ([current],d1.w*2), d0   ; word 1 of the table current points at: d0 = 20
    simhalt

current:  dc.l scores_b             ; the table in use
scores_a: dc.w 1, 2, 3
scores_b: dc.w 10, 20, 30
```

Changing the long at `current` to `scores_a` makes the same instruction read the other table. For a jump table, use a preindexed operand: `jmp ([handlers,pc,d0.w*4])` jumps through pointer number `d0` in `handlers`. Here `handlers` is a target address, following the usual PC-relative notation.

## Suppressed registers {#suppressed-registers}

On the 68020, a `z` prefix suppresses a base or index register’s contribution to the address. The names are `za0` through `za7`, `zd0` through `zd7`, and `zpc`. For example, `([current,za0],d1.w*2)` accesses the same word as `([current],d1.w*2)`: the value in `a0` contributes nothing. Omitting that register has the same effect. These explicit names are useful when reading code or disassembly from other assemblers.

Suppressed-register names are recognized only inside addressing parentheses. Elsewhere, `za0` can be an ordinary label. An existing label also takes priority inside parentheses when it forms a valid operand. For example, if `za0` is a label, `lea (za0),a1` loads its address. In a 68020 program the editor warns about this ambiguity. Rename the label if you intend the suppressed register.

## Long branches {#long-branches}

On the 68020, `.l` gives [bra](/documentation/m68k/instruction/bra), [bsr](/documentation/m68k/instruction/bsr) and [bcc](/documentation/m68k/instruction/bcc) a signed 32-bit displacement, reaching anywhere in the editor’s memory. On the 68000 and 68010, their widest displacement is a signed word, reaching about 32 KB in either direction.

```m68k
    opt p=68020
    bsr.l far_away          ; more than 32 KB further down
    simhalt

    ds.b 40000              ; 40,000 bytes in between
far_away:
    moveq #1, d0
    rts
```

On the 68000 and 68010, `.l` is treated as `.w`, as in EASy68K, so this branch would be out of range. Use [jsr](/documentation/m68k/instruction/jsr) to call an address beyond branch reach on those processors. On the 68020, a backward branch beyond `.w` reach automatically uses the long form. A forward branch that needs it must request `.l`.

## Register pairs {#register-pairs}

Some 68020 instructions use a pair of registers in one operand, separated by a colon. The instruction determines whether they hold one 64-bit value or two separate values.

- `Dh:Dl` receives a 64-bit product from [muls.l](/documentation/m68k/instruction/muls) or [mulu.l](/documentation/m68k/instruction/mulu). `Dl` supplies one 32-bit input. The high result replaces `Dh`, and the low result replaces `Dl`. The old value of `Dh` is not an input.
- `Dr:Dq` receives a remainder in `Dr` and a quotient in `Dq`. [divs.l](/documentation/m68k/instruction/divs) and [divu.l](/documentation/m68k/instruction/divu) also read the pair as a 64-bit dividend, high long first. [divsl.l](/documentation/m68k/instruction/divsl) and [divul.l](/documentation/m68k/instruction/divul) read only `Dq` as their 32-bit dividend. Use different registers to keep both outputs.
- [cas2](/documentation/m68k/instruction/cas2) takes a pair of compare registers and a pair of update registers. Its two memory addresses are written as `(Rn1):(Rn2)`, with each register in its own parentheses, such as `(a0):(a1)`.

```m68k
    opt p=68020
    move.l #100000, d1
    mulu.l #100000, d2:d1     ; 10,000,000,000 needs 64 bits: d2:d1 holds it
    move.l d2, d3             ; its high long: d3 = 2
    divu.l #100000, d2:d1     ; d1 = 100000 again, and d2 = 0 left over
    simhalt
```

## Bit fields {#bit-fields}

A bit field is a run of 1 to 32 bits in a data register or in memory. It can hold a packed value, such as a 5-bit colour component, or part of a bitmap. The 68020’s bit-field instructions test, extract or change these bits directly.

Write `{offset:width}` immediately after the operand. The offset counts from bit 31 of a data register or bit 7 of the byte at the memory address. The width is the number of bits selected. For example, `d0{24:8}` selects the low byte of `d0`, and `(a0){0:5}` selects the highest five bits of the byte at `a0`.

A literal offset must be from 0 to 31, and a literal width from 1 to 32. Either can instead come from a data register, as in `(a0){d1:d2}`:

- For a field in a data register, only the offset’s low five bits are used, giving a starting position from 0 to 31. A field that passes bit 0 wraps to bit 31 of the same register.
- For a field in memory, a register offset is a signed 32-bit bit displacement. Positive offsets move forward through bytes, and negative offsets move backward. Offset -1 selects bit 0 of the preceding byte. A memory field continues into successive bytes without wrapping back to its starting byte.
- A register-supplied width uses only the low five bits. Values 1 through 31 select that many bits, while zero selects 32. Thus a width register containing 32, 64 or zero selects 32 bits.

| Instruction                                                                                                                                    | What it does with the field                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [bftst](/documentation/m68k/instruction/bftst)                                                                                                 | Tests it, setting the flags                                       |
| [bfextu](/documentation/m68k/instruction/bfextu), [bfexts](/documentation/m68k/instruction/bfexts)                                             | Copies it into a data register, as an unsigned or a signed number |
| [bfins](/documentation/m68k/instruction/bfins)                                                                                                 | Writes the low bits of a data register into it                    |
| [bfset](/documentation/m68k/instruction/bfset), [bfclr](/documentation/m68k/instruction/bfclr), [bfchg](/documentation/m68k/instruction/bfchg) | Sets, clears or inverts every bit of it                           |
| [bfffo](/documentation/m68k/instruction/bfffo)                                                                                                 | Finds its first 1                                                 |

N copies the field’s highest bit, and Z is set if the field is zero. V and C are cleared, and X is unchanged. Instructions that change a field use its value before the change for N and Z. `bfins` uses the value being inserted instead.

Bit-field instructions are available with `opt p=68020`. `opt bit` also enables them in a 68000 or 68010 program, as in EASy68K, using that processor’s addressing modes. Since those processors have no hardware bit-field instructions, the editor uses 68020 timings and marks the program’s [cycle count](/documentation/m68k/exceptions#cycles) as an estimate.

This program extracts the red, green and blue components of a 16-bit colour:

```m68k
    opt bit
    lea color, a0
    bfextu (a0){0:5}, d0      ; red, the first 5 bits: d0 = 31
    bfextu (a0){5:6}, d1      ; green, the next 6: d1 = 0
    bfextu (a0){11:5}, d2     ; blue, the last 5: d2 = 12
    simhalt

color:
    dc.w %1111100000001100
```
