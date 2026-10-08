---
status: accepted
date: 2026-10-05
---

# The Environment library is header-only

The Environment library, `<sim.h>`, defines each of its `sim_` functions as `static inline` with GCC inline assembly and ships only as a header in the compile's `sysroot/include`; it has no Library members, no _Link Runtime library_ Setting and no Runtime ABI. The point of the library is that a student who calls a simulator service from C finds that service's system call or device access in their own Generated assembly: inlined at the call site when optimizing, or as a local function in their own unit at `-O0`. A Library member would hide it behind Just My Code stepping, need the Setting on, and leave x86, which has no Runtime library yet, without it. The cost is that a fix to a function reaches a saved Project only when its Generated assembly is recompiled.

Amended while planning (2026-10-05): x86's Generated assembly goes through the Core's translator to NASM ([ADR 0032](./0032-x86-translates-compiler-output-to-nasm-in-the-core-package.md)), which rejects inline assembly, so on x86 the header needs the translator to accept a bounded inline-assembly subset. The decision stands; only its "no Core change" consequence is limited to MIPS and RISC-V.

## Considered options

Library members resolved like `printf` ([ADR 0030](./0030-cores-resolve-runtime-library-members.md)) would deliver fixes to saved Projects through the Runtime ABI and be callable from hand-written assembly, which has no use for them since it can issue the system call itself.
