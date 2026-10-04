# WebAssembly/WAT Target research

Researched on 2026-10-03. This finding covers adding WebAssembly as a new Project Target, with WAT
source and instruction-level debugging. It records repository inspection and primary-source
research; no execution Core or prototype has been implemented or tested.

## Finding

A WebAssembly Target is feasible, and most of `GenericEmulator` can be reused. The main work is a
debugger-friendly interpreter and support for WASM's typed locals, globals, operand stack, and
function frames in the state panels.

The browser's native WASM runtime does not expose the required debugger contract through its
standard JavaScript API. That API provides callable exports and access to memory and other exposed
objects, but no instruction-stepping, active-locals inspection, or rollback operations. A compatible
Core therefore needs an interpreter or substantial instrumentation
([WebAssembly JavaScript interface](https://webassembly.github.io/spec/js-api/index.html#instances)).

WABT is the first backend to investigate. Its JavaScript package handles WAT parsing, validation,
and binary generation. Its C++ interpreter exposes single-step and instruction-bounded execution,
but integrating that interpreter requires custom bindings, state inspection, source mapping, and
an Undo journal. This is a candidate to validate with a prototype, rather than an established
backend choice.

## Existing foundations

The current [backend contract](../../src/lib/languages/BaseEmulator.svelte.ts) already covers:

- Compilation and diagnostics through `_compile`, `_checkCode`, and `_getCompiledCode`.
- Stepping and bounded execution through `_step` and `_runSlice`.
- Instruction locations, PC, call stack, and memory access.
- Undo, history inspection, and transactions for Pokes.
- Testcase execution and lifecycle management.

[`GenericEmulator`](../../src/lib/languages/GenericEmulator.svelte.ts) supplies execution controls,
command serialization, scheduling, host yielding, peripheral ownership, and much of the Testcase
machinery. The WASM adapter should preserve the
[existing scheduling contract](../../src/lib/languages/ExecutionSlice.ts): return at instruction
boundaries with a stop reason and instruction count, so Run, Pause, Stop, breakpoints, and limits
remain consistent with the other Targets. See
[ADR 0007](../adr/0007-generic-emulator-run-scheduling.md).

## Required work

| Piece               | Requirements                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WAT compilation     | Parse and validate WAT, generate `.wasm`, translate errors into editor diagnostics, and retain instruction-to-source mappings. Folded expressions and several instructions on one line require deliberate breakpoint behavior. |
| Execution Core      | Step WASM instructions; retain operand and control stacks, call frames, typed locals, globals, and linear memory; report traps and termination; return after instruction/time budgets.                                         |
| State inspection    | Display locals, globals, operand-stack values, and function frames with their types. Use a bytecode offset as the debugger's PC. Keep the execution stack separate from linear-memory views.                                   |
| Undo and Pokes      | Journal changes to stacks, frames, locals, globals, memory, and peripheral effects. Handle calls, returns, traps, and memory growth. Memory and mutable-value edits must enter the same history.                               |
| Runtime environment | Define the entry function and supported imports. Connect a small educational API for printing, input, and waits to the existing Terminal and ProgramClock.                                                                     |
| Project integration | Register the Target, `.wat` extension, starter code, Monaco language support, defaults, and Emulator loader. Reuse memory/output/input assertions and add function arguments, return values, and globals where needed.         |

### Generic state and UI changes

The current generic layer assumes a conventional CPU in several places:

- Register files are constructed with fixed layouts in `createRegisterFiles`. WASM locals vary by
  function, and operand-stack depth changes during execution.
- `updateRegisters` returns immediately when the CPU register list is empty, skipping additional
  register-file refreshes too. An empty CPU register list alone is therefore insufficient.
- `scrollStackTab` and `positionStackTabOnCompile` treat SP as an address in the same memory that
  the memory panel reads. WASM's operand and call stacks are separate runtime structures, as
  described in the [Core runtime specification](https://webassembly.github.io/spec/core/exec/runtime.html).
- Testcase starting and expected register values are resolved through `_registerNames`.
  Function arguments, results, and global values need explicit semantics rather than inheriting
  CPU-register assertions implicitly.

The proposed direction is to add dynamic typed-value state and make CPU-specific register and
Stack-memory views optional. Keep the generic scheduler, lifecycle, peripherals, and execution
controls. The exact interface changes remain to be designed.

### Execution and source mapping

Define whether a program runs a module start function, an exported entry function, or both according
to an explicit environment convention. Initialization and execution must be separated deliberately
so Build does not unexpectedly run the program before the debugger can control it.

Retain mappings from executable instruction locations to WAT source locations during compilation.
Folded WAT expressions execute their operands before the enclosing operation, so source order and
execution order cannot be assumed to match. A line containing several instructions must follow the
existing breakpoint behavior described in
[ADR 0023](../adr/0023-run-continues-past-the-breakpoint-it-is-parked-on.md).

If WABT is used, a user-visible Step must correspond to a WASM instruction boundary rather than
exposing interpreter implementation instructions. Validate that mapping in the prototype.

## Backend candidates

### WABT with custom interpreter bindings

The [WABT JavaScript API](https://github.com/AssemblyScript/wabt.js) exposes `parseWat`, `validate`,
and `toBinary`. Its standard module API does not expose a debugger-oriented interpreter, although
the package includes command-line tools such as `wasm-interp`.

The [C++ interpreter interface](https://github.com/WebAssembly/wabt/blob/main/include/wabt/interp/interp.h)
exposes `Thread::Step` and `Thread::Run(int num_instructions, ...)`. These are useful foundations
for the app's stepping and scheduling requirements. They do not establish that inspection, startup,
suspended input, source mapping, or Undo are ready for this integration; those need bindings or
Core changes and prototype verification.

Compiling the interpreter and bindings to WASM would fit the project's existing browser execution
model. The integration cost remains uncertain until the debugger requirements are exercised.

### Purpose-built TypeScript or Rust interpreter

A scoped interpreter would give direct control over inspection, scheduling, input suspension, and
Undo. WABT could still provide WAT validation and binary generation.

This option adds responsibility for exact WASM semantics, including integer wrapping and division
traps, floating-point behavior, structured branches, function calls, and memory bounds. A restricted
teaching subset may be practical, but its supported features must be explicit and unsupported
instructions must produce clear diagnostics. Broad specification support is a larger undertaking.

## Proposed first experiment

Prototype WABT interpreter bindings before committing to a full Target. Exercise:

1. A function call with typed locals and inspectable operand-stack values.
2. A loop breakpoint that stops before the instruction and resumes correctly.
3. A memory write followed by Undo, including restoration of PC and execution stacks.
4. Suspended input through the Terminal, with Stop able to cancel the wait.
5. WAT source mappings for folded expressions and multiple instructions on one line.

These checks should establish whether extending WABT is economical and identify the smallest
generic-state changes. A broader implementation should validate supported instruction semantics
against specification tests and native WASM execution, and cover Undo, execution limits, and
Testcase isolation.

## Rough effort estimate

Assuming one linear memory, numeric instructions, structured control flow, functions, and a small
educational import API:

- **1–2 weeks:** a prototype that builds WAT, steps instructions, and exposes state.
- **4–8 weeks total:** a usable Target with breakpoints, Undo, asynchronous input, tests, and editor
  integration.
- **Broad WASM feature support and WASI:** a substantially larger project requiring a separate
  estimate.

These are preliminary engineering estimates, not measured implementation results. Interpreter
binding effort, source mapping, and reversible execution are the main uncertainties.

## Sources

- [WebAssembly JavaScript interface](https://webassembly.github.io/spec/js-api/index.html).
- [WebAssembly Core runtime structure](https://webassembly.github.io/spec/core/exec/runtime.html).
- [WABT JavaScript package and API](https://github.com/AssemblyScript/wabt.js).
- [WABT interpreter interface](https://github.com/WebAssembly/wabt/blob/main/include/wabt/interp/interp.h).
- [Backend contract](../../src/lib/languages/BaseEmulator.svelte.ts),
  [GenericEmulator](../../src/lib/languages/GenericEmulator.svelte.ts), and
  [execution-slice contract](../../src/lib/languages/ExecutionSlice.ts).
- [Target declarations](../../src/lib/Project.svelte.ts),
  [Target defaults](../../src/lib/Config.ts),
  [Emulator loader](../../src/lib/languages/Emulator.ts),
  [Monaco registration](../../src/lib/monaco/assemblyLanguageRegistry.ts), and
  [language analysis workers](../../src/lib/languages/service/LanguageWorkerManager.ts).
