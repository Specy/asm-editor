---
status: accepted
date: 2026-10-08
---

# Work out Memory regions in the editor from each Core's own layout exports

The memory view's region picker and byte outlines need to know where a program's code, data and reserved room lie, where its heap and stack end, and which data labels fall where. Each Core exports the layout facts it already holds, in its own words: MARS and RARS their symbol table with its data/text flag, their section bases and their heap break; s68k each line's item kind and address range with its symbols; Blink the linked ELF's section headers and symbol table; Z80 its typed symbols and each line's kind. The language adapter turns those facts into **Memory regions** and data labels, as it turns flat register arrays into **Register files** ([ADR 0021](./0021-register-files-from-core-exports.md)). Memory-mapped devices are not the Cores' to report: each **Peripheral** that maps memory reports its own regions, and the Emulator merges them with the program's.

## Considered options

- Per-target tables of addresses in the editor (MARS's fixed bases, s68k's stack top), filled in with whatever each Core happens to expose: rejected. The facts that matter live only in the Cores (the GNU profile's section bases, the symbol table's data/text split, the current heap break, the ELF's sections), the tables would drift each time a Core changed, and x86 would need an ELF parser in the editor when [ADR 0032](./0032-x86-translates-compiler-output-to-nasm-in-the-core-package.md) keeps compiler-output handling in the Core package. The Cores are the editor's to change.
- One generic `getMemoryLayout()` call returning the editor's region shape from every Core: rejected for the reasons ADR 0021 gives against a generic register-file call. It pushes the editor's model into packages that stay usable elsewhere, and in the TeaVM Cores an object array built on every refresh is the allocation the throughput work measured as the cost that matters.
- Device regions from the Cores: rejected, because the Screens and the MMIO devices are injected at the emulator boundary ([ADR 0004](./0004-inject-screens-at-emulator-boundary.md)), and the MARS bitmap display's base is the editor's **Display configuration**, unknown to the Core.

## Consequences

- All five Cores release before the editor half lands, and the per-language mapping lives in five adapters.
- The static layout is read once per Build. Only the moving ends, the heap break and the stack's top, are read on each refresh, as plain numbers beside the stack pointer the editor already reads. The Core keeps the stack's top itself, applying its rule after every instruction and restoring it on Undo, because the editor sees a Run only in slices.
- A device region can overlap a program region, as the MARS bitmap does `.data` by default. Both stay regions, and the grid outlines the device.
