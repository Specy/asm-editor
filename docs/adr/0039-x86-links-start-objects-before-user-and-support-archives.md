---
status: accepted
date: 2026-10-08
---

# x86 links start objects before user and support archives

Amends [ADR 0033](./0033-x86-links-the-entry-and-takes-other-files-as-needed.md). Link the Entry object and explicit `startUnits` objects first, then the user archive, then the support `library` archive. Search archives as a group so a support member can call a user definition. User definitions take precedence over support definitions. A generated Entry receives the editor's startup object; a default assembly File defining `_start` stays unextracted.

Assemble every translation unit. Reject duplicate strong global definitions in user units on both Files, including units that would otherwise stay unextracted. Weak definitions may coexist with strong definitions. A File whose object was not extracted receives a Problems Hint, based on the linker's map; an initializer-only File therefore has a visible explanation. Include fragments are part of their including unit.

This deliberately retains the archive model: the Entry selects a program and secondary units join it through references. Explicit per-File Build membership would require new project data and UI. The changes ship together in the next x86 package major; saved projects do not require migration before this branch's first release.
