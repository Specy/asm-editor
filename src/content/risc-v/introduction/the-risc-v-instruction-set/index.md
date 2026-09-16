This lecture introduces RISC-V instruction notation. Its two goals are to:

- understand the parts of one simple instruction; and
- recognize that some convenient names are rewritten before the processor sees them.

## The parts of an instruction

An **instruction** is one basic command that a processor can carry out. In assembly language, we
write an instruction as a name followed by the values or locations it works with:

```text
mnemonic operand, operand, operand
```

The instruction's name is called its **mnemonic**. A mnemonic is a short, readable name that hints
at the operation: `add` means add, and `sub` means subtract.

Each item after the mnemonic is an **operand**. An operand tells the instruction where to get a
value or where to put a result. Here, every operand is a register.

Consider this instruction:

```riscv
add t2, t0, t1
```

For this kind of RISC-V arithmetic instruction, the first operand is the **destination**: the place
where the result is written. The other two operands are the **sources**: the places whose values
are read. We can therefore read the line as:

```text
t2 = t0 + t1
```

If `t0` holds 7 and `t1` holds 3, the instruction writes 10 to `t2`. It does not change `t0` or
`t1`.

This destination-first pattern is common in RISC-V arithmetic instructions.

The order of the sources matters when the operation is not interchangeable. For subtraction,

```riscv
sub t2, t0, t1
```

means:

```text
t2 = t0 - t1
```

With `t0` equal to 7 and `t1` equal to 3, the result is 4. Swapping the sources gives a different
answer:

```riscv
sub t2, t1, t0
```

This time the result is `3 - 7`, or -4. The register holds the corresponding 32-bit pattern;
whether we describe such a pattern as signed or unsigned depends on how we interpret it.

## The assembler and pseudo-instructions

The processor does not read names such as `add` directly. It reads **machine code**, where each
real instruction is represented by bits. An **assembler** is the tool that translates assembly
language into that machine code.

The assembler also accepts some convenient names that do not represent separate processor
instructions. These are called **pseudo-instructions**. When the assembler sees one, it rewrites
it as one or more real instructions that have the requested effect.

Here is one complete example:

```riscv
neg t1, t0
```

`neg` means “negate”: produce the number with the opposite sign. It is a pseudo-instruction. The
assembler can rewrite it using the real `sub` instruction and the `zero` register:

```riscv
sub t1, zero, t0
```

Recall that reading `zero` always gives 0. Both lines therefore mean:

```text
t1 = 0 - t0
```

If `t0` holds 5, `t1` receives -5. The convenient spelling and the real instruction have the same
effect here; the difference is which one the processor actually has in its machine code.

A line accepted by the assembler is not always a distinct instruction implemented by the
processor.

## The base instruction set and extensions

An **instruction set** is the complete agreed vocabulary of real instructions and the rules for
using them. RISC-V organizes that vocabulary as a small base plus optional **extensions**. An
extension is an additional group of instructions that a processor may support.

You can see this organization in names such as `RV32I` and `RV32IM`:

| part | meaning                                                    |
| ---- | ---------------------------------------------------------- |
| `RV` | RISC-V                                                     |
| `32` | the integer registers are 32 bits wide                     |
| `I`  | the base integer instruction set                           |
| `M`  | an added extension for integer multiplication and division |

Thus, `RV32I` names the 32-bit base. `RV32IM` names that same base with the `M` extension added. A
processor that implements an extension understands its real instructions; a processor that does
not implement it cannot execute them.

## Check your understanding

1. In `add t4, t1, t3`, identify the mnemonic, the destination and the two sources.
2. Suppose `t1` holds 9 and `t3` holds 2. What does `sub t4, t1, t3` write to `t4`? What does
   `sub t4, t3, t1` write instead?
3. Rewrite the pseudo-instruction `neg t3, t2` using `sub` and `zero`.
4. In the name `RV32IM`, what do `32`, `I` and `M` tell you?

<details>
<summary>Show answers</summary>

1. The mnemonic is `add`. The destination is `t4`, and the sources are `t1` and `t3`.
2. The first instruction writes 7 because it calculates `9 - 2`. The second writes -7 because it
   calculates `2 - 9`.
3. `sub t3, zero, t2`. It subtracts the value in `t2` from zero and writes the result to `t3`.
4. `32` says that the integer registers are 32 bits wide. `I` names the base integer instruction
   set. `M` says that the multiplication-and-division extension is also present.

</details>

A mnemonic names an operation, operands name what it works with, and common register arithmetic
writes its first operand from the source operands that follow. The assembler translates real
instructions and can also expand convenient pseudo-instructions.
