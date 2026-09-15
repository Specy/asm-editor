You can write real x86 programs with about sixty instructions. The full set is far larger than that,
and the gap between the two numbers is worth understanding before it frightens you off.

## How many there are

Most of what a complete x86 reference lists is the vector extensions, SSE and AVX and AVX-512, where
a single idea appears once per width and once per data type. "Add two numbers" turns into dozens of
separate names that way, and none of them is a new idea to learn.

The integer instructions a program like the ones in this course uses are around sixty, and the
[instruction reference](/documentation/x86/instruction) lists them with the operand forms this
assembler really accepts. The rest is reachable from the
[complete documentation](/documentation/x86/all) on the day you need it.

x86 is a **CISC** design, complex instruction set, and that means two concrete things here.
Instructions are not all the same length: they run from one byte to fifteen, so you cannot tell where
the next one starts without decoding this one first. And a single instruction may do a great deal.
`movsb` copies a byte, steps two pointers and, with a prefix in front of it, repeats itself a million
times, all from two bytes of code.

## The shape of a line

```
mnemonic destination, source
```

The destination is on the left and it is the operand that gets written. An operand is one of three
things:

- A **register**: `rax`, `bl`, `r9d`.
- An **immediate**, a number written into the instruction itself rather than fetched from anywhere:
  `5`, `0x40`, `'A'`.
- A **memory reference** in square brackets: `[total]`, `[rbx]`, `[rbx + rcx*8 + 4]`. What may go
  inside the brackets is the "Effective addresses" lecture.

The rule that shapes everything is that **at most one operand can be in memory**. So

```
    mov rax, [total]        ; register and memory: fine
    mov [total], rax        ; memory and register: fine
    mov [total], 5          ; memory and immediate: fine
    mov [a], [b]            ; two memory operands: not an instruction
```

Copying one variable to another therefore takes two instructions and a register to pass through. That
is the only real restriction on which operands go where, and everything else about memory operands is
allowed: `add rax, [total]`, `cmp rax, [limit]` and `imul rcx, [scale]` are all single instructions.

## The size is in the operands

There is no `.b` or `.l` on an x86 mnemonic. `mov` moves one byte or eight depending on what you
name:

```
    mov al, 1               ; one byte
    mov ax, 1               ; two
    mov eax, 1              ; four
    mov rax, 1              ; eight
    mov qword [total], 1    ; eight, said by the keyword because nothing else could
```

Five instructions, one mnemonic. The assembler picks the encoding, and the
[hover in the editor](/documentation/x86/instruction) lists the forms each mnemonic has.

## The families

| family            | examples                                                            | what they do                         |
| ----------------- | ------------------------------------------------------------------- | ------------------------------------ |
| moving data       | `mov`, `movzx`, `movsx`, `lea`, `xchg`, `push`, `pop`               | copy bits from one place to another  |
| arithmetic        | `add`, `sub`, `inc`, `dec`, `neg`, `mul`, `imul`, `div`, `idiv`     | numbers                              |
| logic and bits    | `and`, `or`, `xor`, `not`, `test`, `shl`, `shr`, `sar`, `rol`, `bt` | bit patterns                         |
| comparing         | `cmp`, `test`                                                       | set the flags and write nothing else |
| control flow      | `jmp`, `jcc`, `call`, `ret`, `loop`                                 | change `rip`                         |
| conditional moves | `cmovcc`, `setcc`                                                   | act on the flags without branching   |
| strings           | `movsb`, `stosb`, `lodsb`, `scasb`, `cmpsb`, with `rep`             | work through memory a byte at a time |
| floating point    | `addsd`, `mulss`, `cvtsi2sd`, `fld`, `faddp`                        | the SSE and x87 units                |
| system            | `syscall`, `int`, `hlt`, `in`, `out`                                | leave the program                    |

## cc, the family that is one instruction sixteen times

`jcc`, `setcc` and `cmovcc` are not three instructions. They are three instructions crossed with
sixteen conditions, and the `cc` in the name is where the condition goes.

| suffix     | means                         |
| ---------- | ----------------------------- |
| `e`, `z`   | equal, or the result was zero |
| `ne`, `nz` | not equal                     |
| `l`        | less, signed                  |
| `g`        | greater, signed               |
| `b`        | below, unsigned               |
| `a`        | above, unsigned               |
| `s`        | negative                      |
| `o`        | overflowed                    |

So `jne` is jump if not equal, `setl` writes 1 or 0 into a byte if less, and `cmovg` copies a
register only if greater. Adding `e` to `l`, `g`, `b` or `a` gives you the "or equal" version, `jle`
through `jae`. All sixteen are on the
[registers and flags page](/documentation/x86/registers).

Where does the condition come from? From an earlier instruction, through the flags. "The flags
register", two lectures from here, is what each of those words actually means in bits.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 10
    mov rbx, 20
    cmp rax, rbx            ; 10 against 20

    setl r8b                ; signed less: 1
    seta r9b                ; unsigned above: 0

    mov rcx, 111
    mov rdx, 222
    cmovl rcx, rdx          ; less, so rcx takes 222

    mov rax, 60
    mov rdi, 0
    syscall
```

One `cmp` and two different answers out of it, because `setl` asked a signed question and `seta` an
unsigned one about the same two numbers.

`setcc` writes **one byte**, so `setl rax` is not a form. `setl al` followed by `movzx rax, al` is how
you get a full register out of it. `cmovcc` is a move that happens or does not happen, with no jump
anywhere in the program, and the branching lecture is where that turns out to matter.

## Your turn

Compare `rax` and `rbx`, and leave 1 in `cl` if `rax` is greater than `rbx` read as signed numbers,
0 if it is not. The test starts them at -1 and 1, and starts `cl` at `0xFF` so that leaving it alone
is not an answer. As signed numbers -1 is the smaller, so `cl` should end at 0, and reading the same
bits as unsigned would give the other answer.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    mov rdi, 0
    syscall
```

```testcase
{
    "startingRegisters": { "rax": "0xFFFFFFFFFFFFFFFF", "rbx": 1, "rcx": "0xFF" },
    "expectedRegisters": { "rcx": 0 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    cmp rax, rbx        ; sets the flags and writes nothing else
    setg cl             ; signed greater, one byte of answer

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>
