---
status: accepted
date: 2026-10-12
---

# MIPS and RISC-V programs get argv above their stack

A MIPS or RISC-V program takes **Arguments** from the **Command line** as an x86 program does: it starts with `argc` in `a0` and `argv` in `a1`, and `argv[0]` is its name as on x86 (`./main` for `main.asm` or `main.c`), so `argc` is at least 1. The Core stores the strings and, below them, the NULL-terminated array of pointers (4 bytes on MIPS and RV32, 8 on RV64) in the gap MARS and RARS leave between the initial stack pointer and the stack base, at least 16 bytes above `sp`, which keeps its initial value (`0x7fffeffc`); 4,080 bytes fit, and more stop the Build with an Arguments problem. This departs from MARS and RARS ([ADR 0035](./0035-environments-match-their-reference.md), rule 2), whose program arguments nobody here used, because courses, Testcases and saved Projects quote the initial stack pointer and a C `main` expects its name in `argv[0]`.

## Considered options

- **MARS's and RARS's own layout** (`ProgramArgumentList.storeProgramArguments`): `argc` and the pointers pushed below the stack pointer, which is lowered to them. It would change the initial `sp` of every program run with Arguments, and RARS writes 4-byte pointers on RV64 too.
- **MARS's `argv[0]`**, the first argument, with no program name. Faithful to the reference, but a C `main` would see its first argument as its name, and MIPS, RISC-V and x86 programs would read the same Command line differently.
