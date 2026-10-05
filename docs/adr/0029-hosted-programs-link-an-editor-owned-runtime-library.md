---
status: accepted
date: 2026-10-04
---

# Hosted programs link an editor-owned Runtime library

Programs from Source compilation may use a C standard library: stdio on the Terminal and the FileSystem, `malloc`, `<string.h>`, `<ctype.h>`, `qsort`/`strtol`, `<math.h>`, and the C++ support behind global constructors, `new`/`delete` and virtual destructors. That library is our own Runtime library, not picolibc or another existing libc. Its headers are lean, written for it, and uploaded with every compile through the Compiler driver; its stdio and system-call layer target each Core's syscalls; algorithms that are hard to get right (libm, `strtod`, `qsort`, float formatting) are taken from musl's MIT-licensed implementations instead of rewritten. Its scope is a written list of supported functions, tested against host glibc output. This supersedes the self-contained boundary of [ADR 0027](./0027-source-compilation-starts-with-self-contained-programs.md).

## Considered options

Picolibc covers the same programs immediately and is built for this kind of syscall layer. It was rejected because its headers would have to be trimmed to fit every Compiler Explorer request and kept consistent with the library, every member it ships must pass the MARS and RARS assemblers' GNU profiles, which its `-Os` output stresses far beyond student programs, and its macro-dense code is what a student would read when stepping into it.
