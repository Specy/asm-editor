# Source compilation review fixes: implementation plan

Written 2026-10-08 for PR #87 (`feat/source-compilation`, reviewed at `4f8a5c6`). An external review raised six issues
plus one terminal mismatch. Every claim was checked against the tree and holds; the evidence is listed per item so
nobody has to verify it again.

## Ground rules

- **Breaking changes are allowed.** The owner said so on 2026-10-08: the recent work has barely been used. `runtime/`
  is not on `main` at all, and neither is x86 archive linking (`start.asm` and ADR 0033 exist only on this branch). So
  **Runtime ABI v1 is redefined in place**: don't add a v2, regenerate `runtime/abi/v1.json` **once**, after every
  runtime change below has landed, and treat it as frozen from then on.
- The owner edits all five Cores, so make changes in a Core rather than working around them in the editor.
  Releases follow the tag-triggered CD recipe. `git push` to the public repos is blocked in auto mode, so commit,
  tag locally, and hand the owner the push commands.
- Don't commit unless asked. The owner strips `Co-Authored-By` trailers from commits.
- The working tree already has uncommitted documentation edits under `src/lib/documentation/**`. Merge into them
  rather than overwriting them.
- Record decisions taken while implementing in the "Implementation notes" section at the end of this file.

## Owner decisions still open

Each one has a recommendation. Implement the recommendation unless the owner answers differently.

1. **x86 link policy (W2).** Recommended: keep ADR 0033's archive, but fix the order, reject duplicate definitions
   and add a "not linked" Hint. Alternative: explicit Build membership per File, which needs a project-format change
   and UI.
2. **What `clock()` measures (W3).** Recommended: CPU time derived from the executed-instruction count at a fixed
   nominal rate. This is deterministic, rewinds with Undo, and naturally excludes sleeps and input waits.
   Alternative: host running time minus waits, which is not reproducible in Testcases. The nominal rate is the
   owner's call; suggested 100 MHz (10 ns per instruction).
3. **Fixed calendar epoch for Testcases (W3).** Suggested `2000-01-01T00:00:00Z` (946684800000 ms).

---

## W1. Allocation alignment and `max_align_t` (P1)

**Evidence.**
- [malloc_impl.h:13](../../runtime/src/malloc/malloc_impl.h) sets `ALIGN` to `2 * sizeof(size_t)`, which is 8 on
  RV32/MIPS and 16 on RV64.
- [stddef.h:11](../../runtime/include/stddef.h) defines `max_align_t` without `long double`, so its alignment is 8
  everywhere, and `abi/v1.json` freezes `_Alignof(max_align_t)` at 8.
- The RISC-V psABI makes `long double` 16 bytes with 16-byte alignment on RV32 and RV64 alike. GCC therefore
  assumes 16-byte alignment from `malloc` and from plain `operator new` (`__STDCPP_DEFAULT_NEW_ALIGNMENT__` is 16),
  so an `alignas(16)` object created with `new` lands at an address ≡ 8 (mod 16).
- MIPS o32 is correct at 8, because `long double` is `double` there.

**Changes.**
1. Define `max_align_t` the way GCC's own `stddef.h` does: `long long` plus `long double`, each `__aligned__` to
   its own `__alignof__`, plus `__float128` under `__i386__`. Expected alignment: RV32 16, RV64 16, MIPS 8,
   x86-64 16, i386 16.
2. Set `ALIGN` to `_Alignof(max_align_t)`; don't use `__BIGGEST_ALIGNMENT__`, which grows to 32/64 with
   `-mavx`. `HDR` stays equal to `ALIGN`, so on RV32 the header becomes 16 bytes with 8 of them padding. Check
   that `struct chunk` still fits in `MIN_CHUNK` and that `grow()` and `aligned_alloc` still round correctly.
3. Add `LAYOUT` entries for `_Alignof(max_align_t)` and `sizeof(max_align_t)` on every target (they're already
   there; their values change).

**Tests.** Add a corpus program that checks `malloc`, `calloc`, `realloc`, `new T` and `new T[n]` results
`% alignof(max_align_t) == 0`, plus an `alignas(16)` struct created with plain `new`. The program must print only
target-independent text so it matches glibc's output.

## W2. x86 link order (P1)

**Evidence.**
- ADR 0033 makes every non-Entry File an archive member, and the editor's library units (`start.asm`,
  `support.asm`, via `X86Project.library` in
  [x86StartUnit.ts:60](../../src/lib/languages/X86/x86StartUnit.ts)) come **first** in that archive.
- As a result, a user's strong `memcpy` in a secondary File silently loses to `support.asm`'s weak one unless
  something else pulls that File in. Real `ld` lets the program's objects beat libc.
- Two Files defining the same symbol no longer produce an error: the first archive member wins.
- `main` still links every x86 File (multi-file shipped in PRs #81/#85), but this branch hasn't shipped, so
  nothing needs migrating.

**Decision (recommended, open decision 1).** Keep the archive, which keeps ADR 0033's goal that the Entry picks
which program runs, and fix the three hazards:
1. **Link order.** Link the Entry's unit as an object, and `start.asm` as an object whenever the Entry is generated
   assembly. `_start` is then already defined, so `main.asm` is never pulled in for it. After those come the user
   archive (all other Files), then the support archive (`support.asm`, and later the x86 Runtime library) **last**,
   so user definitions win as they would against libc.
2. **Duplicate definitions.** Every File is assembled anyway. Collect each user unit's strong global definitions
   (ignore weak ones) and fail the Build with `multiple definition of 'x'` on both Files when two units define the
   same name, whether or not either would be extracted. This restores the error that linking every File used to
   give.
3. **"Not linked" Hint.** Emit a Problems Hint for each File the linker didn't extract ("nothing refers to a
   symbol this File defines, so it is not part of the program"). This makes the classic archive pitfall, a File
   whose only effect is an `.init_array` entry or other side-effect code, visible instead of silent.

**Where.** The linking lives in the Core package (`@specy/x86`, ADR 0033 notes the incompatible change), plus the
editor's `X86Project` shape in `x86StartUnit.ts` and `X86Emulator`. Expect separate `startUnits` (objects) and
`library` (trailing archive) fields. Bundle this with the next x86 major (environment-library milestone M7 also
planned an x86 major); don't release twice.

**Docs.** Write a new ADR that amends 0033 (order, duplicates, Hint) and add a superseded-in-part note to 0033.
Update `src/lib/documentation/x86/using-c.md`.

**Tests.** Core tests for each case:
- a user `memcpy` beats the support one;
- duplicate strong definitions are an error, while weak plus strong is not;
- a File that nothing references produces the Hint;
- with the Entry as compiled C, a default `main.asm` defining `_start` stays out;
- C and NASM in different Files still call each other.

## W3. Calendar, elapsed and CPU time (P1)

**Evidence.**
- [ProgramClock.now()](../../src/lib/languages/peripherals/ProgramClock.ts) returns milliseconds since the run
  started.
- [marsHandlers.ts:223](../../src/lib/languages/mars/marsHandlers.ts) feeds it to service 30 and to the RISC-V
  `time` CSR, and [time.c](../../runtime/src/time/time.c) reads it as milliseconds since 1970, so `time()`,
  `localtime()` and `ctime()` all report January 1970. MARS and RARS define service 30 as Unix-epoch time, and
  ADR 0035 says services match their Reference environment.
- x86: Blink passes the guest clock id to `environment.now(clock)` (`blink-runtime.ts:682`), but
  `X86Emulator.svelte.ts:170` ignores the id, so `CLOCK_REALTIME` is elapsed time too.
- [clock.c](../../runtime/src/time/clock.c) returns wall time since the first call, which includes sleeps.
- M68K task 8 (`nowHundredths`, `M68KEmulator.svelte.ts:1089`) and Z80 `timeHundredths` (`Z80Emulator.svelte.ts:257`)
  also use elapsed time. EASy68K's task 8 is hundredths of a second **since midnight**; confirm it in `CODE9.CPP`
  (grep with `-a`).

**Design.** Write a new ADR, "Programs see three clocks", and update ADR 0010 and ADR 0037 cross-references.

| Clock | Interactive | Testcase (virtual) | Used by |
| --- | --- | --- | --- |
| Calendar (realtime) | host `Date.now()` | fixed epoch (open decision 3) + virtual elapsed | MARS/RARS service 30, `time()`, x86 `CLOCK_REALTIME*`/`CLOCK_TAI`, EASy68K task 8 (since local midnight), Z80 if its Reference says so |
| Elapsed (monotonic) | host time since start, as now | virtual elapsed, as now | animation, waits (service 32, `nanosleep`), x86 `CLOCK_MONOTONIC*`/`BOOTTIME` |
| CPU | executed instructions × nominal period (open decision 2) | same | C `clock()`, x86 `CLOCK_PROCESS_CPUTIME_ID`/`CLOCK_THREAD_CPUTIME_ID` |

**Changes.**
1. `ProgramClock`: add `calendarNow()` (ms since epoch) beside `now()`. Keep `now()` as the elapsed clock.
2. `marsHandlers.ts`: service 30 uses `calendarNow()`. Check in the RARS source (`emulators/risc-v/rars`) what the
   `time`/`timeh` CSRs report in the Reference. If it differs from service 30, split the shared `time` handler into
   two Core callbacks; that's a MARS/RARS Core change.
3. `X86Emulator`: map clock ids (Linux: 0 REALTIME, 1 MONOTONIC, 2 PROCESS_CPUTIME, 3 THREAD_CPUTIME,
   4 MONOTONIC_RAW, 5 REALTIME_COARSE, 6 MONOTONIC_COARSE, 7 BOOTTIME, 11 TAI) to the three clocks. CPU clocks
   read the Core's executed-instruction count. Leave Blink's waits on the monotonic clock.
4. M68K task 8 → hundredths since local midnight of `calendarNow()`. In a Testcase use UTC, so results are
   reproducible. Audit Z80 `timeHundredths` against its Port map and document the result.
5. Runtime `clock()`: read CPU time from a new platform call `__aed_cpu_ticks()`.
   - RISC-V: `rdinstret`/`rdinstreth` (RARS implements `instret`).
   - MIPS: add a service, because MARS has no counter. It's a Core change; reserve a number in the runtime's
     private range or follow whatever precedent `aed_sys_arch.h` sets.
   - x86 (future runtime): `clock_gettime(CLOCK_PROCESS_CPUTIME_ID)`.
   - Convert to `CLOCKS_PER_SEC` with the nominal period. Keep the `(clock_t)-1` overflow return.
6. Fix the comments in `time.c`/`clock.c` and the docs: `{mips,riscv,x86}/syscalls.md`, `runtime-library.md`,
   `m68k/traps.md`, `z80/io.md`, `runtime/PLATFORM.md`, `runtime/FUNCTIONS.md`.

**Tests.**
- ProgramClock unit tests for the three clocks in both modes.
- In a Testcase, `time()` returns the fixed epoch at start and moves with service 32.
- `clock()` doesn't advance across a sleep and does advance across a loop; Undo rewinds it.
- Corpus programs print only relations such as `time(0) > 1700000000` and `clock() >= 0`, so they still match glibc.

## W4. A Runtime ABI check that protects compiled programs (P1)

**Evidence.**
- `checkAbi` in [build.mjs](../../scripts/runtime/build.mjs) checks only that baseline names weren't removed and
  that `layout.c` values are unchanged.
- `exported` is the documented function names plus `stdin/stdout/stderr/errno/bcmp`: 175 names, of which only
  `_Exit` and `__assert_fail` start with `_`.
- `operator new`/`delete` (`_Znwj`…), `__cxa_atexit`, `__dso_handle`, `__cxa_pure_virtual` and libgcc helpers
  such as `__divdi3` are all provided but unprotected. Signatures aren't checked at all.

**Changes** (do these last among the runtime work, then regenerate `v1.json` once).
1. **Per-target required symbols.** `exported` becomes `{ target: [names] }`. Each target's list is the union of:
   - the documented functions and objects;
   - every undefined global referenced by the corpus's compiled assembly for that target, across GCC and Clang,
     C and C++, `-O0` and `-O2` (`runtime/.cache` holds it). This picks up mangled C++ operators, `__cxa_*`,
     `__dso_handle`, libgcc helpers and implicit `memcpy`/`memset`;
   - an explicit list of compiler-support symbols the compilers may emit even if no corpus program does yet (the
     `__{,u}{div,mod}di3` family, the shift helpers, `__mulsc3`/`__muldc3`, …).

   Internal names (`__aed_*`, musl-internal `__stdio_*`, `__fmodeflags`, …) stay out.
2. **Signatures.** For each documented function, record its type in a target-specific, compiler-checked form.
   Compile one C++ unit per target through Compiler Explorer that includes every public header and instantiates
   `template<class T> void __aed_sig(T *) {}` with `&function`. The mangled instantiation name encodes the full
   prototype (for example `_Z8__aed_sigIFiPKczEEvPT_` for `printf`). Store `name → mangled type` per target and
   report changes. Variadic and `restrict` details come through; C-only declarations that C++ can't see need a
   note in the implementation notes.
3. **Layouts.** Keep `layout.c` and make sure it covers every public struct and typedef: `max_align_t`,
   `struct tm`, `div_t`/`ldiv_t`/`lldiv_t`, `jmp_buf` if present, `time_t`/`clock_t` sizes, `FILE` stays opaque,
   `CLOCKS_PER_SEC`, `EOF`, `BUFSIZ`, the `errno` values, and the `_IO*` constants.
4. **Binary-compatibility test.** Commit fixtures under `runtime/abi/v1-fixtures/<target>/`: the generated
   assembly and expected output of about 10 corpus programs covering stdio, scanf, malloc/free, C++
   new/delete/atexit/virtuals, 64-bit division, time and exit codes. `test-cores.mjs` (or a new
   `test-abi.mjs`) links those **frozen** `.s` files against the **current** library on each Core and compares the
   output. That's the review's "assembly compiled against a previous runtime still links" test.
5. Run the check in CI wherever the runtime build already runs.

## W5. Standard C operations that succeed but behave differently (P2)

### W5a. `fopen` update modes

**Evidence.** [__fmodeflags.c](../../runtime/src/stdio/__fmodeflags.c) turns `r+` into read-only, `w+` into
write-only and `a+` into append-only, because the Cores' open service knows only 0 (read), 1 (write, create or
truncate) and 9 (append).

**Changes.**
1. Extend MARS/RARS open with read-write flags, documented as an extension beyond MARS 4.5 (whose hand-written
   programs keep the 0/1/9 behaviour):
   - 2 = read-write on an existing file (`r+`);
   - 3 = read-write, create and truncate (`w+`);
   - 10 = read-write, create, writes at the end (`a+`).

   Check how the open flags travel from the Core to the editor `FileSystem` (environment-library M4b) and support
   reading and writing on one descriptor with a shared position. Seek already exists. x86 goes through Blink's
   real `open()` and needs nothing new.
2. The runtime maps `r+`/`w+`/`a+` to those flags and restores musl's update-mode rules (an `fseek`/`fflush`
   between switching from reading to writing).
3. Until the Core support lands, `fopen` with `+` must **fail** with `EINVAL`. It must never succeed with half
   the behaviour.

### W5b. `setvbuf`

**Evidence.** [setvbuf.c](../../runtime/src/stdio/setvbuf.c) reports success and changes nothing.

**Change (recommended): honour it.** Default streams stay unbuffered and write through. C allows that, and it was
the source-runtime decision for teaching. Bring back musl's buffered write path for streams whose program asked for
`_IOLBF`/`_IOFBF`, using the caller's `buf` or a `malloc`ed one. Make sure `fflush`, `exit` and returning from
`main` flush, and that reading `stdin` flushes a line-buffered `stdout` the way musl does. If that turns out too
large, the fallback is: `_IONBF` succeeds, and the other two modes return nonzero, as C allows when a request
can't be honoured. Either way, record the policy in `FUNCTIONS.md`.

### W5c. Heap exhaustion

**Evidence.**
- `malloc` handles a failed `__aed_sbrk` correctly (`ENOMEM`, returns NULL; see
  [malloc.c](../../runtime/src/malloc/malloc.c)).
- But RARS's `SyscallSbrk` (and MARS's) throws `ExitingException` when the heap is exhausted, so the program dies
  before `malloc` sees a failure.
- Nothrow `new` already forwards `malloc`'s NULL.

**Change.** Hand-written programs keep MARS's terminating service 9. Add a runtime-only, non-terminating sbrk
service in MARS and RARS (same private range as W3's CPU counter) that returns -1 on failure, and switch
`__aed_sbrk` in `arch/{mips,riscv32,riscv64}/aed_sys_arch.h` to it. Plain `operator new` keeps printing and
exiting with 134: no exceptions means `std::terminate` semantics.

**Tests.** Add Core tests for the new open flags and the new sbrk service. Add simulator-specific corpus programs
(they can't match glibc, so give them hand-written expected output): `r+`/`w+`/`a+` round trips, `setvbuf` with
`_IOFBF` delaying output until `fflush`, and `malloc` until NULL then `free` and continue, plus
`new (std::nothrow)` returning `nullptr`.

## W6. A valid hosted `argv` (P2)

**Evidence.** All crt0s call `main(0, NULL)`: [riscv32/crt0.s:20](../../runtime/arch/riscv32/crt0.s),
riscv64, mips, host-i386, host-x86_64, and [X86/start.asm:29](../../src/lib/languages/X86/start.asm).

**Changes.**
- MIPS and RISC-V: `argc = 0` and `argv` pointing at a read-only `{ NULL }`. Also pass `envp` as the same array
  if `environ`/`getenv` exist.
- x86: Blink's loader builds a real Linux initial stack, so take `argc`, `argv` and `envp` from `[rsp]` before
  aligning it, as a real crt0 does. Check what Blink puts in `argv[0]` and document it.
- Host crt0s: the same as the target they mirror.

This leaves room for program arguments later. MARS and RARS have a "program arguments" setting that could fill
the array.

**Tests.** A corpus program that checks `argv != NULL && argv[argc] == NULL`; it matches glibc as long as it
prints only that check.

## W7. Ctrl+D with typed text pending (P3)

**Evidence.** In [Terminal.svelte.ts:627](../../src/lib/languages/peripherals/Terminal.svelte.ts), `readLine`
ignores EOT when the line isn't empty. A canonical Linux tty instead delivers the pending bytes at once, without a
newline, and EOT on an empty line delivers zero bytes (end of input).

**Change.** For `kind === 'standard-input'` only, EOT with pending text returns those bytes **without** a line
feed and ends the read. Trace how the returned string reaches the Cores' stdin buffer. Today a line feed is
probably appended somewhere, so the return type likely becomes `{ text, newline: boolean }`. A following EOT on
the now-empty line is end of input. The End of input button does the same thing. Line-oriented MARS/EASy68K
services (`kind === 'line'`) keep ignoring EOT. Update ADR 0036's line-discipline text and the Terminal docs.

**Tests.** Terminal unit tests: `abc` + EOT → `abc` without a newline; then EOT → null; and a `kind: 'line'`
read keeps ignoring EOT.

## A short compatibility-policy ADR

The review's closing point is worth recording in one ADR: the Runtime ABI protects compiled calls and layouts
(W4), and a library operation either has its standard meaning or **fails** (W5). Deliberate simulator choices,
such as unbuffered default streams, `argc == 0`, instruction-based CPU time and the Testcase epoch, are listed
in one place (`runtime/FUNCTIONS.md` § Deviations).

## Order of work

1. **Runtime only, no Core changes:** W1, W6 (MIPS/RISC-V crt0s), W5a step 3 (fail `+` modes), and the
   implementation half of W5b.
2. **Editor only:** W3 steps 1, 3 and 4, W6 (x86 `start.asm`), W7.
3. **Cores:**
   - MARS/RARS: open flags (W5a), non-terminating sbrk (W5c), CPU counter on MIPS (W3), and the `time` CSR split
     if needed (W3).
   - x86: link order, duplicates and the Hint (W2).

   Fold these into whatever Core majors are already pending. Release them, then bump the editor.
4. **Runtime work that needs the Cores:** W5a steps 1-2, W5c, W3 step 5.
5. **W4**, then regenerate `abi/v1.json` and the fixtures once.
6. Docs and ADRs (W2 ADR, W3 ADR, compatibility-policy ADR, amendments to 0033, 0035 and 0036).

## Verification before handing back

- `node scripts/runtime/test-cores.mjs` and `--compiler clang`: the whole corpus, plus the new programs, plus the
  ABI fixtures.
- Each changed Core's own test suite; the editor's `vitest` and `svelte-check`.
- Browser checks:
  - a C program printing `ctime(&t)` shows today's date interactively and the fixed epoch in a Testcase;
  - `clock()` around a loop and around a `sleep`;
  - an x86 project whose secondary File defines `memcpy`, and one with duplicate definitions;
  - Ctrl+D after partial input in a `fgets`/`read` loop.

## Implementation notes

(Record decisions taken while implementing here.)

- Accepted the recommendations: archive link model, nominal 100 MHz CPU counter, and Testcase epoch 2000-01-01 UTC. CLOCK_TAI shares realtime; leap seconds remain unmodeled.
- RARS reference time/timeh and service 30 both report Unix epoch milliseconds, so the existing shared time callback remains appropriate. Z80 TIME_NOW is editor-defined elapsed time, as its port map specifies.
- Reserved runtime-only service 1100 for recoverable sbrk on both MARS/RARS; MIPS service 1101 reads retired instructions. Fixed integer overflow in both Core heap bounds checks, discovered by the new failure test.
- Requested output buffering is implemented; input/update-stream buffering requests return failure pending a complete input-buffer path. Defaults stay unbuffered. Native no-init tests skip the buffered-output case because raw exit deliberately does not flush.
- Signature probes encode public C function types per target. C restrict annotations and other declaration attributes are not function-type components in C++, so the probe does not promise to encode them. No public function is C-only today. FILE remains opaque.
- Corpus time plausibility uses >=946684800, because the plan's >1700000000 example contradicts its selected 2000 epoch. The native oracle still prints the same target-independent relation.
- No commits, tags, publication or version bumps are performed. Changed Core packages are used through local links for verification; release through tag-triggered CD after the owner commits and selects versions.
