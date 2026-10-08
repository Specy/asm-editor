# Browser C++ demangler

The memory-region labels use LLVM libc++abi's `__cxa_demangle`, compiled with
Emscripten to a self-contained ES module. It loads lazily before a C++ Build;
assembly-only and C Builds do not load it. The checked-in module includes its
WASM and needs no network service, filesystem or `c++filt` process.

To regenerate with the Emscripten SDK on PATH:

```sh
bash scripts/demangle/build.sh
```

The generated module is about 95 KB uncompressed. Its matching libc++abi license
is checked in at `src/lib/languages/demangle/LICENSE.txt` and copied by the build
script. `module.d.ts` declares only the three runtime calls the editor uses.
A successful demangle allocates a string; `compiledMemoryNames.ts` always frees it.
