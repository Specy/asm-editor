---
status: accepted
date: 2026-10-08
---

# x86 links start objects before user and support archives

Amended 2026-11-03 (the owner's decision): a duplicate strong global is an error only among the units the link takes, as `ld` reports it, on x86 as on MIPS and RISC-V ([ADR 0033](./0033-x86-links-the-entry-and-takes-other-files-as-needed.md), dated note; [asmOS portability](../design/asmos-portability.md), decision 11). This replaces the second paragraph's rejection of duplicates across every user unit, extracted or not.

- **A File the link leaves out may define what the program already has.** It stays unextracted, with the Problems Hint that says so, so two Programs that each define `main` build from one Project.
- **A duplicate between units the link takes is still an error, naming both Files.** A Build reports `ld`'s own message, on the second definition and naming the File of the first. A check links nothing, so it works out which units the link would take, reading the archives as `ld` reads them (`selectLinkedUnits` in the Core), and puts the error on each File that defines the name, naming the others.
- **Weak definitions still coexist with strong ones.** Common symbols, and an absolute symbol given the same value twice, are no duplicates either, as for `ld`.
- **It ships in `@specy/x86` 8.0.0.** The old rule caught a second `main` before anything needed the File, but it refused Projects `ld` links and disagreed with the other Targets.

Amends [ADR 0033](./0033-x86-links-the-entry-and-takes-other-files-as-needed.md). Link the Entry object and explicit `startUnits` objects first, then the user archive, then the support `library` archive. Search archives as a group so a support member can call a user definition. User definitions take precedence over support definitions. A generated Entry receives the editor's startup object; a default assembly File defining `_start` stays unextracted.

Assemble every translation unit. Reject duplicate strong global definitions in user units on both Files, including units that would otherwise stay unextracted. Weak definitions may coexist with strong definitions. A File whose object was not extracted receives a Problems Hint, based on the linker's map; an initializer-only File therefore has a visible explanation. Include fragments are part of their including unit.

This deliberately retains the archive model: the Entry selects a program and secondary units join it through references. Explicit per-File Build membership would require new project data and UI. The changes ship together in the next x86 package major; saved projects do not require migration before this branch's first release.
