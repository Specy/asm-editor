`<ea>` stands for an operand using one of the instruction’s supported addressing modes. It can name a register, memory or an immediate value. Check the instruction’s allowed modes and sizes before choosing an operand.

## Direct

Names a register directly. Data registers are `d0` to `d7`; address registers are `a0` to `a7`. `sp` is another name for `a7`. The instruction determines whether the register is read or written.

```m68k
d0, a0, sp
```

- `Dn`: Data register
- `An`: Address register

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

Accesses memory at an address written as a number, label or expression. A `.w` or `.l` suffix selects the address width, independently of the size of the data accessed. Both name the same address in the simulator; `.w` requires the address expression to be between `-32768` and `32767`. Use `.l` or omit the suffix for addresses outside that range.

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

An indexed operand such as `table(pc,d0.w)` accesses the target address plus the index register. Its calculated displacement must fit a signed 8-bit value (`-128` to `127`). The index uses the same `.w`/`.l` rules as [address-register indexed operands](#address-register-indexed). If the target is omitted, as in `(pc,d0.w)`, the displacement is zero: the address is two bytes after the instruction’s start plus the index.

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
