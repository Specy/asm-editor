---
status: accepted
date: 2026-10-04
---

# x86 translates compiler output to NASM in the Core's package

x86 keeps NASM for both hand-written Files and Generated assembly. The x86 Core's package exposes the pure TypeScript translator through `@specy/x86/compiler-output`; the `gcc-intel-v1` profile translates GCC 14.2's x86-64 Intel syntax into NASM 3.00 source, with line provenance, compiler locations, symbol summaries and Diagnostics. The Compiler driver owns compiler selection, requests, headers and the Project's Source map. The translator emits no startup code: `crt0`, constructors and library linking belong to the Runtime library's x86 phase. See the [translation plan](../design/x86-compiler-assembly-translation-plan.md) and [implementation record](../design/x86-gcc-intel-v1.md).

GNU as runs only when capturing reference fixtures. Tests use the stored reference executables and locations offline; users' Builds and live checking continue to use NASM. The translator is published in the Core's 3.0.0 release. Editor x86 Compile remains gated on the Runtime library's x86 phase.

## Considered options

Using the Core's existing GNU assembler mode would assemble compiler output directly, but would change the x86 assembler selected for users' Builds. Translating in the editor would preserve NASM but prevent other Core consumers from sharing the same compatibility contract and verification corpus.
