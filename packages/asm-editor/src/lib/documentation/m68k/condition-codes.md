## What condition codes are

Condition codes record properties of an instruction’s result in the status register. Later instructions test them to decide what to do.

For example, [tst](/documentation/m68k/instruction/tst) sets flags from one value, while [cmp](/documentation/m68k/instruction/cmp) sets them from a subtraction without changing either operand. Check each instruction’s flag table: some instructions preserve flags, and others clear or set them unconditionally.

[bcc](/documentation/m68k/instruction/bcc), [dbcc](/documentation/m68k/instruction/dbcc), [scc](/documentation/m68k/instruction/scc) and the 68020’s [conditional traps](/documentation/m68k/instruction/trapcc) select a condition with a mnemonic suffix. Replace `<cc>` with a suffix from the table below: `b<cc>` becomes `beq` for equal, `db<cc>` becomes `dbeq`, and `trap<cc>` becomes `trapeq`. In a concrete mnemonic, `cc` itself means carry clear, so `trapcc` traps when C is clear.

## The status register {#status-register}

The low byte of the 16-bit **status register**, `sr`, is the **condition code register**, `ccr`. It contains the five flags shown above the registers. The high byte is the **system byte**, containing the processor’s trace, mode and interrupt settings. The **System** register file displays these settings separately.

| bit  | 15  | 13  | 10–8  | 4   | 3   | 2   | 1   | 0   |
| ---- | --- | --- | ----- | --- | --- | --- | --- | --- |
| flag | T   | S   | I2–I0 | X   | N   | Z   | V   | C   |

- T is the trace flag. While it is set, the processor runs a [trace](/documentation/m68k/exceptions#trace) handler after every instruction.
- S is the supervisor flag. It is set in supervisor mode and clear in [user mode](/documentation/m68k/exceptions#modes). It also selects whether `a7` uses a supervisor or user stack pointer.
- I2, I1 and I0 are the interrupt mask, a number from 0 to 7. An [interrupt request](/documentation/m68k/exceptions#interrupts) at or below it waits, except at level 7.

The 68020 adds two system bits and renames T to **T1**:

| bit  | 15  | 14  | 13  | 12  | 10–8  |
| ---- | --- | --- | --- | --- | ----- |
| flag | T1  | T0  | S   | M   | I2–I0 |

- T1 traces every instruction, like T on the 68000.
- T0 traces instructions that change program flow, such as a taken branch, jump or return.
- M is the master flag. In supervisor mode, `a7` uses the master stack pointer when M is set and the interrupt stack pointer when M is clear.

See [tracing on the 68020](/documentation/m68k/exceptions#68020-trace) and [master and interrupt stacks](/documentation/m68k/exceptions#master-stack). On the 68000 and the 68010 the two bits always read 0.

A program starts with `sr` at `$2000`: supervisor mode, tracing off and interrupt mask zero. Arithmetic and comparisons preserve the system byte. Supervisor code can change it through `sr` with [move](/documentation/m68k/instruction/move), [andi](/documentation/m68k/instruction/andi), [ori](/documentation/m68k/instruction/ori) or [eori](/documentation/m68k/instruction/eori). [stop](/documentation/m68k/instruction/stop) loads a new `sr` value before waiting, and [rte](/documentation/m68k/instruction/rte) restores it from an exception frame.

An exception also updates these settings. It enters supervisor mode and clears tracing. An interrupt sets the interrupt mask to its own level. See [exceptions and interrupts](/documentation/m68k/exceptions) for the saved state and return rules.

## Condition codes flags

The five condition-code flags are:

- X, **extend**, carries a carry or borrow between parts of a multi-precision operation. Many arithmetic instructions set it with C, but comparisons preserve it.
- N, **negative**, usually copies the result’s highest bit at the operation’s size. That bit indicates a negative signed result.
- Z, **zero**, usually indicates a zero result. Multi-precision instructions preserve a previous Z for zero parts so the final flag can describe the whole result.
- V, **overflow**, indicates that an arithmetic result does not fit in the signed range at the operation’s size. Some instructions, such as unsigned long multiplication, define overflow for an unsigned result instead.
- C, **carry**, reports an addition carry, subtraction borrow, or a bit shifted or rotated out. Its exact rule depends on the instruction.

The suffix table gives each condition and the flag test it performs. `hs` is an alias of `cc`, and `lo` is an alias of `cs`. The always-true `t` and always-false `f` conditions are available for `s<cc>`, `db<cc>` and `trap<cc>`.
