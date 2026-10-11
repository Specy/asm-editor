A MIPS instruction starts with a short operation name, called a **mnemonic**. The mnemonic is
followed by the values that the operation uses, called **operands**:

```text
mnemonic operand, operand, operand
```

For the arithmetic instructions in this lesson, the first operand is the destination. It receives
the answer. The remaining operands are sources, so the instruction reads them without changing
them.

```text
add destination, left, right      # destination = left + right
sub destination, left, right      # destination = left - right
```

For example, `sub $t2, $t0, $t1` reads as “put `$t0` minus `$t1` in `$t2`.” The order of the two
sources matters for subtraction.

```mips|playground
.text
main:
    li $t0, 7
    li $t1, 3
    add $t2, $t0, $t1       # $t2 = 7 + 3
    sub $t3, $t0, $t1       # $t3 = 7 - 3
    sub $t4, $t1, $t0       # $t4 = 3 - 7
    li $v0, 10
    syscall
```

Step through the program. `$t2` becomes 10, `$t3` becomes 4, and `$t4` becomes -4. The source
registers `$t0` and `$t1` still contain 7 and 3.

## Put a constant in an instruction

Sometimes one source is a fixed number written directly in the instruction. That number is called
an **immediate**. In `addi`, the final `i` stands for immediate:

```text
addi destination, source, immediate      # destination = source + the fixed number
```

Compare `add` and `addi`:

```mips|playground
.text
main:
    li $t0, 12
    li $t1, 5
    add  $t2, $t0, $t1     # add the value in a register
    addi $t3, $t0, 5       # add the immediate value 5
    addi $t4, $t0, -2      # an immediate can be negative
    li $v0, 10
    syscall
```

Both `$t2` and `$t3` become 17. `$t4` becomes 10. In each line, the first register receives the
answer.

A real MIPS instruction has a fixed size of 32 bits, or four bytes. Those bits must identify the
operation and its registers as well as any immediate. Only a limited number of bits remain for an
immediate, so a real instruction can include a small constant but not every 32-bit value.

## One source line can produce several instructions

The assembler translates source code into the real 32-bit instructions that the processor runs.
It also accepts convenient names called **pseudo-instructions**. A pseudo-instruction looks like an
ordinary instruction in the source, but the assembler replaces it with one or more real
instructions.

You have already used two important pseudo-instructions:

- `li` puts a number in a register. A small number can fit in one real instruction, while a larger
  number needs more than one.
- `la` puts a label's address in a register. Building the address can also need more than one real
  instruction.

`move destination, source` is another useful pseudo-instruction. It copies a register value. You
can already express the same job with `$zero`:

```mips
move $t1, $t0
add  $t1, $t0, $zero
```

Both source lines leave a copy of `$t0` in `$t1`.

Build this program, then click each source line in the editor to inspect the instruction or
instructions generated from it:

```mips|playground|memory
.data
value: .word 99

.text
main:
    li $t0, 5
    li $t1, 0x12345678
    la $t2, value
    move $t3, $t0
    li $v0, 10
    syscall
```

The small `li` and `move` each produce one real instruction here. The large `li` and `la` produce
more than one. This is why the number of source lines is not a reliable count of the instructions
the processor receives.

Some pseudo-instruction expansions need a temporary register while the assembler builds a value.
They may use `$at`, the **assembler temporary** introduced in the register lesson. Keep leaving
`$at` for the assembler instead of storing your own values there.

## Your turn

The test starts `$t0` at 12 and `$t1` at 5. In your instructions, refer to them by their numbered
aliases: `$8` is another name for `$t0`, and `$9` is another name for `$t1`.

Use three instructions to:

1. Copy `$8` into `$s0` with `add` and `$zero`.
2. Add the immediate value 8 to `$s0`, leaving the new value in `$s0`.
3. Subtract `$9` from `$s0`, leaving the answer in `$s1`.

The stop sequence is already present so you can run the finished program.

```mips|playground|exercise
.text
main:
    # your three instructions here
    li $v0, 10
    syscall
```

```testcase
{
    "startingRegisters": { "$t0": 12, "$t1": 5 },
    "expectedRegisters": { "$s0": 20, "$s1": 15 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    add $s0, $8, $zero
    addi $s0, $s0, 8
    sub $s1, $s0, $9
    li $v0, 10
    syscall
```

</details>

One final check: the solution contains five executable lines in the source, including the two lines
in the stop sequence. Build it and inspect the generated instructions. Is five also the number of
real instructions?

<details>
<summary>Show answer</summary>

Yes for this particular program: each source line becomes one real instruction. The earlier large
`li` and `la` example showed why that answer cannot be assumed for every program.

</details>
