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

`(An)+` accesses memory at the address in the register, then increases the register after access. `-(An)` decreases the register before access, then accesses memory at the new address. The simulator changes the register by the operation’s size in bytes: 1 for byte, 2 for word or 4 for long, including when the register is `sp`.

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

Write the target label or address before `(pc)`, as in `table(pc)`. The assembler calculates the displacement from two bytes after the instruction’s start to that target. For `d(PC)`, this displacement must fit a signed 16-bit value (`-32768` to `32767`).

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

`usp` is the user stack pointer: the `a7` a program has in user mode. In supervisor mode `a7` is the supervisor stack pointer, so supervisor code reaches the other one through `usp`, with [move](/documentation/m68k/instruction/move) to or from an address register, or on the 68010 with [movec](/documentation/m68k/instruction/movec) to or from any data or address register. Every form is long and privileged. See [user and supervisor mode](/documentation/m68k/exceptions#modes).

```m68k
move.l a0, usp
```

- `usp`: User stack pointer

## Control registers

The 68010 added three registers that only supervisor code uses, and only [movec](/documentation/m68k/instruction/movec) names them, copying one to or from a data or address register. A program has them when it starts with `opt p=68010`; in a 68000 program the names are still reserved, so no label can take them.

- `vbr`, the vector base register, is the address where the [vector table](/documentation/m68k/exceptions#68010) starts. It is 0 until a program moves it.
- `sfc` and `dfc`, the source and destination function codes, say which address space [moves](/documentation/m68k/instruction/moves) reads from and writes to. Each is three bits.

The 68020 adds four more, which a program has when it starts with `opt p=68020`, and whose names are reserved in every program too:

- `msp` and `isp`, the master and interrupt stack pointers. In supervisor mode `a7` is one of them, chosen by the M bit of `sr`, and `isp` is the 68000's supervisor stack pointer under its 68020 name. See [master and interrupt stacks](/documentation/m68k/exceptions#master-stack).
- `cacr` and `caar`, the cache control and cache address registers. This editor's 68020 has no cache, so they only keep what is written: `cacr` its bits 0 and 1, and `caar` all of it.

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

A program that starts with `opt p=68020` runs on a 68020, which adds the addressing modes and the long branches of the sections below, and the [register pairs](/documentation/m68k/addressing-mode#register-pairs) and [bit fields](/documentation/m68k/addressing-mode#bit-fields) of its new instructions, which the Instructions chapter tags 68020. An instruction takes the new modes wherever it takes `d(An,Xn)` or `d(PC,Xn)`. A program for the 68000 refuses them, with a quick fix that adds the `opt p=68020` line.

Their parts go inside the parentheses, separated by commas: `bd` is the base displacement, `Xn` the index register, `k` the index's scale and `od` the outer displacement. Any part can be left out.

- `(bd,An,Xn*k)`: [Scaled index](/documentation/m68k/addressing-mode#scaled-index), with a [base displacement](/documentation/m68k/addressing-mode#base-displacements)
- `([bd,An],Xn,od)`: [Memory indirect](/documentation/m68k/addressing-mode#memory-indirect), postindexed
- `([bd,An,Xn],od)`: Memory indirect, preindexed
- `(bd,PC,Xn*k)`, `([bd,PC],Xn,od)`, `([bd,PC,Xn],od)`: The same from the program counter, which can read memory but not write it

A line the 68000 can encode keeps its 68000 form, so `opt p=68020` does not change what an existing line assembles to. Where a displacement is too wide for the 68000, or a branch goes further back than `.w` reaches, the assembler takes the 68020's wider form, but only when it already knows the value: a number, or a label defined above the line. For a label defined further down, write the size after it, as in `(far.l,a0,d1.w)` or `bra.l far`. Hover over the instruction after a Build to see what it assembled as.

## Scaled index {#scaled-index}

On the 68020, an index can be multiplied before it is added. An index counts bytes, so to read element `d1` of a table of longs a 68000 program first multiplies `d1` by 4; on the 68020 the operand does it, with `*2`, `*4` or `*8` after the index register.

```m68k
    opt p=68020
    lea table, a0
    moveq #2, d1              ; element number 2
    move.l (a0,d1.w*4), d0    ; the long at a0 + 2 × 4: d0 = 30
    simhalt

table:
    dc.l 10, 20, 30, 40
```

The address register can be left out too. `(table,d1.w*4)` reaches the same long with no register holding the table's address, and `(d0.l)` reads memory at the address in `d0`. An index without a size is a word, as on the 68000, so `(d0)` uses only the low word of `d0`: write `(d0.l)` for the whole register. A program for the 68000 refuses `(d0)`; there, put the address in an address register and write `(a0)`.

## Base displacements {#base-displacements}

On the 68020, a displacement can be a word or a long: in `d(An,Xn)`, where the 68000 allows a byte, `-128` to `127`, and in `d(An)`, where it allows a word. Write `.w` or `.l` after the displacement to choose, as in `(512.w,a0,d1.w*2)`, or let the assembler pick, as [on the 68020](/documentation/m68k/addressing-mode#68020) says.

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

On the 68020, square brackets read a pointer. The operand adds up what is inside the brackets, reads the long stored at that address, and then uses that long as an address, adding what follows the brackets to it.

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

Postindexed, the pointer leads to an array, and the index picks an element of it. Here `current` holds the address of the table in use:

```m68k
    opt p=68020
    moveq #1, d1
    move.w ([current],d1.w*2), d0   ; word 1 of the table current points at: d0 = 20
    simhalt

current:  dc.l scores_b             ; the table in use
scores_a: dc.w 1, 2, 3
scores_b: dc.w 10, 20, 30
```

Changing the long at `current` to `scores_a` makes the same instruction read the other table. A jump table works the same way: `jmp ([handlers,pc,d0.w*4])` jumps to the address in entry `d0` of the table `handlers`.

## Suppressed registers {#suppressed-registers}

On the 68020, a `z` before a register's name, `za0` to `za7`, `zd0` to `zd7` and `zpc`, keeps the register's place in the operand but adds nothing for it: `([current,za0],d1.w*2)` reads the same word as `([current],d1.w*2)`. Leaving the register out does the same, so you rarely need to write one, but other assemblers' code and the disassembly of a 68020 instruction can use them. They are registers only inside an operand's parentheses; elsewhere `za0` is an ordinary name, which a label can have. A label named `za0` keeps its meaning inside the parentheses too, wherever the operand still reads with it: `lea (za0),a1` loads the label's address, as on the 68000. In a program for the 68020, where the register could have stood there as well, the editor warns that the name is read as the label, so rename the label to write the register.

## Long branches {#long-branches}

On the 68020, `.l` makes a long branch, which reaches anywhere in memory. On the 68000 a branch, [bra](/documentation/m68k/instruction/bra), [bsr](/documentation/m68k/instruction/bsr) or [bcc](/documentation/m68k/instruction/bcc), reaches at most 32 KB away, with `.w`.

```m68k
    opt p=68020
    bsr.l far_away          ; more than 32 KB further down
    simhalt

    ds.b 40000              ; 40,000 bytes in between
far_away:
    moveq #1, d0
    rts
```

In a program for the 68000, `.l` is the same as `.w`, as in EASy68K, so this branch would be too far; [jsr](/documentation/m68k/instruction/jsr) reaches anywhere there. A branch back to a label further than `.w` reaches is made long without the `.l`, as [on the 68020](/documentation/m68k/addressing-mode#68020) says; one forward needs it written.

## Register pairs {#register-pairs}

On the 68020, a few instructions take two registers in one operand, written with a colon between them.

- `Dh:Dl`, such as `d2:d1`, is one 64-bit number in two data registers, its high long in the first. [muls](/documentation/m68k/instruction/muls) and [mulu](/documentation/m68k/instruction/mulu) with `.l` write a whole 64-bit product there.
- `Dr:Dq` is a division's remainder and quotient: [divs](/documentation/m68k/instruction/divs), [divu](/documentation/m68k/instruction/divu), [divsl](/documentation/m68k/instruction/divsl) and [divul](/documentation/m68k/instruction/divul) put the quotient in the second register and the remainder in the first. `divs.l` and `divu.l` divide the 64-bit number the two hold.
- [cas2](/documentation/m68k/instruction/cas2) takes two pairs of data registers, and its two addresses as `(Rn1):(Rn2)`, each register in its own parentheses: `(a0):(a1)`.

```m68k
    opt p=68020
    move.l #100000, d1
    mulu.l #100000, d2:d1     ; 10,000,000,000 needs 64 bits: d2:d1 holds it
    move.l d2, d3             ; its high long: d3 = 2
    divu.l #100000, d2:d1     ; d1 = 100000 again, and d2 = 0 left over
    simhalt
```

## Bit fields {#bit-fields}

A bit field is a run of bits you choose, anywhere in a data register or in memory: a value packed into fewer bits than a byte, a word or a long, such as the 5 bits of red in a 16-bit colour, or a bitmap with one bit for each slot. The 68020's bit-field instructions read or change one in a single instruction, where a 68000 program shifts and masks.

A field is written in braces straight after the operand, `{offset:width}`:

- `width` is how many bits it has, 1 to 32.
- `offset` is how many bits come before it, counting from the operand's highest bit: bit 31 of a data register, or bit 7 of the byte at the address. In memory the field can run on into the bytes after that one.

So `d0{24:8}` is the low byte of `d0`, and `(a0){0:5}` the five highest bits of the byte at `a0`. Either number can be a data register instead, as in `(a0){d1:d2}`, so that a loop can walk through a bitmap.

| Instruction                                                                                                                                    | What it does with the field                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [bftst](/documentation/m68k/instruction/bftst)                                                                                                 | Tests it, setting the flags                                       |
| [bfextu](/documentation/m68k/instruction/bfextu), [bfexts](/documentation/m68k/instruction/bfexts)                                             | Copies it into a data register, as an unsigned or a signed number |
| [bfins](/documentation/m68k/instruction/bfins)                                                                                                 | Writes the low bits of a data register into it                    |
| [bfset](/documentation/m68k/instruction/bfset), [bfclr](/documentation/m68k/instruction/bfclr), [bfchg](/documentation/m68k/instruction/bfchg) | Sets, clears or inverts every bit of it                           |
| [bfffo](/documentation/m68k/instruction/bfffo)                                                                                                 | Finds its first 1                                                 |

Each sets N to the field's highest bit and Z when the field is 0, and clears V and C.

A program for the 68020 has them. A program for the 68000 or the 68010 has them too when it starts with `opt bit`, EASy68K's option for them, and keeps its own addressing modes. Neither processor has bit fields of its own, so they take the time the 68020's manual gives them, as EASy68K counts them, and once the program has one its [cycle count](/documentation/m68k/exceptions#cycles) is marked as an estimate. This program splits a 16-bit colour into its red, green and blue:

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
