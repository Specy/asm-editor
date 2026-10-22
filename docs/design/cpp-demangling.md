# C++ demangling for Executables

Status: researched 2026-10-22. Phase 1's decisions below take the owner's recommended defaults and add what the research found; they wait for the owner's confirmation before anything is implemented. Phases 2 and 3 are scoped only, to be discussed later. Nothing is implemented. Terms are in [CONTEXT.md](../../CONTEXT.md); a new term is proposed [at the end](#proposed-glossary-term).

The [usability study](../research/ghidra-usability-study.md)'s expert tester (Alex, FactCheck, finding 7) read every call in the **Pseudocode** as `_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_(...)`, with `std::string` locals typed `undefined1[32]`. [The reverse-engineering UX design](./reverse-engineering-ux.md) deferred "C++ demangling in the Listing, the Pseudocode and Go to Symbol, and typing `std::string` locals". This record splits that into three phases:

1. **Demangled names everywhere except the Listing's own text**, which keeps the mangled names and gains a trailing comment with the demangled one.
2. **Demangled names in the Listing's text itself.**
3. **C++ types**: prototypes from demangled signatures and a libstdc++ type library, so a `std::string` local reads as one.

`E/` is `packages/asm-editor/src/`, `D/` is `packages/decompiler/` and `G/` is `packages/decompiler/ghidra/decompile/cpp/`. Line numbers are from `feat/pseudocode` at `5f628407` and will drift; `X86Emulator.svelte.ts` was being edited by another session while this was written, so its places are named by method.

## Research

The experiments ran in Node 24 against the editor's own modules (the Listing generator, `programImage`, the decompiler package's `dist`), in headless Chromium 149 through Playwright, and against native and wasm builds of the decompiler's host made in scratch copies. Their scripts stayed in the session's scratchpad. The test programs were a FactCheck-like C++ program built with the host's G++ 15.2 (`-O0`, `-O2`, and `-O0` stripped; the study's own binary was no longer on disk), with a `std::string` built by `+=`, a `std::vector<std::string>`, a `std::map`, a lambda, a class hierarchy with a vtable, a function static with a guard variable and two overloads of `sum`; the x86 **Core**'s **Bundled library** `libstdc++.so.6`; and the Core's `cpp` fixture (`packages/x86/blink-js/tests/fixtures/elf/cpp`, `-O0` PIE).

### Where an Executable's names go today

Every place a symbol name of an **Executable**, or of a shared library it loads, reaches a person:

| Place                                                     | Where                                                                                                                                                                                                                                                                                                                                                  | What it shows today                                                                                                                                                                                                 | Phase 1                                                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listing generation                                        | `E/lib/listing/generateListing.ts`: names claimed into `namesAt` (`claim` :118), invented names (:330, :494), operand names and comments (`instructionLine` :528-570), labels (`label` :588), `dq` pointers (`pointerAt` :797); run by `listingService.ts` (`generate` :28) in `listing.worker.ts`, decoder loaded by `decoder.ts` (`loadDecoder` :37) | raw names: `_ZNSaIcEC1Ev@plt`, `name@got`, a non-default version `@GLIBCXX_3.4`, `_2` for duplicates; names come through `printableSymbolName(versionedName(…))` (`elfModel.ts`), which leaves mangled names intact | demangle in the worker; labels gain a demangled record; trailing comments                                                                                           |
| Listing types                                             | `E/lib/listing/listing.ts`: `ListingLabel` :74, `ListingFunction` :87, `Listing` :98                                                                                                                                                                                                                                                                   | `name`, `fullName`                                                                                                                                                                                                  | add an optional `demangled` record; raw names stay the identity                                                                                                     |
| Listing hover, Go to Definition, References, double-click | `E/lib/listing/listingNavigation.ts` (`NAME_CHARACTER` :18, `listingTokenAt` :43, `ListingIndex.label` :74, `labelHoverMarkdown` :195), `E/lib/monaco/listingProviders.ts` (hover :52), `E/lib/monaco/followNames.ts`                                                                                                                                  | the raw name and its origin                                                                                                                                                                                         | hover shows the demangled forms; lookups unchanged, since the text keeps the mangled tokens                                                                         |
| Go to Symbol (Ctrl+Shift+O)                               | `listingProviders.ts` `documentSymbols` :83 (`name: fn.name` :91)                                                                                                                                                                                                                                                                                      | raw function names                                                                                                                                                                                                  | the short name                                                                                                                                                      |
| **Symbols panel**                                         | `E/lib/listing/listingSymbols.ts` (`listingFunctions` :35, `filterFunctions` :103), `E/components/specific/workbench/SymbolsPanel.svelte` (row :281-285)                                                                                                                                                                                               | raw names, filtered by name or address                                                                                                                                                                              | short name, tooltip with the signature and the mangled name, filter by either                                                                                       |
| Patched lines                                             | `E/lib/listing/patchFormat.ts` `describeLine` :197                                                                                                                                                                                                                                                                                                     | the generator's comments (strings)                                                                                                                                                                                  | the same demangled comments                                                                                                                                         |
| Pseudocode input                                          | `E/lib/pseudocode/programImage.ts`: functions by `stubFunctionName` (:39, :62), `dataNames` :150, `functionSlots` :181; built on the main thread by `pseudocodeClient.ts` and posted to the Pseudocode worker                                                                                                                                          | mangled names, which `glibc.h`'s C++ declarations bind by (see below)                                                                                                                                               | short names with a namespace path and the mangled name to bind by (package change)                                                                                  |
| Pseudocode hover, header, notices                         | `E/lib/monaco/pseudocodeProviders.ts` (hover :56, `listingNameOfTarget` :62), `E/lib/pseudocode/pseudocodeMap.ts` (`listingNameOfTarget` :280, `pseudocodeTargetAt` :235), `pseudocodeDocuments.svelte.ts` header :83, `PseudocodeNotice.svelte` :31, `PseudocodeStatus.svelte` :24, :34                                                               | the Listing's raw name                                                                                                                                                                                              | demangled forms                                                                                                                                                     |
| Call stack                                                | `X86Emulator._getCallStack`: a frame named by its Listing function (`start.name`), else the Core's symbol (`frameName`); drawn by `E/components/specific/project/user-tools/CallStack.svelte`                                                                                                                                                          | raw                                                                                                                                                                                                                 | short name, signature as tooltip                                                                                                                                    |
| History                                                   | `X86Emulator._libraryStretchName` and `libraryFunctionName`, drawn as "Called …: N instructions" in `MutationStep.svelte`                                                                                                                                                                                                                              | `_ZNSolsEi in libstdc++.so.6`                                                                                                                                                                                       | short name                                                                                                                                                          |
| Memory view labels                                        | `X86Emulator._getMemoryLayout` (the Core's `readMemoryLayout` over the Executable's `.symtab`, `packages/x86/blink-js/src/memory-layout.ts`), then `GenericEmulator.addDecorations` → `compiledMemoryNames` (:451), which leaves an Executable's labels as they are (no compiled languages)                                                            | raw: `_ZSt4cout@GLIBCXX_3.4`, `_ZTVN4game4BossE`; a stripped program has none                                                                                                                                       | `displayName` set by the x86 adapter, so the picker, hover and search already show and match it (`memoryRegions.ts` :236, `MemoryControls.svelte` :105, :171, :235) |
| Memory address box                                        | `GenericEmulator.resolveMemoryLabel` :236 (data labels by `name` or `displayName`), then `X86Emulator._resolveMemoryLabel` (the Listing's labels by raw name); `resolveMemoryAddress` (`memoryRegions.ts` :258)                                                                                                                                        | raw names                                                                                                                                                                                                           | also unique short names and signatures                                                                                                                              |
| Library Listings                                          | the same generator and worker, under `@lib/<soname>`                                                                                                                                                                                                                                                                                                   | raw; `@lib/libstdc++.so.6` has 9,113 mangled labels                                                                                                                                                                 | as the Executable's                                                                                                                                                 |
| Build output                                              | an ordinary Executable's Listing and Pseudocode                                                                                                                                                                                                                                                                                                        | raw                                                                                                                                                                                                                 | as an Executable's; its memory labels already go through `compiledMemoryNames` for a C++ Build                                                                      |
| Log notes                                                 | `X86Emulator._terminationNotes`, `noteUnimplementedSyscall`, `workbenchLog.ts`                                                                                                                                                                                                                                                                         | no symbol names (instruction text from Zydis, syscall names, library sonames)                                                                                                                                       | none                                                                                                                                                                |
| **Breakpoints**                                           | `E/lib/listing/listingBreakpoints.ts`, `AddressBreakpoint`s                                                                                                                                                                                                                                                                                            | addresses, no names                                                                                                                                                                                                 | none                                                                                                                                                                |
| C++ Builds' memory labels                                 | `E/lib/languages/compiledMemoryNames.ts` (`prepareMemoryNames` loads the demangler before a C++ Build)                                                                                                                                                                                                                                                 | full `__cxa_demangle` text (memory-regions decision 9)                                                                                                                                                              | moves to the shared demangled-name module; data labels read the same                                                                                                |

### The demangler module

`E/lib/languages/demangle/module.js` is LLVM libc++abi's `__cxa_demangle` behind a five-line wrapper (`packages/asm-editor/scripts/demangle/demangle.cpp`), built by `scripts/demangle/build.sh` with `-Oz -s SINGLE_FILE=1 -s ENVIRONMENT=web,node -s MODULARIZE=1 -s EXPORT_ES6=1`: 94,763 bytes, 35,719 gzipped, the wasm inlined as a binary string (`binaryDecode`), no `locateFile` and no fetch. Its glue checks `globalThis.WorkerGlobalScope`, so it runs in a worker although `ENVIRONMENT` does not name one, and its `import("node:module")` sits behind its Node check; Vite replaces it with a browser stub, as in today's production main-thread chunk (`CJ4likGl.js`, 107,937 bytes).

**It loads in the Listing worker.** The editor builds workers as ES modules (`vite.config.ts`, `worker.format: 'es'`), and the Listing worker already loads Zydis by dynamic `import()` into chunks of its own (`build/_app/immutable/workers/chunks`). A scratch page built with the editor's Vite, whose `?worker` module worker dynamically imports `module.js` and demangles two names, ran in headless Chromium: the module split into its own 108 KB chunk, and the worker answered `std::allocator<char>::allocator()` 72 ms after the import began. In Node the module loads in 8 to 35 ms.

**It cannot say where a name's parts are.** `__cxa_demangle` returns one string. Shortening needs the boundaries of the return type, the qualified name, the parameters and the qualifiers, and reading them back from the text is the fragile part: a template function's return type comes first (`std::basic_ostream<char, std::char_traits<char>>& std::operator<<<char, …>(…)`), operator names hold brackets (`operator<<<`, `operator()`, `operator[]`), lambdas print `main::'lambda'(int)`, and parameters can be function pointers (`std::ostream& (*)(std::ostream&)`). The same LLVM demangler builds a syntax tree first (`ItaniumDemangle.h`, which emsdk ships in `system/lib/libcxxabi/src/demangle/`), and LLVM's own `ItaniumPartialDemangler` reads those parts off it. A scratch `describe(name)` written over that header (about 150 lines, LLVM's allocator and `parse_discriminator` copied from `cxa_demangle.cpp`) returns the kind (function, special name, data), the full text, the qualified name, the parameter list, the return type, the qualifiers, the constructor or destructor variant (`C1`, `C2`, `D0`, `D1`, `D2`), a special name's prefix (`vtable for `) and a GCC clone suffix. Built with the same flags it is 101,022 bytes, 38,879 gzipped, about 6 KB more than today's, and it replaces `__cxa_demangle`, whose whole text is one of its fields.

**Speed.** `libstdc++.so.6`'s dynamic symbol table has 6,030 `_Z` entries, which its Listing turns into 9,113 mangled labels (with `@plt`, `@plt_resolver`, `@got` and 27 non-default versions) among 12,926 labels and 6,821 functions. In three rounds in one Node process: `__cxa_demangle` over all of them took 71, 49 and 30 ms; `describe` 97, 79 and 65 ms; `describe` with the suffix split and the shortening below, as unoptimised scratch JavaScript, 322, 273 and 208 ms. Generating that Listing took 3.9 s in the same process, so demangling adds under a tenth. The FactCheck-like `-O0` program (102 KB, 356 functions, 412 mangled labels) took 4 to 6 ms on a 104 ms Listing.

**What it cannot read.** Of libstdc++'s 9,113: the 108 `_ZGTt…` transaction clones, which LLVM's demangler does not know and GNU's `c++filt` writes as "transaction clone for …" (stripping `GTt` and demangling the rest works), and 6 typeinfo names of `_Float32x`/`_Float64x` pointers (`_ZTIPKDF64x`). Of the FactCheck-like program's 412, one: `std::swap<int>` whose return type is an `enable_if` with an `sr` expression (`_ZSt4swapIiENSt9enable_ifIXsrSt6__and_…`), which GNU's `c++filt` reads. Rust's v0 mangling (`_R…`) is not read; Rust's legacy one is (`_ZN4core3fmt5write17h1b2c3d4e5f607182E` → `core::fmt::write::h1b2c3d4e5f607182`). LLVM's text also differs from GNU's in two places a reader may compare with gdb or `objdump -C`: `>>` without a space, and lambdas as `main::'lambda'(int)` where GNU writes `main::{lambda(int)#1}`.

**Where a demangled name is needed outside the worker.** The Listing reaches the main thread with its labels, so hovers, the Symbols panel, Go to Symbol and the program image read what the worker computed. Two places read names that are not the Listing's: the memory view's data labels (the Core's `.symtab` reading) and the Call stack's and History's names of library functions whose Listing has not been made (Blink's `resolveSymbol`). They need the module on the main thread too, as a C++ Build's memory labels already load it there.

### What the names look like

From the FactCheck-like program unless marked. "Short" is what lists and the Pseudocode show, "comment" what the Listing's trailing comment shows; both are defined in decision 5.

| Listing label                                                                                             | `__cxa_demangle`                                                                                                                                                                      | Short                                                                     | Comment                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `_ZNSaIcEC1Ev@plt`                                                                                        | fails; without `@plt`: `std::allocator<char>::allocator()`                                                                                                                            | `std::allocator<char>::allocator@plt`                                     | `std::allocator<char>::allocator()`                                                                      |
| `_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_`                                           | `std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>>::operator+=(std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>> const&)`   | `std::string::operator+=`                                                 | `std::string::operator+=(std::string const&)`                                                            |
| `_ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE9push_backERKS5_`               | `std::vector<std::__cxx11::basic_string<…>, std::allocator<std::__cxx11::basic_string<…>>>::push_back(std::__cxx11::basic_string<…> const&)` (285 characters)                         | `std::vector<std::string>::push_back`                                     | `std::vector<std::string>::push_back(std::string const&)`                                                |
| `_ZNSt3mapINSt7__cxx11…EEixERS9_`                                                                         | 401 characters                                                                                                                                                                        | `std::map<std::string, int>::operator[]`                                  | `std::map<std::string, int>::operator[](std::string const&)`                                             |
| `_ZNSolsEi@plt`                                                                                           | `std::ostream::operator<<(int)`                                                                                                                                                       | `std::ostream::operator<<@plt`                                            | `std::ostream::operator<<(int)`                                                                          |
| `_ZStlsIcSt11char_traitsIcESaIcEERSt13basic_ostreamIT_T0_ES7_RKNSt7__cxx1112basic_stringIS4_S5_T1_EE@plt` | `std::basic_ostream<char, std::char_traits<char>>& std::operator<<<char, std::char_traits<char>, std::allocator<char>>(std::basic_ostream<…>&, std::__cxx11::basic_string<…> const&)` | `std::operator<<<char, std::char_traits<char>, std::allocator<char>>@plt` | `std::operator<<<char, std::char_traits<char>, std::allocator<char>>(std::ostream&, std::string const&)` |
| `_Znwm@plt`                                                                                               | `operator new(unsigned long)`                                                                                                                                                         | `operator new@plt`                                                        | `operator new(unsigned long)`                                                                            |
| `_ZNSs4_Rep10_M_destroyERKSaIcE@GLIBCXX_3.4` (libstdc++)                                                  | fails; without the version: `std::string::_Rep::_M_destroy(std::allocator<char> const&)`                                                                                              | `std::string::_Rep::_M_destroy@GLIBCXX_3.4`                               | `std::string::_Rep::_M_destroy(std::allocator<char> const&)`                                             |
| `_ZSt4endlIcSt11char_traitsIcEERSt13basic_ostreamIT_T0_ES6_.isra.0.cold` (`-O2`)                          | `std::basic_ostream<…>& std::endl<char, std::char_traits<char>>(std::basic_ostream<…>&) (.isra.0.cold)`                                                                               | `std::endl<char, std::char_traits<char>> [clone .isra.0.cold]`            | `std::endl<char, std::char_traits<char>>(std::ostream&) [clone .isra.0.cold]`                            |
| `_ZN4game6PlayerD0Ev`                                                                                     | `game::Player::~Player()`                                                                                                                                                             | `game::Player::~Player`                                                   | `game::Player::~Player() [deleting]`                                                                     |
| `_ZN4game6PlayerC1ENSt7__cxx11…E`                                                                         | `game::Player::Player(std::__cxx11::basic_string<…>)`                                                                                                                                 | `game::Player::Player`                                                    | `game::Player::Player(std::string)`                                                                      |
| `_ZZ4mainENKUliE_clEi`                                                                                    | `main::'lambda'(int)::operator()(int) const`                                                                                                                                          | `main::'lambda'(int)::operator()`                                         | `main::'lambda'(int)::operator()(int) const`                                                             |
| `_ZNKSt3_V214error_category10_M_messageB5cxx11Ei` (libstdc++)                                             | `std::_V2::error_category::_M_message[abi:cxx11](int) const`                                                                                                                          | `std::_V2::error_category::_M_message`                                    | `std::_V2::error_category::_M_message(int) const`                                                        |
| `_ZZL8greetingvE4text`                                                                                    | `greeting()::text`                                                                                                                                                                    | `greeting()::text`                                                        | `greeting()::text`                                                                                       |
| `_ZGVZL8greetingvE4text`                                                                                  | `guard variable for greeting()::text`                                                                                                                                                 | the same                                                                  | the same                                                                                                 |
| `_ZTVN4game4BossE`, `_ZTIN4game4BossE`, `_ZTSN4game4BossE`                                                | `vtable for game::Boss`, `typeinfo for game::Boss`, `typeinfo name for game::Boss`                                                                                                    | the same                                                                  | the same                                                                                                 |
| `_ZThn16_N4game4BossD1Ev` (constructed)                                                                   | `non-virtual thunk to game::Boss::~Boss()`                                                                                                                                            | the same, without `()`                                                    | the same                                                                                                 |
| `_ZGTtNSt11range_errorD1Ev@plt_resolver` (libstdc++)                                                      | fails                                                                                                                                                                                 | `transaction clone for std::range_error::~range_error@plt_resolver`       | `transaction clone for std::range_error::~range_error()`                                                 |

The Listing labels that carry suffixes, in libstdc++'s Listing: 5,998 none, 1,354 `@got`, 880 `@plt`, 854 `@plt_resolver`, 27 a version. A default version never shows (the Listing names `memcpy@@GLIBC_2.14` `memcpy`), and no `_N` numbering occurred in either program. GCC's clone suffixes (`.cold`, `.isra.N`, `.constprop.N`, `.part.N`, `.lto_priv.N`, and their combinations) are read by the demangler itself; `@`-suffixes and `_N` make it fail, so they must be split off first and put back after.

A short name runs to 46 characters at the median, 196 at the 90th percentile and 293 at most in the `-O0` program (`std::sort<…>` and friends); 36, 78 and 132 in libstdc++.

### Shortening

The substitution works on the demangler's text of each part, rewriting every template-id `head<args>` innermost first: the arguments are split at their top-level commas (counting `<>`, `()`, `[]` and `{}`, and skipping operator names such as `operator<<` and quoted `'lambda'`), shortened themselves, and then the head and its shortened arguments are looked up:

- `std::__cxx11::basic_string<C, std::char_traits<C>, std::allocator<C>>` and the old ABI's `std::basic_string<…>` become `std::string`, `std::wstring`, `std::u8string`, `std::u16string`, `std::u32string` for `char`, `wchar_t`, `char8_t`, `char16_t`, `char32_t`; `std::basic_string_view<C, std::char_traits<C>>` becomes `std::string_view` and its siblings.
- `std::basic_X<C, std::char_traits<C>>` becomes `std::X` or `std::wX` for `ios`, `streambuf`, `istream`, `ostream`, `iostream`, `filebuf`, `ifstream`, `ofstream`, `fstream`; `std::__cxx11::basic_X<C, std::char_traits<C>, std::allocator<C>>` likewise for `stringbuf`, `istringstream`, `ostringstream`, `stringstream`.
- Trailing arguments equal to the standard default are dropped, defaults built from the shortened earlier arguments: `vector`, `deque`, `list`, `forward_list` (`std::allocator<T>`); `set`, `multiset` (`std::less<K>`, `std::allocator<K>`); `map`, `multimap` (`std::less<K>`, `std::allocator<std::pair<K const, V>>`); the four unordered containers (`std::hash<K>`, `std::equal_to<K>`, the allocator); `unique_ptr` (`std::default_delete<T>`); `stack` and `queue` (`std::deque<T>`); `priority_queue` (`std::vector<T>`, `std::less<T>`). An argument that is not the default stops the dropping: `std::set<int, std::greater<int>, std::allocator<int>>` reads `std::set<int, std::greater<int>>`.
- The `__cxx11` inline namespace (and libc++'s `__1`) goes from those templates' names only (`std::__cxx11::list<int, …>` reads `std::list<int>`); elsewhere it stays.
- Everything else stays as the demangler wrote it: `__gnu_cxx::__normal_iterator<int*, std::vector<int>>`, `std::_Rb_tree<std::string, std::pair<std::string const, int>, …>`, `std::__new_allocator<char>`.

The scratch version is about 120 lines and produced every example above. The shortened forms are only for reading; the exact demangled text stays in the hover.

**Collisions in lists.** Functions whose short names are the same, then whose signatures are the same, then whose signature and constructor or destructor variant are the same:

|                      | Functions | Same short name | Same signature too | Same variant too |
| -------------------- | --------- | --------------- | ------------------ | ---------------- |
| FactCheck-like `-O0` | 356       | 57              | 4                  | 0                |
| FactCheck-like `-O2` | 107       | 6               | 4                  | 0                |
| `libstdc++.so.6`     | 6,821     | 3,614           | 2,635              | 2,148            |

A program's collisions are overloads (`sum(std::vector<int> const&)` and `sum(std::vector<std::string> const&)`, a class's several constructors) and destructor variants at different addresses (`D0` beside `D1`); complete and base variants at one address are already one function of the Listing, its aliases. libstdc++ keeps both string ABIs, so after shortening its old `std::string` (from `Ss`) and its `std::__cxx11::basic_string<char, …>` read alike, as do `std::messages<char>` and `std::__cxx11::messages<char>`; only their addresses and the exact text in the hover tell them apart.

### The trailing comments

Adding the comment to every line whose operand names a mangled label, every `dq` pointer to one and every label line of one: the FactCheck-like `-O0` Listing gains 103,634 characters (28%) on 1,027 lines, the longest line 779 characters; libstdc++'s gains 1.6 million characters (10%) on 25,855 lines, the longest 994. An excerpt of `main` and of the vtable, as phase 1 would print them:

```nasm
    call _ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEixEm ; std::string::operator[](unsigned long)
    call _ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_ ; std::string::operator+=(std::string const&)
    call _ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE9push_backERKS5_ ; std::vector<std::string>::push_back(std::string const&)
    lea rax, [rel _ZTISt13runtime_error@GLIBCXX_3.4] ; typeinfo for std::runtime_error
    call _ZNSolsEi@plt                  ; std::ostream::operator<<(int)

_ZTVN4game4BossE: db 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    dq _ZTIN4game4BossE                 ; typeinfo for game::Boss
    dq _ZN4game4BossD1Ev                ; game::Boss::~Boss()
    dq _ZN4game4BossD0Ev                ; game::Boss::~Boss() [deleting]
    dq _ZNK4game4Boss5bonusEv           ; game::Boss::bonus() const
```

Nothing that reads the Listing's text is disturbed by a comment: `listingTokenAt` and `ListingIndex.references` treat a comment's words as names but find no label called `string` or `operator`, `instructionText` and the Patch prompt strip comments (`withoutComment`), and label lines are read by the line table, not their text. One care: `insideString` (`listingNavigation.ts`) toggles at every unescaped `"`, and LLVM prints a template argument made from a string with its quotes (`int g<Fixed{"hello"}>()`), so a comment escapes `"` as `\"`, as string comments already do.

### The decompiler and C++ names

The host (`D/host/src/program.cc`) reads functions through Ghidra's `Architecture::readLoaderSymbols("::")` (:312, `G/architecture.cc` :346), which splits each name at every `::` (`Database::findCreateScopeFromSymbolName`, `G/database.cc` :3147) into namespace scopes. Data names go to the global scope whole (`addData`, `global->addSymbol`), and prototypes bind by name in the global scope only (`symbolsNamed`, `D/host/src/declarations.cc` :285).

**Any `::` in a function's name hides the function today.** With the FactCheck-like program's short names passed as names to the unchanged package (1.0.0), every function whose name holds `::` vanished: its calls printed `func_0x555555559942(auStack_128,auStack_c8)` and decompiling it failed with "No function starts at 0x555555559a78". `Scope::queryFunction(address)` (`G/database.cc` :1287) asks `Database::mapScope` (:3181) which scope owns the address and searches from there up to the global scope; a namespace scope that `readLoaderSymbols` made owns no addresses, so its functions are found by name but never by address. Ghidra's Java side answers such queries itself, and its console restores scope ranges from XML, so neither meets this. So the problem is wider than the proposal's: not only template brackets but any qualified name. A name with spaces or parentheses and no `::` prints as given (`push back(auStack_198,auStack_128)`, `operator[](unsigned long) const(auStack_108,0)`), but a parameter list holding `std::string` has a `::` and vanishes too.

**Registering each function's address with its scope fixes the lookups.** A prototype of the host (`Database::addRange(scope, codeSpace, address, address)` after `readLoaderSymbols`) was linked natively against the package's objects and, in a scratch copy, rebuilt to wasm with `scripts/compile_decompiler.sh` (22 s incremental, `decompiler.mjs` byte-identical, so only the wasm changes). `main` then reads:

```c
  std::string::operator+=(auStack_128,auStack_c8);
  std::vector<std::string>::push_back(auStack_198,auStack_128);
  piVar4 = (int *)std::map<std::string, int>::operator[](auStack_158,auStack_128);
  game::Player::Player(auStack_68,auStack_88);
```

where today it reads `_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_(auStack_128,auStack_c8);`.

**Splitting at every `::` still garbles templated names.** With the ranges registered but the names split by Ghidra, 74 of the program's 291 functions printed differently from names given with an explicit scope path. 72 differ only in where long lines break; in 2 a name is cut inside its template arguments: in `std::_Destroy<std::string*>` a call prints `string>(uStack_20);` for `_Destroy<std::string>(uStack_20);`, and in `std::pair<std::string const, int>::pair<std::string const&>` one prints `string` for `pair<std::string const&, 0ul>`. Minimal qualification computes the common ancestor of two scope paths, and `std::vector<std` is a scope of both `std::vector<std::string>` and `std::vector<std::pair<…>>`. With the editor splitting at top-level `::` only and passing the path (joined by `\x1f`, the prototype's stand-in for a field), all 291 decompile, opening the program takes 27 to 38 ms against 23 to 34 ms with mangled names, and `main` decompiles in about 77 ms either way.

**Demangled names also stop the prototypes binding.** `prototypes/glibc.h` declares C++'s `operator new` and `delete` and the `std::__throw_*` helpers by their mangled names (`void *_Znwm(size_t size);`, `_Noreturn void _ZSt20__throw_length_errorPKc(const char *what);`), since Ghidra's C parser reads no `::` or operators. Named `std::__throw_length_error`, the stub no longer binds: in `std::vector<std::string>::_M_check_len`, `__throw_length_error(param_3)` loses `/* WARNING: Subroutine does not return */` and its parameter's `char *`, so the decompiler takes the throw for a call that returns. The package needs a second name to bind by.

**What the Pseudocode then prints.** Under Ghidra's minimal strategy (`G/printc.cc` :202 `pushSymbolScope`, `Symbol::getResolutionDepth`), a call from `main` (the global scope) prints the whole path, and a call inside the same class or namespace drops what they share: inside `std::vector<std::string>::_M_check_len`, `max_size(param_1)`, `size(uStack_40)`, `max<unsigned long>(&uStack_30,&uStack_48)`, and inside `std::vector<std::string>::push_back`, `string::basic_string(uVar1,param_2)`. The deleting destructor `game::Boss::~Boss` reads `~Boss(param_1); operator delete(param_1,0x30);`, its call of the complete destructor unqualified and named alike. A function's own declaration line prints its whole path (`void std::vector<std::string>::push_back(long param_1,undefined8 param_2)`). The strategy is Ghidra's `namespacestrategy` option (`G/options.cc` :958), which the host can set as it sets `readonly`; in the prototype, `all` printed `std::vector<std::string>::size(uStack_40)` and `none` printed `size(uStack_40)` with the declaration `ulong _M_check_len(…)`.

**Tokens.** The namespaces are separate atoms with no operation or variable (`PrintC::pushSymbolScope`), so the markup gives them no target: `std::string::operator+=` comes out as `std` and `string` (kind `variable`, no target), two `::` (`syntax`) and `operator+=` (`function`, its target). Today's `pseudocodeTargetAt` would link only `operator+=`. Ghidra's printer may break a line after a namespace (`void std::` then the name on the next line), so a qualified name can span two lines.

**Data with spaces.** `typeinfo for std::runtime_error` and `guard variable for greeting()::text` print as given (`__cxa_throw(thrown_exception,typeinfo for std::runtime_error,…)`, `if ((char)guard variable for greeting()::text == '\0')`), one token each. They read badly as C, and Monaco's C tokenizer, which colours the Pseudocode (the view's language is `c`, `EditorGroup.displayedLanguage`), would colour the `for` inside them as a keyword.

**Everything the editor reads from the Pseudocode is by address.** `PseudocodeMap`, token `target`s, `listingLineOfTarget`, `listingNameOfTarget`, the Pseudocode's Breakpoints and Run to Cursor use addresses, so qualified names change none of them. The whole-loop test, `programImage.test.ts` ("prints only names the Listing gives, for every function", :141), compares printed names with Listing labels and needs the demangled names added.

**The package can be rebuilt here.** `/home/dev/emsdk` holds emsdk 6.0.9 (the version 1.0.0's changelog and `build/wasm/stamp` name), `build/wasm` and `build/native` hold current objects, and both the incremental wasm build and a native link of the prototype succeeded. The package is at 1.0.0 in its changelog (`c20651e`), neither tagged nor published on npm; the editor depends on it through `workspace:*`, so a change reaches the editor by a submodule commit and pointer bump, with no publication needed.

### Phase 3 seen from today's package

Today's package already binds C declarations by a mangled name. Adding to `glibc.h` a 32-byte `struct string { char *_M_p; unsigned long _M_string_length; char _M_local_buf[16]; };` and five `std::string` members declared by their mangled names with `struct string *` parameters turned the FactCheck-like `main`'s locals from `undefined1 auStack_128 [32]` into `string sStack_128`, its calls into `…(&sStack_108,"1",auStack_158)`, and `operator[]`'s result into `char *` without a cast. Phase 1's second name keeps this route open once the names are demangled.

### Licensing

The module and its source are under Apache-2.0 with the LLVM Exception, whose text `E/lib/languages/demangle/LICENSE.txt` holds beside the module, copied by `build.sh`. The exception waives sections 4(a), 4(b) and 4(d) (a copy of the licence, change notices, the NOTICE file) for portions of LLVM compiled into an object form of one's own code, which is how libc++abi's demangler reaches the module, so the deployed app need not carry the notice; it carries none today, for anything. The `describe` wrapper would include LLVM's header and copy code from `cxa_demangle.cpp` and `ItaniumPartialDemangler`, so its source file states `Apache-2.0 WITH LLVM-exception` and where it comes from; the compiled module stays under the exception. Separately, and not about demangling: the site also ships Ghidra's wasm without Ghidra's `NOTICE` (Apache-2.0 without the exception), which the package's `dist` carries but the site build does not.

## Phase 1 decisions

1. **Demangle in the Listing worker, while the Listing is made.** `listingService.ts` analyses the ELF once, loads the demangler only when its symbol tables or relocations hold a `_Z` name (a C program never pays for it, a stripped C++ one does through its dynamic symbols), and passes the analysis and the demangler to `generateListing`, which demangles every label it names. The same Listing is made for an Executable, the **Build output** and every library Listing (`@lib/libstdc++.so.6`). Nothing is saved, so no names version changes ([ADR 0045](../adr/0045-invented-names-are-frozen-words-from-file-addresses.md)'s frozen words are untouched).
2. **The mangled name stays the label.** `ListingLabel.name` and `fullName`, the Listing's text tokens, Go to Definition, References, the memory address box's raw names and every lookup keep the raw name; a label of a mangled name gains an optional `demangled` record (decision 5). C programs' Listings stay byte-identical.
3. **The editor's demangler reports a name's parts.** `scripts/demangle/demangle.cpp` exports `describe(name)` over LLVM's `ItaniumDemangle.h`, as LLVM's `ItaniumPartialDemangler` does: kind, full text, qualified name, parameters, return type, qualifiers, constructor or destructor variant, special-name prefix, clone suffix. It replaces `__cxa_demangle` in the module (about 101 KB, 39 KB gzipped). Rejected: reading the parts back from `__cxa_demangle`'s text, which would have to re-parse return types, operator names, lambdas and function-pointer types.
4. **Suffixes are split off, then put back.** Before demangling: the Listing's `@plt`, `@plt_resolver`, `@got`, a non-default version (`@GLIBCXX_3.4`), and `_N` numbering (only when the name without it demangles and with it does not). A `_ZGTt` prefix becomes "transaction clone for ". GCC's clone suffixes stay with the demangler, which reads them, and are written as `objdump -C` and gdb write them: `[clone .isra.0.cold]`. In lists and hovers the Listing's suffix follows the name as `objdump -C` writes it (`std::allocator<char>::allocator()@plt`); comments leave it out, since the operand beside them shows it.
5. **Three forms of a demangled name**, all computed in the worker and carried on the label:
    - the **short name**, for lists and the Pseudocode: the qualified name with standard templates shortened (decision 6), without return type, parameters, `const`/`&` qualifiers and `[abi:…]` tags, keeping the function's own template arguments, its clone suffix and the Listing's suffix: `std::string::operator+=`, `game::clampTo<int>`, `std::ostream::operator<<@plt`;
    - the **signature**, for comments and hover titles: the short name with its shortened parameters and qualifiers: `std::string::operator+=(std::string const&)`, `std::map<std::string, int>::size() const`;
    - the **demangled text**, exactly as the demangler printed it, for the hover;
    - for data and special names, one form only, the text with templates shortened: `std::cout`, `greeting()::text`, `vtable for game::Boss`.

    Names the demangler cannot read keep no record and show raw. Rust's legacy hash stays (`core::fmt::write::h1b2c3d4e5f607182`).

6. **Shortening by a table over template-ids**, as in [Shortening](#shortening): strings, string views and streams for each character type; containers', `unique_ptr`'s and the adaptors' trailing default arguments dropped; `__cxx11` dropped from those templates; the rest verbatim. Bracket-aware, innermost first, never by regular expressions over the whole text.
7. **Lists tell collisions apart step by step.** A list (Symbols panel, Go to Symbol) shows the short name; where two functions of a Listing share it, both show their signatures; where those match too, the constructor or destructor variant in brackets (`[complete]`, `[base]`, `[deleting]`); past that the address column tells them apart (libstdc++'s two string ABIs). The worker computes this list form once per Listing.
8. **A deleting destructor is marked wherever its signature shows.** The demangler writes `D0`, `D1` and `D2` alike, and a vtable lists `D1` and `D0` side by side, the classic confusion; comments and hovers add `[deleting]` to `D0`, and the rarer allocating (`C3`) and inheriting (`CI1`, `CI2`) constructors get their word too. Complete and base variants, usually one address with two names, stay unmarked except in a list's collision step and in the hover, which always names the variant.
9. **Trailing comments in the Listing, beside the mangled token.** On an instruction line whose branch, call, `[rel …]` or absolute operand names a demangled label, on a `dq` pointer to one and on a demangled label's own line, the comment gives the signature, or for data its one form, with any `+0x10` offset: `call _ZNSaIcEC1Ev@plt ; std::allocator<char>::allocator()`, `dq _ZN4game4BossD0Ev ; game::Boss::~Boss() [deleting]`. A signature over 100 characters is written as its short name and `(…)`. They follow the string comments' rules (`instructionLineText`, column 40, `"` escaped), and a patched line (`patchFormat.describeLine`) gets the same. Ctrl+F then finds a function by its C++ name at its definition and its calls. Label-line comments are an addition to the proposal, which named call sites.
10. **Hovers give all three.** The Listing's hover on a demangled label, and the Pseudocode's on a demangled function or global, give the signature as the title, then the demangled text when it differs, then the variant and the mangled name, then the address and origin as today: "`std::string::operator+=(std::string const&)` at `0x555555559942` … `_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_`, named by the symbol table."
11. **The other places show the short name** (the signature where it tells overloads apart, decision 7): the Symbols panel's rows, with a tooltip of the signature, mangled name, address and size, and a filter that matches the raw name, the short name and the signature; Go to Symbol's names (its `detail` stays the address; Monaco filters by name alone, so the mangled name is found through the Symbols panel or Ctrl+F instead); the Pseudocode's header comment, notice and status; the Call stack, with the signature as tooltip; the History's "Called std::ostream::operator<< in libstdc++.so.6". The memory address box takes a short name or a signature as well as the raw name, when only one label has it.
12. **The memory view's labels for an Executable come from the x86 adapter.** `X86Emulator._prepareBuild`, which today returns at once for an Executable, loads the demangler when the Executable has `_Z` symbols, and `_getMemoryLayout` gives such labels a `displayName` (the data form), which the picker, its search, the grid's hover and the address box already use. The same loaded module names the Call stack's and History's library functions whose Listing has not been made. `compiledMemoryNames` keeps C++ Builds' names, through the same display-name module.
13. **The Pseudocode gets short names with an explicit scope path, through a package change.** The editor passes each demangled function as its base name (`operator+=`), its scope path split at top-level `::` only (`['std', 'string']`, `['std', 'vector<std::string>']`) and its mangled name to bind prototypes and pointers by. The host creates the scopes itself and registers each function's address with its scope. Rejected, an editor-side protection: any `::` hides a function from today's host, a lookalike separator would print full paths always and lose minimal qualification, and the mangled `glibc.h` declarations would still stop binding (the `__throw_*` helpers' noreturn). This needs a new decompiler package version and a wasm rebuild (plan, P0).
14. **Ghidra's minimal namespaces in the Pseudocode**, as the owner recommended: calls from `main` read `std::string::operator+=(…)`, calls inside a class drop the class. The package exposes Ghidra's strategy (`minimal`, `all`, `none`) as an option; the editor uses the default.
15. **A qualified name is one token.** The package's JavaScript merges namespace atoms and `::` into the name token they lead to, within a line, so `std::string::operator+=` is one `function` token with its target: the hover, the double-click and its underline cover the whole name. A name broken across two lines keeps its first part unlinked.
16. **Special data names read as identifiers in the Pseudocode.** A vtable, VTT, typeinfo, typeinfo name or guard variable is passed as `game::Boss::vtable`, `game::Boss::VTT`, `game::Boss::typeinfo`, `game::Boss::typeinfo_name`, `greeting()::text::guard`, after the place Ghidra's symbol tree files them under their class; the Listing, hovers and memory view keep `objdump`'s and gdb's words (`vtable for game::Boss`), and the Pseudocode hover gives both. Special functions (thunks, thread-local routines, transaction clones) take the name of the function they stand for, as Ghidra names a thunk; the hover says which they are.

## Phase 1 plan

Seven work groups, P0 to P6. Only P4, the Pseudocode, needs the decompiler change (P0), which reaches the editor through the submodule; the rest is the editor's.

| Step | Groups running |
| ---- | -------------- |
| 1    | P0, P1         |
| 2    | P2, P5         |
| 3    | P3, P4         |
| 4    | P6             |

Rules as in [the reverse-engineering UX plan](./reverse-engineering-ux-plan.md): one commit per group, by path, no trailer, nothing pushed; `node_modules/.bin/vp test run <paths>`, `vp check`, `vp lint` before committing.

### P0: the decompiler package (decisions 13 to 15)

In the `packages/decompiler` submodule, on its `main`, then a pointer bump in the editor.

- **API** (`D/js/src/index.ts`):
    - `ProgramFunction` gains `namespace?: string[]`, the namespaces and classes it is in, outermost first, each printed as given (`['std', 'vector<std::string>']`), and `symbol?: string`, the name prototypes bind by and pointers name it by (its linkage name, `_ZSt20__throw_length_errorPKc`), by default `name`. A `name` is never split again: one without `namespace` is in the global scope as given.
    - `ProgramData` gains the same two fields; `ProgramPointer` gains `symbol?`, naming its function by symbol when given, else by `name` and `namespace`.
    - `openProgram(image, { namespaces?: 'minimal' | 'all' | 'none' })`, Ghidra's `namespacestrategy`, `minimal` by default.
    - `decodeFunction` merges each run of namespace and `::` tokens into the named token after it (decision 15).
    - The image format goes to version 3 (`IMAGE_VERSION`, `encodeImage`): each function, data and pointer entry adds its path (a count and length-prefixed parts) and its symbol.
- **Host:**
    - `D/host/src/program_image.hh`, `program_image.cc`: the new fields, reading version 3.
    - `D/host/src/program.cc`: replace `readLoaderSymbols("::")` with a loop that walks each path with `Database::findCreateScope(Scope::hashScopeName(…), part, parent)`, adds the function there and calls `symboltab->addRange(scope, codeSpace, address, address)`; data likewise over its size; `pointedFunctions` keyed by symbol; the namespace option set with `ELEM_NAMESPACESTRATEGY` beside `ELEM_READONLY`.
    - `D/host/src/declarations.cc`: `symbolsNamed` also finds functions and data whose `symbol` is the declared name (an index kept by the program), so `glibc.h` binds as before.
    - `D/host/native/main.cc` and `elf_image.cc`: `--image` reads version 3.
- **Behaviour change:** a name holding `::` is no longer split. In 1.0.0 such a function could not be found by address, so this fixes rather than breaks; the changelog says so.
- **Tests** (`D/js/tests/namespaces.test.ts`, new), on the Core's `cpp` fixture copied into `D/js/tests/fixtures/elf/` with its source and licence notes, as `crackme` was:
    - a call of a namespaced function prints its path from `main` and not inside its class;
    - `std::vector<std::string>` stays one scope;
    - a namespaced function decompiles;
    - `_ZSt20__throw_length_errorPKc` as `symbol` keeps the throw noreturn, and a pointer binds by symbol;
    - `all` and `none` print as above;
    - qualified names are one token with the target;
    - names with spaces and parentheses print as given;
    - the native reference (`scripts/compile_native.sh`, `fixtures/reference`) and the dist smoke test, brought up to date.
- **Build and release:** `source /home/dev/emsdk/emsdk_env.sh && scripts/compile_decompiler.sh` (the sha256 lines go in the commit message, as the script asks). Then README ("Describing a program"), and a changelog entry: 1.1.0, or folded into 1.0.0, which is neither tagged nor published (an open question). Publishing stays the owner's; the editor needs only the submodule bump.

### P1: the demangler and display names (decisions 3 to 8)

- **The module:**
    - `packages/asm-editor/scripts/demangle/demangle.cpp`: `describe` as researched, with the `Apache-2.0 WITH LLVM-exception` header naming `cxa_demangle.cpp` and `ItaniumPartialDemangler`; `build.sh` exports `_describe` and adds `-I$(em-config EMSCRIPTEN_ROOT)/system/lib/libcxxabi/src -std=c++20`; `README.md`.
    - `E/lib/languages/demangle/module.js` and `module.d.ts` regenerated.
- **`E/lib/languages/demangle/demangledNames.ts`** (new, pure, given a `describe` function):
    - `splitLabel`; the three forms and the data form;
    - the shortening table;
    - special names: their words, the Pseudocode's identifier forms, `_ZGTt`;
    - the scope path split at top-level `::`;
    - `listForms`, the collision steps over a Listing's functions;
    - the 100-character comment rule.
- **`E/lib/languages/demangle/loadDemangler.ts`** (new): one lazy loader per JavaScript context, shared by the worker and the main thread, and `needsDemangler(analysis)`.
- **`compiledMemoryNames.ts`** uses them; its output for data labels does not change.
- **Tests:** `demangledNames.test.ts` with the real module in Node:
    - every row of [What the names look like](#what-the-names-look-like);
    - the collision steps on the Core's `cpp` fixture;
    - the comment's length rule;
    - names it cannot read come back undefined;
    - `compiledMemoryNames`' tests, unchanged.

### P2: the Listing (decisions 1, 2, 9)

- **Types:** `E/lib/listing/listing.ts`: `ListingLabel.demangled?: DemangledName` (`short`, `signature`, `text`, `list`, `variant?`, `scope?`, `base?`, `pseudocode?`), and `ListingFunction.list?` for the list form.
- **The worker:**
    - `listingService.ts`: analyse, check `needsDemangler`, load it, generate;
    - `decoder.ts`: unchanged, or exports the analysis type the input now takes.
- **`generateListing.ts`:**
    - takes an optional `analysis` and `demangler` (`ListingInput`) and computes the records once all names are claimed (after :494);
    - attaches them in `label()`;
    - comments in `instructionLine` (beside `stringComment`), on label lines and on `dq` lines (`pointerAt`).
- **`listingText.ts`:** a name-comment helper with `"` escaped; `patchFormat.describeLine` uses it.
- **Tests:**
    - `generateListing.test.ts`: every C fixture byte-identical with and without a demangler, a snapshot of `cpp` with demangling, its vtable and `main` lines;
    - `listingService.test.ts`: no load for a C binary;
    - `listingPatcher.test.ts`: a patched call keeps its comment;
    - `listing.measure.ts`: libstdc++ with demangling.

### P3: the Listing's surroundings (decisions 10, 11)

- **Hover:** `listingNavigation.ts` `labelHoverMarkdown`.
- **Index:** `ListingIndex` gains a lookup by short name and signature, unique ones only, for the memory address box (`X86Emulator._resolveMemoryLabel`).
- **Go to Symbol:** `listingProviders.ts` `documentSymbols` (`name` the list form, `selectionRange` still the raw name's length).
- **Symbols panel:** `listingSymbols.ts` (`FunctionSymbol.display`, the filter on raw, short and signature) and `SymbolsPanel.svelte` (row and tooltip).
- **Tests:** `listingProviders.test.ts`, `listingSymbols.test.ts`, the Symbols panel's dom test, `memoryRegions.test.ts`.

### P4: the Pseudocode (decisions 13 to 16)

After P0 and P2.

- **`programImage.ts`:**
    - functions as `{ address, name: base, namespace: scope, symbol: stubFunctionName(raw) }`;
    - data by their Pseudocode form;
    - pointers with their `symbol`;
    - C names as today.
- **Hover:** `pseudocodeProviders.ts` and `pseudocodeMap.listingNameOfTarget` give the demangled forms; `pseudocodeHovers.ts` checks that no namespace word reads as one of Ghidra's words.
- **Header and notices:** `pseudocodeDocuments.svelte.ts`, `PseudocodeNotice.svelte`, `PseudocodeStatus.svelte`.
- **Tests:**
    - `programImage.test.ts`, on the `cpp` fixture:
        - no `func_0x`;
        - every printed name is a Listing label's raw, short or Pseudocode form at its target;
        - `__throw_*` calls stay noreturn.
    - `pseudocode.dom.test.ts`: hover and double-click on `std::…::operator+=`.

### P5: debug tools and the memory view (decisions 11, 12)

After P1. `X86Emulator.svelte.ts` is shared with other work; coordinate before editing it.

- **`X86Emulator.svelte.ts`:**
    - `_prepareBuild` loads the demangler for a C++ Executable;
    - `_getMemoryLayout` sets `displayName`;
    - `_getCallStack` names a frame by its function's list form, or demangles the Core's name;
    - `_libraryStretchName` and `libraryFunctionName` likewise.
- **Call stack:** `CallStack.svelte` gets a `title`, and `StackFrame` an optional `detail`.
- **Tests:** `X86Executable.test.ts` (the `cpp` fixture: frame names, memory label names, a History stretch name) and `MemoryControls.dom.test.ts`.

### P6: documentation, review and the browser check

- **The x86 Executables Chapter** (`E/lib/documentation/x86/executables.md`):
    - Names in the Listing (`#names`): mangled names, the comments, the hover;
    - The Symbols panel (`#symbols`): the filter;
    - Reading the Pseudocode (`#pseudocode`): qualified names, minimal namespaces, `game::Boss::vtable`;
    - a golden search query in `E/lib/search/golden/x86.json`, such as "C++ mangled names".
- **Glossary:** [CONTEXT.md](../../CONTEXT.md)'s new term once the owner accepts it, and a sentence in the Listing and Symbols panel entries.
- **Records:**
    - this record's implementation notes;
    - [reverse-engineering-ux.md](./reverse-engineering-ux.md)'s deferred list points here;
    - [memory-regions.md](./memory-regions.md)'s decision 9 notes the shared module.
- **Checks:** a code review of the whole change, and a browser check with the study's harness on a C++ binary, such as the FactCheck-like program built as above.

## Phase 2: demangled names in the Listing's text

**Scope.** Operands and labels print the short name instead of the mangled one (`call std::string::operator+=`), the mangled name moving to the hover and perhaps the comment. Today every lookup reads names back from the text by character class (`NAME_CHARACTER = /[\w$#@~.?]/`), and a demangled name has spaces, commas, brackets and parentheses, so each lookup must read a table of name spans the generator writes instead (line, start, end, label: a few typed arrays, small next to the text, since few lines name more than one label):

- the token under the cursor for the hover, Go to Definition and double-click (`listingTokenAt`, `listingNameAt`, `followNames.ts`);
- References (`ListingIndex.references`, which searches the text for each name);
- label definitions (`ListingIndex.label`) and the `name+0x10` and `FUN_x.LAB_3` forms (`addressNames.ts`);
- the Patch prompt (`instructionText`, `patchResolver.ts`'s own `NAME_CHARACTER` :28, `patchFormat.labelledText`), which shows a line's instruction for editing and resolves the names typed;
- the memory address box;
- Go to Symbol's `selectionRange`;
- the x86 Monarch grammar's highlighting of operands;
- Ctrl+F, which would find demangled names and no longer mangled ones;
- the snapshot tests.

**Risks.**

- **Overloads in the text.** Two different labels may read alike in operands (`call sum` twice). Spans keep the lookups exact, but the reader sees no difference unless operands use signatures, which makes lines long (`call std::vector<std::string>::push_back(std::string const&)`).
- **NASM-flavoured text.** The Listing stops being near-NASM. The deferred export to an assembly File would need the mangled names back, and the Patch prompt either keeps mangled names (then a patched line shows a different spelling until regenerated) or learns to read demangled ones, commas included (`std::map<std::string, int>`).
- **Line length.** Long template names in operands are 100 to 300 characters.
- **Size:** about the size of phase 1's P2 and P3 together, editor-only; no package change.

**Open questions.**

- Short name or signature in operands?
- A switch for mangled names (IDA and Ghidra both have one), and is it a **Preference**?
- What the Patch prompt shows and accepts.
- Whether the mangled name stays findable by Ctrl+F (in the comment, reversing phase 1's).
- Whether phase 1's comments stay once the operands are demangled.

## Phase 3: C++ types

**Scope.** Two parts, both through the package's C declarations, which bind by name and, after phase 1, by the mangled name too ([the experiment above](#phase-3-seen-from-todays-package) shows the route works today):

- **Prototypes from demangled signatures.** The mangled name encodes each parameter's type: builtins, pointers, references (which become pointers), class types (which become named structures), `const`. It also tells a member function (nested name) from a free one, and `const`/ref-qualified members as non-static. The editor would generate declarations by mangled name, `this` first for members.
- **A libstdc++ type library**, curated, like `glibc.h` but for C++, in the package (`prototypes/libstdcxx.h`) or the editor:
    - layouts: `std::string` (new ABI: pointer, length, a 16-byte union of buffer and capacity, 32 bytes), `std::vector<T>` (three pointers), `std::unique_ptr<T>` (one pointer), `std::map`'s `_Rb_tree` header, `std::ostream` as opaque;
    - prototypes with return types for the common members (`operator[]` returning `char *`, `size()` returning `size_t`, `c_str()`), so FactCheck's `main` reads `sStack_128` and `*pcVar3 < 'B'` without casts.

**What does not come from the name.**

- The Itanium ABI encodes no return type for a function that is not a template, so a synthesized prototype's return is unknown unless the library supplies it.
- A static member function mangles like a non-static one with the same parameters, so `this` would be wrong for static members; the library's curated entries and `const` qualifiers are the only safe sources.
- Template parameters inside types (`std::vector<std::string>`) need one structure per instantiation, named for C (`vector_string`), since the package's C parser reads no `::` or `<>` in a type name. Printing `std::string` as a type would need a type API in the package that takes names as given.
- Ghidra itself applies demangled names and parameter lists through its demangler analyzer, with placeholder structures for classes it has no layout for, unless DWARF or a data type archive supplies one; a stripped CTF binary gets neither.

**Risks.**

- A wrong prototype makes the Pseudocode worse than `undefined8`: wrong arguments, `this` where there is none, a flow cut at a wrong noreturn. So only curated or certain types (layouts of the new-ABI string, references, `const` members).
- libstdc++'s layout differs between ABIs, and between libc++ and MSVC's library if other platforms come.
- Propagation through `this` into member accesses (`this->_M_string_length`) depends on Ghidra typing the first parameter, which works for declared prototypes but not for functions the editor knows nothing about.

**Size:** large. A package API for types (or the C parser's limits worked around), the synthesizer, the curated library and its tests, and decisions on naming types.

**Open questions.**

- Where the type library lives (package or editor).
- How far to synthesize beyond the curated list.
- Whether to type a function's own parameters from its demangled signature (its locals then follow) or only its callers' arguments.
- How the Pseudocode names `std::string` (`string`, `basic_string`, or `std::string` through a package change).

## Open questions

For phase 1, to settle before implementing:

1. **Variant words.** `[deleting]` in comments and hovers for `D0`, with the others only in hovers and list collisions (decision 8): or none in comments, as `c++filt` prints?
2. **Function template arguments in short names.** Kept (decision 5): `std::operator<<<char, std::char_traits<char>, std::allocator<char>>`, `std::make_unique<game::Boss, char const (&) [5]>`. Dropping them reads like source (`std::operator<<`, `std::make_unique`) but loses `game::Boss`, and turns `clampTo<int>` and `clampTo<long>` into overloads.
3. **libstdc++'s two string ABIs** read alike after shortening, 2,148 functions told apart only by address and the hover. Acceptable, or keep `__cxx11` visible where both ABIs are in one Listing?
4. **Comments on label lines** (decision 9, an addition to the proposal), and the 100-character limit.
5. **Two spellings for special data** (decision 16): `vtable for game::Boss` in the Listing and `game::Boss::vtable` in the Pseudocode, or one of them everywhere?
6. **The decompiler's version:** 1.1.0, or folded into the unpublished 1.0.0; and whether to raise Ghidra's line width (`maxlinewidth`) while there, since long qualified names break lines after `std::`.
7. **The main thread loads the module too** (decision 12) for memory labels and library frames, about 100 KB more per C++ Debug session. The alternative, taking the memory labels from the Listing, waits on a Listing a Build does not wait for.

Not demangling, found on the way: the deployed site ships no third-party notices, Ghidra's `NOTICE` among them ([Licensing](#licensing)).

## Proposed glossary term

For [CONTEXT.md](../../CONTEXT.md), once accepted:

> **Demangled name**
>
> The readable name the editor shows for a C++ symbol of an **Executable** or a library it loads, worked out from the symbol's mangled name, which the **Listing**'s text keeps (`_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_` is `std::string::operator+=`). Lists, the **Pseudocode**, the Call stack and the History show its short form, without parameters and with standard templates shortened (`std::string` for `std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>>`); the Listing's comments show its signature, `std::string::operator+=(std::string const&)`; a hover gives both, with the demangler's exact text and the mangled name. Distinct from an **Invented name**, which the Listing makes up where nothing names an address, and from the source names a C or C++ Build's memory labels show.
>
> _Avoid_: display name (the code's field for any name shown in place of another), pretty name, unmangled name, symbol name (the mangled one)
