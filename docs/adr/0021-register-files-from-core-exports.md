---
status: accepted
date: 2026-09-14
---

# Assemble Register files in the editor from architecture-specific Core exports

Each Core exposes the register state it holds in its own words, as flat arrays in a fixed order with setters beside the getters: MARS its coprocessors, RARS its floating-point and control-and-status register files, Blink its FPU block. The editor's language adapter names those values and maps them into **Register files**, exactly as `MIPS-registers.ts` already names the general registers. No Core gains a generic "give me your register files" call.

The obvious alternative was that generic call, one shape returned by every Core with named files and named registers, so that the editor would need no per-language knowledge. It was rejected for three reasons. It pushes the editor's model into packages that [ADR 0004](./0004-inject-screens-at-emulator-boundary.md) keeps independent of the editor, so that they stay usable elsewhere. Names are a presentation concern, spelled the way the reference tool spells them, and the editor already owns them for the general registers. And in the TeaVM cores an object array built per panel refresh is exactly the allocation the throughput work measured as the cost that matters, where a flat `int[]` crosses the boundary for nothing.

## Consequences

- Three packages release together for one editor feature (`@specy/mips`, `@specy/risc-v`, `@specy/x86`), and any future file is a Core export plus an adapter mapping, never a Core-side schema change.
- Setters ship without an editor consumer, so that Testcases on these files later need an editor change only, not another release cycle.
- RARS returns the new 64-bit values as high/low int pairs, the shape its `setRegisterValue` already takes, not the decimal strings `getRegistersValuesLong` uses for the general registers: a `BigInteger.toString` per register per refresh is the kind of `long` work the throughput notes warn against. The general registers keep their strings for now.
- Blink's FPU block is copied out and back as one block through one bridge call each way, so the x86 undo snapshot's cost per recorded step is flat whatever the instruction touched.
- The stale `getConditionFlags` declaration in `@specy/risc-v`'s types, commented out in the Java, is removed in the same release.

## Considered options

- A generic register-file call on every Core: rejected above.
- Decimal strings for the 64-bit values, as the general registers use: rejected for the new values for the cost above; kept for the general registers to leave the published surface alone.
- Getters only, setters when Testcases need them: rejected because a release is the expensive step, and the setters are one-line wrappers over methods the Cores already have.
