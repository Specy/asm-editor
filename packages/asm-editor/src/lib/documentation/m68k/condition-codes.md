## What condition codes are

When performing operations, the CPU will set condition codes in the status register after the instruction is executed.

For example the [tst](/documentation/m68k/instruction/tst), [cmp](/documentation/m68k/instruction/cmp) instructions will set the condition codes that represent the result of the comparison of the operands.

The instructions that use the condition codes are: [bcc](/documentation/m68k/instruction/bcc) [dbcc](/documentation/m68k/instruction/dbcc) [scc](/documentation/m68k/instruction/scc)

## Condition codes flags

The condition codes X, N, Z, V, C are the individual flags that can be set in the status register.

- X is the extend flag, it is set when the result of an operation is too large to fit in the destination register.
- N is the negative flag, it is set when the result of an operation is negative.
- Z is the zero flag, it is set when the result of an operation is zero.
- V is the overflow flag, in arithmetical operations, it is set if it caused the result to overflow.
- C is the carry flag, when an operation causes a carry, like an addition or a shift, it is set to the value of the carry.

The following are all the condition codes available:
