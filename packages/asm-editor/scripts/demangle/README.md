# Browser C++ demangler

The editor reads C++ names with LLVM libc++abi's Itanium demangler, compiled with Emscripten to a
self-contained ES module (`src/lib/languages/demangle/module.js`, its wasm inlined). It needs no
network service, filesystem or `c++filt` process, and loads lazily: in the Listing worker for a
program with mangled names, and on the main thread for a C++ Build's memory labels and for an
Executable's Call stack, History and memory labels (`loadDemangler.ts`). Assembly and C never load
it.

`demangle.cpp` exports one function, `describe(name)`, which parses a `_Z` name with the
`ItaniumDemangle.h` that Emscripten's libc++abi ships and reads its parts off the syntax tree, as
LLVM's `ItaniumPartialDemangler` does: the demangler's whole text (what `__cxa_demangle` returns),
the special name's words, the qualified name, the parameters, the return type, the qualifiers, the
constructor or destructor variant and a GCC clone suffix. Template argument lists in the parts are
marked with control characters so `demangledNames.ts` can shorten standard templates without
reading `operator<` as a bracket. The result is a malloc'd string the caller frees, which
`loadDemangler.ts` always does. A part whose text passes 64 KiB, or whose printing visits a million
nodes, makes the result null, since a name of a few hundred characters can be made to print
gigabytes. The stack is linked below the data (`--stack-first`), so a name nested past the 1 MB stack
traps rather than overwriting them, and `loadDemangler.ts` discards a module that throws.

To regenerate with the Emscripten SDK on PATH (`source /home/dev/emsdk/emsdk_env.sh`):

```sh
bash scripts/demangle/build.sh
```

The generated module is about 104 KB uncompressed, 39 KB gzipped. `demangle.cpp` is
`Apache-2.0 WITH LLVM-exception`, as the libc++abi code it builds on; the build script copies the
matching license to `src/lib/languages/demangle/LICENSE.txt`. `module.d.ts` declares only the runtime
calls the editor uses.
