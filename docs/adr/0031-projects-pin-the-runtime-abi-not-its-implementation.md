---
status: accepted
date: 2026-10-04
---

# Projects pin the Runtime ABI, not its implementation

A Project names the Runtime ABI it links (`off` or `v1`, …) in its _Link Runtime library_ Setting, and a Compilation record requires the ABI its Generated assembly was compiled against; the editor ships the latest implementation of each supported ABI, so saved and shared Projects receive library bug fixes without recompiling. The headers keep the ABI narrow (opaque `FILE`, no macros into library internals, frozen public structs), and the offline runtime build enforces it by diffing exported symbols and struct layouts against the previous release of the same ABI. A change that breaks it ships as a new ABI beside the old one; a Project naming an ABI the editor no longer ships fails to Build, with a Recompile action for Generated assembly. Exact reproducibility was not chosen because Projects already do not pin their Core version, and exam submissions are graded once, at submission.

## Considered options

Pinning every exact runtime version would reproduce old Builds byte for byte, but every release would ship forever and old Projects would never receive fixes.
