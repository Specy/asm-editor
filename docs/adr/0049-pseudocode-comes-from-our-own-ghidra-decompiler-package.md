---
status: accepted
date: 2026-10-15
---

# Pseudocode comes from our own Ghidra decompiler package

The **Pseudocode** is produced by upstream Ghidra's C++ decompiler at a pinned release, compiled to wasm by us, with a host layer of our own that feeds it what the **Listing** already knows (function starts, every name, invented ones included, strings and read-only ranges) and returns Ghidra's markup, whose op references give each token's instruction address. It lives in a new repository and package, `@specy/decompiler`, a sixth submodule beside the Cores, architecture-neutral: the caller names the architecture, and each architecture's processor description is a separate file loaded when first needed, x86-64 first. Names and line links are what make the Pseudocode readable beside the Listing (ADR 0045, ADR 0048), and both need a host layer of our own whichever build is used; the package stands apart from the x86 **Core** because Ghidra describes the 68000, MIPS, RISC-V, Z80, ARM and AArch64 too, so unicorn-edu and later Executables of other **Targets** can share it.

## Considered options

- **Forking Pyre** (MIT, the browser port of Ghidra's decompiler): an alpha, dormant since May 2026, built from an unstated Ghidra version, printing plain text with its own list of libc prototypes. Its host layer is borrowed from where it helps.
- **Kuna**, a Rust port that has diverged from Ghidra: it already gives each token an address, but it is about 4 MB gzipped against about 1.1 MB, and it reads the ELF itself, so it would print names of its own.
- **A server**, such as dogbolt.org: it has no public API and keeps uploaded binaries, the site has no backend, and [the binary import design](../design/binary-import.md) keeps a binary inside the browser (decision 16).
- **Inside the x86 Core as `@specy/x86/decompiler`**, beside the disassembler, reusing its emsdk scripts and release: less to set up, but it ties an architecture-neutral decompiler to one Core.

## Consequences

- The new repository needs its own build, licence notices (Ghidra's `NOTICE`, Apache-2.0, the zlib License of its bundled zlib) and tag-triggered release, as the Cores have.
- The caller supplies the prototypes of library functions, since the decompiler binds them by name; the package ships glibc's as C declarations a caller can pass, which serve any Linux architecture.
