---
status: accepted
date: 2026-10-08
---

# Runtime compatibility protects compiled calls and standard meanings

Runtime ABI v1 protects required symbols separately for each target, compiler-checked public function types, and public layouts and constants. Required symbols include C++ support and compiler arithmetic helpers, plus external calls observed in cached GCC/Clang corpus assembly. Frozen assembly fixtures are linked with the current library so compatibility checks do not accidentally recompile away a break. Internal `__aed_*` and stdio implementation names are not public ABI promises.

A supported standard operation has its standard meaning; an unsupported request reports failure. Output streams are unbuffered by default, requested output buffering is honored, and unsupported input buffering requests fail. `r+`, `w+` and `a+` use read-write descriptors with one shared position. Heap exhaustion returns NULL/ENOMEM through private service 1100; reference service 9 retains its terminating behavior. Plain C++ new terminates because exceptions are disabled; nothrow new returns nullptr.

Deliberate simulator choices live in [FUNCTIONS.md, Deviations](../../runtime/FUNCTIONS.md#deviations): empty argument lists on MIPS/RISC-V, UTC library calendar conversions, the instruction CPU clock, the fixed Testcase epoch, and unbuffered defaults. x86 startup uses the Linux stack supplied by Blink, including `argv[0] == "/program"`. Future program arguments can extend the existing valid arrays.

Before the first release of this branch, redefine ABI v1 once after these fixes, then freeze it. A later incompatible call or layout change needs a new ABI; adding supported operations can remain compatible.
