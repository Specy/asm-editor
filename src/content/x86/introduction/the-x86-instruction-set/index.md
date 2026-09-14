Every lecture so far has used `mov`, `add` and `cmp` without saying what an x86 instruction is
allowed to look like. This one is the shape of the whole set: how many there are, what an operand may
be, and where the size and the condition come from.

## How many there are

The assembler in this editor accepts about **2600 mnemonics**. That number is not a measure of how
much you have to learn. Most of it is the vector extensions, SSE and AVX and AVX-512, where one idea
appears once per width and once per data type, so a single operation contributes dozens of names.

The integer instructions a program like the ones in this course uses are around sixty, and the
[instruction reference](/documentation/x86/instruction) lists them with the operand forms this
assembler really accepts. Everything else is reachable from the
[complete documentation](/documentation/x86/all) when you meet it.

x86 is a **CISC** design, complex instruction set, and the initials mean two concrete things here.
Instructions are not all the same length: they run from one byte to fifteen, so you cannot tell where
the next one starts without decoding this one. And a single instruction can do a lot, `movsb` copies
a byte, steps two pointers and can repeat itself a million times, all in two bytes of code. MIPS and
RISC-V are the other design, where every instruction is four bytes and does one thing.

## The shape of a line

```
mnemonic destination, source
```

The destination is on the left and it is the operand that gets written. That is the NASM and Intel
order. The AT&T syntax that `gcc -S` produces writes the same instruction the other way round with a
`%` on every register, so `add rbx, rax` there is `addq %rax, %rbx`. Nothing about the machine
changes, only the writing.

An operand is one of three things:

- A **register**: `rax`, `bl`, `r9d`.
- An **immediate**, a number written into the instruction itself: `5`, `0x40`, `'A'`.
- A **memory reference** in square brackets: `[total]`, `[rbx]`, `[rbx + rcx*8 + 4]`. What may go
  inside the brackets is the "Effective addresses" lecture.

The rule that shapes everything is that **at most one operand can be in memory**. So

```
    mov rax, [total]        ; register and memory: fine
    mov [total], rax        ; memory and register: fine
    mov [total], 5          ; memory and immediate: fine
    mov [a], [b]            ; two memory operands: not an instruction
```

Copying one variable to another takes two instructions, through a register. That is one of the very
few restrictions on which operands go where, and it is what separates x86 from an architecture where
memory is only reachable through loads and stores: there `add rax, [total]` would be two instructions
as well.

## The size is in the operands

There is no `.b` or `.l` on an x86 mnemonic, and no `lw` beside an `lb`. `mov` moves one byte or
eight depending on what you name:

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

`jcc`, `setcc` and `cmovcc` are not three instructions, they are three instructions crossed with
sixteen conditions. The `cc` is a suffix naming which flags to look at:

| suffix     | true when       | reads                  |
| ---------- | --------------- | ---------------------- |
| `e`, `z`   | equal, zero     | `ZF = 1`               |
| `ne`, `nz` | not equal       | `ZF = 0`               |
| `l`        | less, signed    | `SF` is not `OF`       |
| `g`        | greater, signed | `ZF = 0` and `SF = OF` |
| `b`        | below, unsigned | `CF = 1`               |
| `a`        | above, unsigned | `CF = 0` and `ZF = 0`  |
| `s`        | negative        | `SF = 1`               |
| `o`        | overflowed      | `OF = 1`               |

So `jne` is jump if not equal, `setl` writes 1 or 0 into a byte if less, and `cmovg` copies a
register only if greater. The full list, with `ge`, `le`, `ae`, `be` and the parity ones, is on the
[registers and flags page](/documentation/x86/registers).

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
    xor rdi, rdi
    syscall
```

`r8` comes out at 1 and `r9` at 0 from the same comparison, because the first asked a signed question
and the second an unsigned one. `rcx` comes out at 222.

`setcc` writes **one byte**, so `setl rax` is not a form and `setl al` followed by `movzx rax, al` is
how you get a full register. `cmovcc` is a move that happens or does not, with no jump anywhere, which
matters because a jump the processor guesses wrong about costs more than the move ever would.

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
    xor rdi, rdi
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
    xor rdi, rdi
    syscall
```

</details>
