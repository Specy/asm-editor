## Direct

Gets the content in the register directly. (the SP register is an alias of the a7)

```m68k
d0, a0, sp
```

- `Dn`: Data register
- `An`: Address register

## Indirect

Gets the value in memory at the address held by the specified address register.

```m68k
(a0), (sp)
```

- `(An)`: Indirect

## Address-register displacement

Adds an expression known at assembly time to the address register. Parentheses may also surround the whole operand, as in `(4,a0)`.

```m68k
4(a0), label-base(sp), (8,a1)
```

- `d(An)`: Address-register displacement

## Indirect Post increment/Pre decrement {#indirect-post-pre-increment}

Gets the value contained in memory with address being the content of the address register specified. If it's the post increment, the address register will be incremented after reading the memory. If it's the pre decrement, the address register will be decremented before reading the memory. The amount of increment or decrement is specified by the size of the instruction. In the documentation, wherever there is (An), this addressing mode is valid too

```m68k
(a0)+, -(sp)
```

- `(An)+`: Post increment
- `-(An)`: Pre decrement

## Immediate

Represents a numerical value, it can be a number or a label. When the program is assembled, the labels will be converted to the address of the label. Immediate values can be represented in many bases. (replace `<num>` with the actual number). Note, a string will be represented as a list of bytes.

```m68k
#1000, #$FF, #@14, #%10010, #'a', #'hey', #label
```

- `Im`: Immediate
- `#<num>`: Decimal
- `#$<num>`: Hexadecimal
- `#@<num>`: Octal
- `#%<num>`: Binary
- `#'<char/string>`: Text

## Effective address

Represents the address of the memory where the data is stored. It can be a label or a number. A `.w` or `.l` suffix selects the address width; both name the same address, and the word form is range checked.

```m68k
$1000, some_label, some_label.w, some_label.l
```

- `Ea/<label>`: Effective address
- `<ea>`: Effective address

## Address-register indexed

Adds an address register, a data or address index register, and an optional 8-bit displacement. The index may carry a `.w` or `.l` size.

```m68k
4(a0, d2), (sp, a0), (8,a1,d3.w)
```

- `d(An,Xn)`: Address-register indexed

## Program-counter relative

Adds a displacement to the address of the current instruction, optionally with a data or address index register. These modes can be read but not written.

```m68k
label(pc), 4(pc,d0.w), (label,pc,a1)
```

- `d(PC)`: PC displacement
- `d(PC,Xn)`: PC displacement with index

## Status registers

`sr` is the 16-bit status register and `ccr` is its low condition-code byte. Only `move`, `andi`, `ori` and `eori` accept these operands.

```m68k
move.w sr,d0
```

- `sr`: Status register
- `ccr`: Condition-code register
