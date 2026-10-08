---
status: superseded by ADR-0029
date: 2026-10-03
---

# Source compilation starts with self-contained programs

The first source-compilation release supports self-contained programs without standard-library dependencies, with startup/exit support and verified compiler presets for each supported Target. Producing assembly through Compiler Explorer alone does not supply the libraries, linking, or runtime behavior that ordinary C, C++, or Rust programs may require, so we chose this boundary to make the initial Compile-to-Run promise concrete. Full language runtimes are deferred rather than ruled out; future support must account for those additional requirements without assuming that compiler availability establishes runtime compatibility.
