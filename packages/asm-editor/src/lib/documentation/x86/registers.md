## Registers {#registers}

Sixteen 64 bit general purpose registers. Each one can be used at four widths: `rax` is the whole register, `eax` its low 32 bits, `ax` its low 16 and `al` its low 8. Writing a 32 bit name clears the top half of the 64 bit register; writing a 16 or 8 bit name leaves the rest alone.

## Flags {#flags}

The flags live in `rflags`. Arithmetic and logic instructions write them, `cmp` and `test` exist to write them without keeping a result, and the conditional instructions read them.

## Condition codes {#condition-codes}

The same sixteen conditions end `jcc`, `setcc` and `cmovcc`: `jne` jumps, `setne` writes 1 or 0 to a byte, and `cmovne` copies a register, all on the same test. The unsigned conditions read the carry flag and the signed ones read the sign and overflow flags, which is why comparing two numbers the wrong way round silently gives the wrong answer.
