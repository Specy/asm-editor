# Source compilation

Accepted scope from the design interview on 2026-10-03. The owner subsequently authorized the remaining decisions, an implementation plan, and implementation; see [the implementation plan](./source-compilation-plan.md).

## Initial scope

- Support self-contained programs without standard-library dependencies, with startup/exit support and verified compiler presets for each supported Target. See [ADR 0027](../adr/0027-source-compilation-starts-with-self-contained-programs.md). Superseded on 2026-10-04: programs are now hosted and link the Runtime library ([Source runtime](./source-runtime.md), [ADR 0029](../adr/0029-hosted-programs-link-an-editor-owned-runtime-library.md)).
- Start with C and C++ targeting MIPS and RISC-V.
- Design the compilation pipeline so that additional File languages and Targets can be added later. Rust, other Targets, and full language runtimes are deferred.

## Compilation inputs

Compile operates on the selected C or C++ File together with its project-local headers. Each Source compilation produces one Generated assembly output and its source mapping. Compiling and linking several C/C++ translation units together is deferred; the pipeline should allow that extension later.

Clang is the default compiler for new MIPS and RISC-V sources. The Compile dock also offers GCC, using the same instruction-set and ABI presets; the Compilation record remembers the compiler used for each generated output.

MIPS Clang targets little-endian MIPS32 with the o32 ABI and 32-bit floating-point registers, matching the Runtime library. It uses `-mllvm -disable-mips-delay-filler` to leave nops in branch delay slots, as MARS executes with delayed branching disabled. GCC retains its equivalent `-fno-delayed-branch` preset.

The “Include source annotations when compiling” Preference is enabled by default and applies to Clang on the next compilation. Clang preserves basic-block names as comments such as `for.cond`, `for.body`, `if.then`, and `if.else`. These hints are clearest at `-O0`; optimized code can transform or remove the original control-flow structure. GCC output omits source-line and variable/expression annotations.

## Execution entry point

Emulation of compiled C/C++ requires a conventional `int main(void)` or `int main(int argc, char **argv)` entry point. The Runtime library's `_start` calls it, with no arguments, and passes its result to `exit`; until 2026-10-04 a generated wrapper called a renamed `main` instead. Selecting an arbitrary function and supplying arguments is deferred; the initial execution interface does not provide that harness.

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

New MIPS and RISC-V outputs require the [GNU compiler v1 assembly profile](./risc-v-gnu-compiler-v1.md), which MARS gained on 2026-10-04, preserving named sections, and the Runtime ABI they were compiled against. Older Compilation records retain the Core's own dialect unless the manual RISC-V Project Setting selects another profile. Profile requirements persist with provenance when a Source map is invalidated. MIPS and RISC-V support is published in `@specy/mips` and `@specy/risc-v` 3.7.0, which the editor pins; tag-triggered CI/CD and registry metadata verify both releases.

Compiler Explorer's Intel syntax option does not make compiler output a NASM assembly File; assembler directives and operand notation still differ. x86 keeps `NASM_trunk` for Builds and live checking. The Core's package now supplies `@specy/x86/compiler-output`, whose `gcc-intel-v1` profile translates GCC 14.2's x86-64 Intel output to NASM, retaining source locations and reporting unsupported constructs. GNU as is used only to capture stored test references. See [ADR 0032](../adr/0032-x86-translates-compiler-output-to-nasm-in-the-core-package.md) and the [implementation record](./x86-gcc-intel-v1.md). The translator is published in `@specy/x86` 3.0.0. Editor x86 Compile awaits the Runtime library's x86 phase, which owns startup and library linking; it is outside the first runtime release.

## Accepted editor workflow

Compile creates Generated assembly and a transient Project-owned Source map through Compiler Explorer. Opening generated assembly with a valid map shows the higher-level source and assembly together, with related lines highlighted on selection, execution, and Undo. Compile does not start execution: the existing Build, Run, Step, and Undo controls operate on the generated Entry file. Breakpoints can also be set on the C or C++ source: before each Run slice they expand, through the Source maps that describe the Build's Files, to the first instruction of each assembly block mapped to the line, and the assembly pane shows those lines with a hollow marker. Breakpoints on the Runtime library's C source are not offered. The initial Source map file proposal was superseded by the transient Project-owned data decision.
