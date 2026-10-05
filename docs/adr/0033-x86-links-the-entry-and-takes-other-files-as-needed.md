---
status: accepted
date: 2026-10-05
---

# x86 links the Entry's unit and takes the other Files as needed

An x86 Build links the way a C toolchain links objects and a static library: the Entry file's unit is always linked, and every other source File becomes a member of an archive that `ld` takes only to resolve a symbol the program still needs, including `_start`. Library units supplied beside the Project, such as the editor's start code for compiled C and C++, come first in that archive, so they win over a Project File for the same symbol. A default Project's `main.asm`, which defines `_start`, therefore stays out of a Build whose Entry is Generated assembly, two programs can share a Project with the Entry choosing which runs, and C and NASM still call each other because a File comes in with the symbols it defines. Every File is still assembled and checked; a File nothing refers to is just not linked. This replaces the rule, kept on 2026-10-05 as gate 9 of the [translation plan](../design/x86-compiler-assembly-translation-plan.md), that every x86 source File links, and it changes `@specy/x86` incompatibly from 3.x, which linked every unit of a Project.

## Considered options

Keeping every File linked made the start code's `_start` clash with a default `main.asm` on a new Project's first compiled Build, and a live warning only explained it. Linking the Entry's include unit alone, as MARS and RARS do, would stop NASM and compiled C from calling each other across Files. A weak `_start` in the start code would let a hand-written one win silently, so a program would start in assembly while its compiled `main` never ran.
