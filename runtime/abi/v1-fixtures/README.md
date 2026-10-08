# Frozen Runtime v1 programs

These programs were compiled once against the redefined v1 headers with GCC 14.2 at `-O2`.
Each target contains ten assembly files and their expected stdout, stderr, exit status and files.
The JSON also preserves source, stdin and input files for review; it is never recompiled during
the compatibility check.

Run from the repository root:

```sh
node scripts/runtime/test-cores.mjs --abi-fixtures
```

This links the frozen assembly with the current generated runtime and runs it on the current
MARS/RARS Cores. No Compiler Explorer request is needed. It checks stdio, scanf, allocation
alignment, C++ constructors/destructors and virtuals, integer helpers, time, argv and exit status.

Keep these fixtures unchanged for future compatible v1 additions. The initial capture command was
`node scripts/runtime/test-cores.mjs --write-abi-fixtures --optimization 2`; use it only when
deliberately defining a new ABI baseline. New regression programs belong in the corpus.
