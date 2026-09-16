# The x86 instruction set

x86 has a large instruction set, but useful programs begin with a small core. The instructions in
that core move values, calculate, compare, and choose which instruction runs next. Each instruction
has a short name called a **mnemonic**, followed by the operands it uses.

The assembler turns that source into machine-code bytes. Its
[instruction reference](/documentation/x86/instruction) lists the operand forms that NASM accepts
for each mnemonic.

## Mnemonics and operands

An instruction can have zero, one, two, or occasionally more explicit operands:

```x86
    ret                         ; zero explicit operands
    inc rax                     ; one
    add rax, rbx                ; two
    imul rax, rbx, 10           ; three
```

For common two-operand data instructions in NASM syntax, the destination comes first:

```x86
    mov rax, 5                  ; rax receives 5
    add rax, rbx                ; rax receives rax + rbx
```

This common shape has exceptions. For example, `cmp rax, rbx` reads both registers and records their
relationship in the flags; it leaves both registers unchanged. The mnemonic's documented forms
tell you how many operands it takes, where each kind of operand may appear, and what the instruction
writes.

## Three common kinds of operand

The instructions in this course often use:

- A **register**, such as `rax`, `bl`, or `r9d`.
- An **immediate**, a value written directly in the instruction, such as `5`, `0x40`, or `'A'`.
- A **memory reference** in square brackets, such as `[total]` or `[rbx]`.

In the ordinary explicit two-operand forms shown here, at most one operand can be a memory
reference:

```x86
    mov rax, [source]           ; memory to register
    mov [destination], rax      ; register to memory
    mov qword [destination], 5  ; immediate to memory
```

NASM has no ordinary `mov` form from one memory location directly to another:

```x86
    mov [destination], [source] ; assembly error
```

Use a register as a temporary:

```x86
    mov rax, [source]
    mov [destination], rax
```

The one-memory-operand guideline covers many familiar two-operand instructions, including these
forms of `mov`, `add`, and `cmp`. Each mnemonic still has its own permitted forms. A form shown in
the instruction reference is the authority when the general pattern is not enough.

## Operand width selects the operation width

The operands usually tell NASM whether an instruction works on a byte, word, dword, or qword. A
register name supplies that width:

```x86
    mov al, 1                   ; one byte
    mov ax, 1                   ; two bytes
    mov eax, 1                  ; four bytes
    mov rax, 1                  ; eight bytes

    mov bl, [value]             ; read one byte
    mov rbx, [value]            ; read eight bytes
```

When a memory operand is paired with a register, the register usually provides the memory width.
In `mov [total], rax`, NASM therefore knows to store eight bytes.

An immediate has no register name from which to infer a width. An immediate-to-memory store needs
an explicit size:

```x86
    mov byte [total], 5         ; store one byte
    mov word [total], 5         ; store two bytes
    mov qword [total], 5        ; store eight bytes
```

Writing `mov [total], 5` leaves the size ambiguous, so NASM rejects it. Widths are also part of an
instruction's supported forms: two operands that make sense separately may still be an invalid
pair if their widths or positions do not match a documented form.

## A map of the main families

Instruction mnemonics are easier to learn in small families:

| family         | examples                                         | purpose                                  |
| -------------- | ------------------------------------------------ | ---------------------------------------- |
| moving values  | `mov`, `movzx`, `movsx`, `lea`, `xchg`           | transfer values or produce addresses     |
| arithmetic     | `add`, `sub`, `inc`, `dec`, `neg`, `imul`, `div` | calculate with integers                  |
| logic and bits | `and`, `or`, `xor`, `not`, `test`, `shl`, `shr`  | work with bit patterns                   |
| comparison     | `cmp`, `test`                                    | record information for a later decision |
| control flow   | `jmp`, conditional jumps, `call`, `ret`          | choose which instruction runs next      |

The table gives the broad purpose of each family. Individual instructions can have additional
behavior. For instance, `lea` calculates an address expression without reading memory, while `mov`
transfers a value. The instruction reference gives the precise behavior of each mnemonic.

## One bit pattern, two comparisons

A comparison can treat the same bits as signed or unsigned. `cmp left, right` records the relation
between its operands. A following condition instruction chooses which interpretation to use.

```x86|playground
default rel
global _start

section .text
_start:
    mov r8,  0xAAAAAAAAAAAAAAAA
    mov r9,  0xBBBBBBBBBBBBBBBB

    mov rax, -1
    mov rbx, 1
    cmp rax, rbx

    setg r8b                    ; signed: -1 > 1 is false, so write 0
    seta r9b                    ; unsigned: 0xFFFF... > 1 is true, so write 1

    mov rax, 60
    mov rdi, 0
    syscall
```

`setg` and `seta` each write a one-byte answer: 1 when the requested relation is true and 0 when it
is false. The full results are `r8 = 0xAAAAAAAAAAAAAA00` and
`r9 = 0xBBBBBBBBBBBBBB01`. Both answers came from the same `cmp`; the condition selected the signed
or unsigned reading.

## Your turn

`source` holds a qword. Load it into `r10`, then copy it into `copy`. Use the register as the
temporary because an ordinary two-operand `mov` cannot have two memory operands. Finally, store the
word `0x1234` at `marker`. That last store must change only the first two bytes, leaving its other
six bytes as `0xFF`.

```x86|playground|memory|exercise
default rel
global _start

section .data
source: dq 0x1122334455667788
copy:   dq 0
marker: dq 0xFFFFFFFFFFFFFFFF

section .text
_start:
    ; your code here

    mov rax, 60
    mov rdi, 0
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r10": "0x1122334455667788"
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402008",
            "bytes": 8,
            "expected": ["0x1122334455667788"]
        },
        {
            "type": "number-chunk",
            "address": "0x402010",
            "bytes": 8,
            "expected": ["0xFFFFFFFFFFFF1234"]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
source: dq 0x1122334455667788
copy:   dq 0
marker: dq 0xFFFFFFFFFFFFFFFF

section .text
_start:
    mov r10, [source]
    mov [copy], r10
    mov word [marker], 0x1234

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>
