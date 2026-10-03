# Source compilation

Accepted scope from the design interview on 2026-10-03. The owner subsequently authorized the remaining decisions, an implementation plan, and implementation; see [the implementation plan](./source-compilation-plan.md).

## Initial scope

- Support self-contained programs without standard-library dependencies, with startup/exit support and verified compiler presets for each supported Target. See [ADR 0027](../adr/0027-source-compilation-starts-with-self-contained-programs.md).
- Start with C and C++ targeting MIPS and RISC-V.
- Design the compilation pipeline so that additional File languages and Targets can be added later. Rust, other Targets, and full language runtimes are deferred.

## Compilation inputs

Compile operates on the selected C or C++ File together with its project-local headers. Each Source compilation produces one Generated assembly output and its source mapping. Compiling and linking several C/C++ translation units together is deferred; the pipeline should allow that extension later.

## Execution entry point

Emulation of compiled C/C++ requires a conventional parameterless `int main(void)` entry point. Supply Target-specific startup/exit code that calls it and terminates when it returns. Selecting an arbitrary function and supplying arguments is deferred; the initial execution interface does not provide that harness.

After successful Source compilation, make the Generated assembly the Project's Entry file and open its mapped view. Failed compilation and cancelled replacement leave the previous output and Entry path unchanged.

## Output paths

Derive the initial output path by appending the Project Target's assembly extension to the full source path: `src/main.c` becomes `src/main.c.riscv` for RISC-V or `src/main.c.mips` for MIPS; `src/main.cpp` becomes `src/main.cpp.riscv`. Retaining the source extension distinguishes C and C++ Files with the same basename. Recompilation reuses the output path in the Compilation record. Confirm before replacing an existing File not owned by that compilation, as well as before replacing manually edited Generated assembly.

## Source-map invalidation

Changing the compiled source File or a project-local header used by the Source compilation removes its Source map, mapped highlights, and connectors. Keep the Generated assembly File, both editor panes, and their tabs, and show a stale warning when the assembly is viewed. See the [independent editor panes plan](./independent-editor-panes-plan.md).

Manual edits to the Generated assembly also remove its Source map, mapped highlights, and connectors while keeping the editors open. Recompiling over manually edited assembly requires an overwrite confirmation. The origin relationship and manual-edit state must remain identifiable after map removal so that invalidation does not disable that confirmation.

## Source-map storage

The Source map belongs to the Project's in-memory editor state and is not a File in the program-visible FileSystem. It is excluded from persistence, share links, and Project archives. Reloading or reopening a saved/shared Project therefore provides no mapping decorations or connectors until Source compilation creates a fresh map.

Persist a small Compilation record with the Project, including the selected source path, used-header paths, output path, and content fingerprints of the compilation inputs and generated output. This preserves the origin relationship and allows stale-input and manually edited-output detection after reopening, without retaining a Source map or old source snapshots. See [ADR 0028](../adr/0028-persist-compilation-records-with-transient-source-maps.md).

## Compatibility findings for future Targets

Compiler Explorer's Intel syntax option does not make GCC/Clang output a NASM assembly file; assembler directives and operand notation still differ. The x86 Core already supports GNU as through `GNU_trunk` in [assemblers.ts](../../emulators/x86/blink-js/src/assemblers.ts), while the editor currently selects `NASM_trunk` in [X86Emulator.svelte.ts](../../src/lib/languages/X86/X86Emulator.svelte.ts). Using the existing GNU assembler support is a candidate for future x86 source compilation; no x86 implementation is part of the accepted first release.

## Accepted editor workflow

Compile creates Generated assembly and a transient Project-owned Source map through Compiler Explorer. Opening generated assembly with a valid map shows the higher-level source and assembly together, with related lines highlighted on selection, execution, and Undo. Compile does not start execution: the existing Build, Run, Step, and Undo controls operate on the generated Entry file. The initial Source map file proposal was superseded by the transient Project-owned data decision.
