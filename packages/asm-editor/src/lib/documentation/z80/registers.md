## Registers

The Z80 has seven general purpose 8 bit registers plus the accumulator, which pair up into 16 bit registers, two index registers, a stack pointer and a program counter. A second, alternate set of the same registers is swapped in with a single instruction, which is why interrupt handlers on real hardware could save the machine state in four clock cycles.

## Flags

The flags live in the F register, which is only reachable as the low half of `af`. Every arithmetic and logic instruction updates some of them; the instruction pages list which.

## Condition codes

Written after `jp`, `call` and `ret` to run them only when the flags say so, as in `jp nz, loop`. `jr` understands only the first four.

## Operand placeholders {#operands}

The instruction tables write operands with these placeholders: `ld (ix+dd), nn` is written in a program as `ld (ix+2), 42`.
