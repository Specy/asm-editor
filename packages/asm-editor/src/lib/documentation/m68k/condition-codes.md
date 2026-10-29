## What condition codes are

When performing operations, the CPU will set condition codes in the status register after the instruction is executed.

For example the [tst](/documentation/m68k/instruction/tst), [cmp](/documentation/m68k/instruction/cmp) instructions will set the condition codes that represent the result of the comparison of the operands.

The instructions that use the condition codes are: [bcc](/documentation/m68k/instruction/bcc) [dbcc](/documentation/m68k/instruction/dbcc) [scc](/documentation/m68k/instruction/scc)

## The status register {#status-register}

The condition codes are the low byte of the 16-bit **status register**, `sr`. That byte is the **condition code register**, `ccr`, and its five flags are the ones shown above the registers. The high byte is the **system byte**: it holds the processor's own settings, which the **System** register file shows as flags of their own.

| bit  | 15  | 13  | 10–8  | 4   | 3   | 2   | 1   | 0   |
| ---- | --- | --- | ----- | --- | --- | --- | --- | --- |
| flag | T   | S   | I2–I0 | X   | N   | Z   | V   | C   |

- T is the trace flag. While it is set, the processor runs a [trace](/documentation/m68k/exceptions#trace) handler after every instruction.
- S is the supervisor flag. It is set in supervisor mode, where every instruction runs and `a7` is the supervisor stack pointer, and clear in [user mode](/documentation/m68k/exceptions#modes).
- I2, I1 and I0 are the interrupt mask, a number from 0 to 7. An [interrupt request](/documentation/m68k/exceptions#interrupts) at or below it waits, except at level 7.

A 68020 has two more bits in the system byte, and calls T **T1**:

| bit  | 15  | 14  | 13  | 12  | 10–8  |
| ---- | --- | --- | --- | --- | ----- |
| flag | T1  | T0  | S   | M   | I2–I0 |

- T1 is the 68000's T: it traces every instruction.
- T0 is a second trace flag, which traces only an instruction that changes the flow of the program, such as a branch taken, a jump or a return.
- M is the master flag. In supervisor mode it chooses which of the 68020's two supervisor stack pointers `a7` is: the interrupt stack pointer while it is clear, and the master stack pointer while it is set.

See [tracing on the 68020](/documentation/m68k/exceptions#68020-trace) and [master and interrupt stacks](/documentation/m68k/exceptions#master-stack). On the 68000 and the 68010 the two bits always read 0.

A program starts with `sr` at `$2000`: S set, T clear and the mask at 0. Arithmetic and comparisons never change the system byte. The program changes it with [move](/documentation/m68k/instruction/move), [andi](/documentation/m68k/instruction/andi), [ori](/documentation/m68k/instruction/ori) or [eori](/documentation/m68k/instruction/eori) to `sr`, with [stop](/documentation/m68k/instruction/stop) or with [rte](/documentation/m68k/instruction/rte), and only in supervisor mode. An exception changes it too: it sets S and clears T, and an interrupt request also raises the mask to its own level.

## Condition codes flags

The condition codes X, N, Z, V, C are the individual flags that can be set in the status register.

- X is the extend flag, it is set when the result of an operation is too large to fit in the destination register.
- N is the negative flag, it is set when the result of an operation is negative.
- Z is the zero flag, it is set when the result of an operation is zero.
- V is the overflow flag, in arithmetical operations, it is set if it caused the result to overflow.
- C is the carry flag, when an operation causes a carry, like an addition or a shift, it is set to the value of the carry.

The following are all the condition codes available:
