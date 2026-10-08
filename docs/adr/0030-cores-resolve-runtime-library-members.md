---
status: accepted
date: 2026-10-04
---

# Cores resolve Runtime library members

A Build hands the Core its assembly units and the Runtime library as members plus a symbol index built offline by `nm`; the Core pulls members to resolve undefined globals, repeating until nothing new is needed, with `ld` semantics: a user definition satisfies a symbol before any member, and a symbol defined by both the user and a pulled member is a multiple-definition link error. Resolution lives in the Core because only the Core knows the real symbol table (local versus global, `.weak`, numeric labels, `.set`), so live checking and Build share one path without an assemble-to-discover round trip, and the x86 Core already gets the same contract from `ld -l`. MARS and RARS each implement it as an iteration inside their existing multi-file first pass.

## Considered options

Resolving in the editor would be one TypeScript implementation for every Core, but it still needs each Core to report a unit's defined and undefined globals, and a second assembly to discover them.
