# Public pages on Ghidra and the vector instructions

These are the pages and interface texts users see that [PR #95](https://github.com/Specy/asm-editor/pull/95) (`feat/pseudocode`) added or extended about the Ghidra decompiler and the x86 vector instructions (AVX). Each entry gives the file, where users see it, and what each part covers.

Things to know before editing:

- Several of these files have uncommitted edits in the working tree, from work not yet committed (`executables.md`, `vector-instructions.md`, `pseudocodeHovers.ts`). Edit the files as they are on disk; do not reset them to the last commit.
- Keep every `{#anchor}` after a heading. Other pages and the editor link to them: the Listing's and the Pseudocode's **?** buttons open `executables#listing` and `executables#pseudocode`, the Pseudocode hovers link to `executables#pseudocode`, and `using-c.md`, `syscalls.md`, `runtime-library.md` and the reverse-engineering blog post link to `#libraries`, `#arguments`, `#stepping` and `#patching`.
- Bold words such as **Debug**, **Decompile**, **Rename…** and **Search** are the names of buttons, menu items and panels in the editor. Change them only if the interface says something else.
- The interface texts in `.ts` and `.svelte` files are code. Change only the text inside the strings, and run the tests next to them (`pseudocodeHovers.test.ts`, `ReadOnlyNotice.svelte.dom.test.ts`) because some check the exact text.

## Vector instructions

### Documentation chapter: Vector instructions

- File: [packages/asm-editor/src/lib/documentation/x86/vector-instructions.md](packages/asm-editor/src/lib/documentation/x86/vector-instructions.md)
- Users see it at `/documentation/x86/vector-instructions`, under x86 in the Documentation, and in the editor's Documentation panel.
- A reference for the AVX instructions the x86 emulator runs.

| Section                                  | What it covers                                                                                                                                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Introduction                             | AVX, the `ymm` registers and the VEX encoding; what the chapter covers                                                                                                                                                                                          |
| What runs `#what-runs`                   | Table of the extensions that run (AVX, AVX2, FMA3, F16C, gathers, masked moves, BMI1/2, AES-NI, PCLMULQDQ, SSE4.1/4.2); SSE4.x and AES-NI run only in their `v` form; what does not run (AVX-512, VAES, 256-bit `vpclmulqdq`, MMX) and the Log message for each |
| CPUID `#cpuid`                           | The emulator's `cpuid` reports no AVX although it runs it, so programs that check take their SSE2 path                                                                                                                                                          |
| Registers `#registers`                   | `ymm0`–`ymm15`, `xmmN` as the low half of `ymmN`; the AVX tab of the Registers panel; lane numbering                                                                                                                                                            |
| Upper bits `#upper-bits`                 | What an `xmm` write does to bits 128–255: legacy SSE keeps them, VEX zeroes them, scalar VEX takes bits 32–127 from the first source; `vzeroupper` and `vzeroall`                                                                                               |
| Three operands `#three-operands`         | Destination plus two sources; where memory and immediates go; the two-operand exceptions; the `v` prefix                                                                                                                                                        |
| 128-bit lanes `#lanes`                   | Most 256-bit instructions work on each half separately; the list of those that never cross halves and the table of those that do; reducing a `ymm` register to one value                                                                                        |
| Memory operands `#memory`                | 32- and 16-byte operands, `yword` and `oword` in NASM, the silent 16-byte default of `vcvtpd2ps`                                                                                                                                                                |
| Alignment `#alignment`                   | Only aligned moves need aligned addresses (`SIGSEGV` otherwise); which legacy SSE forms the emulator checks; `align 32`; masked moves and gathers                                                                                                               |
| Instruction families `#families`         | Table of families with example mnemonics and notes                                                                                                                                                                                                              |
| FMA `#fma`                               | Single rounding, with an example where it differs; reading the `132`/`213`/`231` digits; the other FMA mnemonics                                                                                                                                                |
| Floating-point results `#floating-point` | Where the emulator follows `mxcsr` rounding and where it does not; NaN payloads; `vrcpps`/`vrsqrtps` precision compared to a processor                                                                                                                          |
| Where AVX code comes from `#sources`     | Assembly and imported Executables run AVX; the editor's own C/C++ Compile produces only SSE2, so AVX code goes in an assembly File; `vzeroupper` before returning                                                                                               |

### Course lecture: AVX and 256-bit vectors

- File: [packages/asm-editor/src/content/x86/think-in-assembly/avx-and-wider-vectors/index.md](packages/asm-editor/src/content/x86/think-in-assembly/avx-and-wider-vectors/index.md)
- Title and description shown in the course list: [meta.json](packages/asm-editor/src/content/x86/think-in-assembly/avx-and-wider-vectors/meta.json)
- Lecture 8 of the x86 course "Think in assembly", after the SSE lecture. It teaches AVX with runnable playgrounds that open the Registers panel on its AVX tab.

| Section                                  | What it covers                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Introduction                             | 256-bit registers, `xmmN` as the low half of `ymmN`, eight binary32 or four binary64 lanes; the diagram of a `ymm` register's halves; the `v` prefix |
| Eight lanes in one instruction           | `vmovups` and `vaddps` on eight lanes, with a playground                                                                                             |
| A separate destination                   | Three-operand forms, compared with SSE's overwriting of the first source                                                                             |
| What an XMM write does to the high half  | Legacy SSE keeps the high half, VEX zeroes it; `vzeroupper`                                                                                          |
| Two halves that rarely meet              | 128-bit lanes; which instructions rearrange within a half and which cross                                                                            |
| Broadcast and fused multiply-add         | `vbroadcastss`; FMA and its single rounding                                                                                                          |
| A dot product and its horizontal sum     | A loop with `vfmadd231ps`, then reducing eight partial sums                                                                                          |
| Alignment                                | Unaligned access is fine except for aligned moves; `align 32`                                                                                        |
| Checking for AVX                         | `cpuid` and `xgetbv`, and that this emulator reports no AVX                                                                                          |
| Your turn: scale and offset eight values | Exercise: `x * scale + offset` on eight values with a broadcast and one FMA, checked by a testcase                                                   |

## Ghidra

The PR has no page of its own about Ghidra. Everything users read about it is in the Executables chapter and in the hovers and notices of the Listing and the Pseudocode.

### Documentation chapter: Executables

- File: [packages/asm-editor/src/lib/documentation/x86/executables.md](packages/asm-editor/src/lib/documentation/x86/executables.md)
- Users see it at `/documentation/x86/executables`, under x86 in the Documentation, and in the editor's Documentation panel, where the **?** buttons of the Listing and the Pseudocode open it.
- The chapter existed before the PR (importing and running an ELF Executable). The PR added the sections below. Ghidra is named once, in Decompile; elsewhere the chapter says "decompiler" and "Pseudocode".

Sections about the decompiler:

| Section                                             | What it covers                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decompile `#decompile`                              | What Pseudocode is (Ghidra's C-like output, not source); one function at a time, following the Listing's cursor; lines linked to their instructions by colour; made from the current bytes, runs in the browser, never saved                                                                                                           |
| Reading the Pseudocode `#pseudocode`                | The first line; names shared with the Listing; library calls and strings; C++ names in namespaces; the decompiler's own names (`iVar1`, `pcVar2`, `param_1`, `acStack_98`, `undefined8`, `in_FS_OFFSET`, `unaff_RBX`, `extraout_RAX`) and their hovers; `WARNING:` comments; number hovers; Go to Definition; the notice and its **?** |
| When decompiling takes long `#decompile-time`       | Slow functions, the 30-second limit, **No Pseudocode** and **Try again**                                                                                                                                                                                                                                                               |
| Debugging in the Pseudocode `#pseudocode-debugging` | The current line during a Debug session; Breakpoints on a Pseudocode line go on the first instruction of each block; Toggle Breakpoint and Run to Cursor                                                                                                                                                                               |
| Searching the Pseudocode `#search-pseudocode`       | Decompiling every function in the background for the Search panel: the order, progress, Cancel and Resume, the 5-second limit, what makes a function decompile again                                                                                                                                                                   |

Sections about the reverse-engineering tools around it, which also act on the Pseudocode:

| Section                                     | What it covers                                                                                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C++ names `#cpp-names`                      | Mangling; the Listing keeps mangled names and gives C++ names in comments; shortened standard-library templates; hovers; short names in lists; names the demangler cannot read; LLVM's text compared with GNU's |
| The Symbols panel `#symbols`                | Listing an Executable's functions and strings; clicking a row; the filter; renaming and commenting from a row                                                                                                   |
| Renames `#renaming`                         | Renaming functions, data, strings, jump targets and the decompiler's variables; the keys and the prompt; which names are allowed; where a new name shows; Reset name; names that cannot change                  |
| Comments `#comments`                        | Commenting a line or a whole function in the Listing or the Pseudocode; how each view shows a comment; comments the decompiler cannot place                                                                     |
| Keeping renames and comments `#annotations` | Their own Undo and Redo; how they are saved; what happens to them after Byte edits, uploads and deletes; renaming during a Debug session                                                                        |
| Searching the Project `#search`             | The Search panel: opening it, Match case / whole word / regular expression, include and exclude patterns, Look in (Files, Listings, Pseudocode), results, keys, limits                                          |
| Back and forward `#navigation`              | The history of jumps in a Listing or Pseudocode, its keys and buttons                                                                                                                                           |
| Addresses in registers and memory `#memory` | Names in the memory view's address box; C++ names there; the menu on a register value or byte (Show in memory, Show in Listing, Follow pointer); collapsing the debug column                                    |

Sections the PR changed that are not about Ghidra, in case the rewrite covers the whole chapter: the introduction, The Hex editor `#hex-editor`, Editing bytes `#byte-edits`, Parts of the ELF file `#elf-parts`, Finding bytes `#finding`, The data inspector `#data-inspector`, The Listing `#listing`, Names in the Listing `#names`, Building and stepping `#stepping`, Breakpoints `#breakpoints`, The Build output `#build-output`, Log notes `#log-notes` and Safety `#safety`.

### Pseudocode hovers

- File: [packages/asm-editor/src/lib/pseudocode/pseudocodeHovers.ts](packages/asm-editor/src/lib/pseudocode/pseudocodeHovers.ts)
- Users see these when they hover over one of the decompiler's own words in the Pseudocode. Each hover is a sentence or two and ends with the link "Learn to read the Pseudocode" to `executables#pseudocode`.
- What they explain:
    - The types for bytes of no known type: `undefined`, `undefined1` to `undefined8`, and `code` (machine code; a `code *` is a function pointer).
    - Parameters `param_1`, `param_2`, …: the position, and the registers the first six arrive in.
    - Stack variables `local_10`, `acStack_98`, `uStack_48`: where in the stack frame they start.
    - Numbered variables `iVar1`, `pcVar2`: a value kept in a register, and what the letters before `Var` say about its type (from the `TYPE_LETTERS` table).
    - Unnamed globals such as `uRam00104010`: named after their address.
    - Stack addresses taken with `&`, such as `stack0xffffffe8`.
    - Inputs the prototype does not list: `in_FS_OFFSET` (the FS segment and the stack canary), `in_stack_…` and other `in_` values.
    - `unaff_` values (as the caller left them, callee-saved registers) and `unaff_retaddr`.
    - `extraout_` values (outputs a call left behind).
    - A variable the user renamed: its original name, where it is stored, and Reset name.

### The Listing's and the Pseudocode's notices

- Files: [packages/asm-editor/src/components/specific/workbench/PseudocodeNotice.svelte](packages/asm-editor/src/components/specific/workbench/PseudocodeNotice.svelte) and [packages/asm-editor/src/components/specific/workbench/ListingNotice.svelte](packages/asm-editor/src/components/specific/workbench/ListingNotice.svelte)
- Users see a small notice at the top right of the pane: "Pseudocode of `main` in crackme, read-only", or "read-only" for the Listing, with a **?** button labelled "What is the Pseudocode?" or "What is the Listing?" that opens the Executables chapter at that section.

### Other interface text about the decompiler

These are status messages rather than documentation, listed in case the rewrite covers them:

- [packages/asm-editor/src/components/specific/workbench/PseudocodeStatus.svelte](packages/asm-editor/src/components/specific/workbench/PseudocodeStatus.svelte): what the pane shows while there is no Pseudocode to show: "Decompiling…", "Loading the decompiler…", "Couldn't decompile …", and the Listing having no function to decompile.
- [packages/asm-editor/src/components/specific/workbench/SearchPanel.svelte](packages/asm-editor/src/components/specific/workbench/SearchPanel.svelte): the background decompiling progress ("Decompiling 120 of 290 functions of …", **Resume**, **Decompile now**).
