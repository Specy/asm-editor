# asmOS stage 2: implementation plan

Plan for [asmos-stage2.md](./asmos-stage2.md) (decisions 1 to 12), [ADR 0074](../adr/0074-mips-and-risc-v-timers-count-what-their-references-count.md) and [ADR 0075](../adr/0075-mips-and-risc-v-get-a-midi-port-and-a-sampled-audio-output.md). Written 2026-11-04 and revised the same day after an independent review against the code; implemented, uncommitted, on feat/asmos-stage2 (see the [Implementation record](#implementation-record)).

**Priority** (the owner, 2026-11-04): asm-editor must be an intuitive, good place to write code; asmOS is an example. Every milestone is judged first by what a learner or developer using the editor gets. asmOS adapts to that, never the other way round.

## Repositories and where work happens

- **The editor** (`Specy/asm-editor`): a feature branch from `main` once PR #108 has merged, worked in `.cache/wt/<name>` worktrees.
- **The Cores:** MARS (`packages/mips`, `main`) and RARS (`packages/risc-v`, `master`), on one branch per Core, `feat/stage2`, so the tracks below meet in one place. x86's Core (`packages/x86`, `main`) changes only in M4.
- **asmOS:** `packages/examples/shared/asmos` (Specy/asm-examples), built by its `build.mjs`.
- **Compiler Explorer:** used once, at M9, through the editor's `scripts/examples/recompile.task.ts`. Iteration uses the local Clang 21.1.0 in `.cache/toolchains/llvm-21.1.0` through asmOS's `tools/harness/MarsHarness.test.ts`. One exception: M0 estimates DOOM's answer sizes locally.

## Milestones

### M0. Baselines (half a day)

**Speed baselines.** Record, on MIPS and RISC-V, with Undo on and off, on the JavaScript and WebAssembly builds, using the editor's measurement harness (`src/lib/languages/measurements/`) and asmOS's harness:

- **raw speed:** a compute loop's instructions per ms;
- **drawing:** full-frame and window-copy frames per second at 640 × 480;
- **asmOS:** boot time, one window-drag step, an Assembly Editor key, time to open Notepad.

They go into `docs/research/asmos-stage2-baselines.md`.

**Size estimates.** Estimate the Compiler Explorer answer sizes of asmOS's units and of DOOM's four parts for RISC-V and MIPS with the local Clang. MIPS assembly is about 2.2 times x86's, and `apps.c` already passed the 16 MiB cap at -O2. A unit that would exceed the cap gets split now, not at M9.

### M1. Native dirty tracking (decision 2)

**Cores (MARS and RARS, `feat/stage2`):**

- **The map:** Memory keeps a bitmap of 1 KB blocks for one tracked range. It is marked inside the two primitives every store funnels through, `set()` and `storeRawWord()`, with both blocks marked when a store straddles a boundary. These are the paths that funnel through them:
    - every store instruction;
    - syscalls that write memory;
    - Pokes;
    - `setMemoryBytes`;
    - Undo's `applyRestore`;
    - `setDoubleWord`.

    Confirm that list by reading every caller, rather than marking each path.

- **The API:**
    - `trackWrites(start, end)`, and `trackWrites(0, 0)` to stop;
    - `takeWrittenBlocks()`, returning the dirty block indices as an `Int32Array` and clearing the map;
    - `readMemoryWords(address, count)`, returning an `Int32Array`.

    `int[]` exports already arrive as typed arrays on both builds. Measure the WebAssembly crossing cost of a large read, since it may copy element by element.

- **The map is reset** when a program is loaded and when tracking is re-armed.

**Editor (`MarsDevices.ts`):**

- **Flushing:** the grid's per-store observer goes. `setDisplay` and `attach` arm `trackWrites`, and `flush` calls `takeWrittenBlocks` then `readMemoryWords`.
- **Shared Memory:** both calls are guarded by the existing ownership check (`memoryOwners`, `ownsMemory`). Every Core instance shares one Memory, so a stale emulator must neither take another's blocks nor move its range.
- **Undo** redraws only the blocks the undo wrote.

**Tests:**

- Core tests of a write through each funnel, a straddling store, and the map clearing.
- Mutation checks.
- The editor's Screen, MIPS/RISC-V and stage-1 tests.
- M0's measurements again.

### M3. Timers and interrupts (decisions 4–6 and 12, ADR 0074)

M3 comes before M2, because it changes the simulate loop and the BackStepper that M2 tunes.

**RARS: the run loop is restructured first.** Today interrupt entry runs before an instruction is opened (`Simulator.java`, the interrupt section, before `beginInstruction`), which causes three problems:

- every CSR and PC write of the entry becomes an Undo step of its own;
- the PC restore subtracts 4 from a PC that was never incremented;
- the handler's first instruction runs in the same pass, before the breakpoint check.

The fix:

- Interrupt entry becomes a step of its own, at the interrupted PC: one Undo step, with no −4.
- The pass ends after the entry, as MARS's does. A Step therefore lands on the handler's first instruction, and a breakpoint there is hit.
- The entry counts as an instruction, as it does in MARS.

**MARS:**

- **Gating, which today does not exist:** a raised device is delivered whatever IE, EXL and IM say, from a single slot a second raise overwrites. The fix: Cause's IP bits hold pending interrupts, OR-ed together, and delivery requires `IE && !EXL && (IM & IP)`.
- **Count and Compare in CP0:**
    - Count is derived from `BackStepper.instructionsExecuted`, the rewindable counter service 1101 reads, as floor(executed ÷ 2), plus an offset an `mtc0` to Count sets. It is not derived from `Simulator.instructionsRun`, which never rewinds.
    - The Count = Compare check runs inside the open instruction, so its Cause write joins that instruction's Undo step.
    - The timer stays off until the first write to Compare (decision 12).
- **The CP0 surface grows:**
    - `MIPS_COPROCESSOR0_REGISTER_NUMBERS` and `getCoprocessor0Values` gain Count and Compare;
    - `setCoprocessor0Value` and Pokes accept them; poking Count sets the offset;
    - the editor's register panel shows them (`MIPS-registers.ts`, `MIPSEmulator.svelte.ts`).
- **`initialize` resets the pending state.** The static `externalInterruptingDevice` and its successor leak into the next run today.
- **The GNU profile gains a kernel section family**, `.ktext` at 0x80000180 and `.kdata` at MARS's kernel data base, laid out apart from the user text segment. A `j`/`jal` that crosses the regions is rejected with an error saying to use `jalr`.

**RARS's timer:**

- `time` (0xFFFF0018) and `timecmp` (0xFFFF0020) are read through a new elapsed-time host hook: Program time since the run began, counting only while the program runs (decision 12). This is not syscall 30's calendar hook.
- **The trigger is level-based:** `armed && time ≥ timecmp`. An Undo past an entry then leaves no spent latch, and a write to `timecmp` re-arms it.
- **It is checked** every 1,024 instructions, at each slice's end and at each Step.
- **`wfi`** becomes a Program-time wait until `timecmp` or an external interrupt; in a Testcase it moves the virtual clock to `timecmp`.
- `InterruptController`'s pending flags are journaled or derived, and reset at `initialize`.

**Both Cores:**

- `raiseExternalInterrupt(code)` and `clearExternalInterrupt(code)`, for level-triggered devices.
- A per-step report of an interrupt taken: the PC, the cause, the handler address.
- Every exception reaches a program's handler once one exists, as in MARS and RARS: address errors, `break` and Clang's `teq` divide checks included. The Documentation shows a handler that reports them.

**Editor:**

- **`MarsDevices.ts`:** the receiver and transmitter raise level-triggered interrupts. A request stays raised while Ready and IE are both set, and is re-evaluated after every data read, control write, input change and Undo.
- **The Input controller's bit keeps stopping the program.** Its comment, which says interrupts "are not offered", is updated.
- **The Log line** when a Step takes an interrupt.
- **The coverage rule** extends to a display at 0xFFFF0000 that covers the timer registers.
- **`<sim.h>`:** the timer registers and CP0 Count/Compare access.
- **Documentation:**
    - an "Interrupts and the timer" chapter for MIPS and one for RISC-V, each with a small handler example;
    - the Screen and syscall pages stop saying interrupts are unsupported;
    - `wfi`'s instruction page is corrected.
- **Dated notes:** on [ADR 0040](../adr/0040-programs-see-calendar-elapsed-and-cpu-clocks.md) for the new uses of CPU time and of running Program time, and on [ADR 0035](../adr/0035-environments-match-their-reference.md), since Count and Compare are not in MARS 4.5.

**Tests:**

- Core tests per source;
- Undo out of a handler on both Cores, with the PC, CSRs and CP0 checked, plus mutation checks;
- a Step and a breakpoint landing on the handler's first instruction;
- Count's rate and its rewinding;
- the timer off until Compare is written;
- level-triggered keyboard interrupts with two quick keys, with a key typed before IE, and with Testcase input;
- `wfi`, interactively and in a Testcase.

### M2. TeaVM-level tuning (decision 3), time-boxed

On `feat/stage2` after M1 and M3, one target at a time, each kept only if the Core suites and the editor's tests pass and it measures faster:

1. **The observer walk:** keep the observers' overall bounds and skip `notifyAnyObservers` outside them.
2. **The simulate loop's per-instruction overhead**, profiled on the M3 loop.
3. **The BackStepper**, profiled with Undo on.
4. **A 32-bit register path for RV32 in RARS:** registers, the ALU and the BackStepper's records use `int` when the program is RV32.

Item 4 reaches every instruction and the BackStepper, so it gets its own spike first, with a stop/go decision on what it would take.

**Time box:** about two days in all, with a "Tuning" section in the baselines note.

### M5. 64 MB for static data and heap (decisions 7 and 12)

On `feat/stage2`, after M2.

- **The data segment's block table grows to 64 MB** through a constant of its own: the table length is shared today by the data, kernel-data and stack tables, and the stack keeps 4 MB.
- **`dataSegmentLimitAddress`** and the GNU profile's and dialects' static-data and heap checks follow.
- **The assemblers' 16 MiB output limit** stops counting `.bss`.
- **Editor:** `<sim.h>`'s `SIM_SCREEN` limit, the generator, the memory-map pages and the "out of memory" texts.
- **Compiler Explorer fixtures:** the `screen-too-large-*` fixtures need their answers captured again, which M9's pass includes.
- **Tests:**
    - a program allocating 40 MB on both Cores;
    - 20 MB of `.bss`;
    - sbrk past 64 MB still ending the program;
    - RV64 address math.

### M4. Hand-written Files join a Build only when needed (decision 10, every Target)

Runs in parallel with M1–M5; it touches compilation and linking, not the simulator.

**MARS and RARS (`GnuAssembler`):**

- Before assembling, scan each candidate File's global declarations (`.globl`/`.global` and the labels they name).
- Assemble and link only the Files that define a symbol the program still needs, in rounds, as the archive pull works today.
- A File not needed is never prepared or parsed, so its errors cannot fail the Build.

**x86's Core (`blink-js`):** the same rule for its archive members. A File nothing needs is neither assembled nor reported.

**Editor:**

- **Candidates:** `resolveLinkUnits` and x86's project planning pass every assembly File of the Target, by the editor's own assembly extension set, that no Program's Entry tree includes and that is no Program's Entry.
- **Problems** gives a File left out the "not part of this program" hint.
- **A needed File in MARS or RARS dialect** fails with an error saying it is linked into a C program and must be GNU syntax.

**Audit:** every example in `packages/examples` and every course page that builds C beside other assembly Files.

**Tests:**

- a C Program calling a hand-written GNU `.riscv` and `.mips` function;
- an unrelated MARS-dialect File with errors beside a C Program, which must not break its Build, on MIPS, RISC-V and x86 (`.asm`);
- a needed File in MARS dialect, with the error's wording checked;
- Pac-Man's two Programs.

**Owner review at the end of the implementation:** decision 10 keeps its earlier version beside this one, and the owner looks at both again (M9).

### M6. The MIDI port and the sampled-audio output (decisions 8, 9 and 12, ADR 0075)

Editor-only, after M1 and M3, because all three edit `MarsDevices.ts`.

The behaviour x86's devices have lives in x86's C Core (`libblink/blink/rawmidi.c` and its `/dev/dsp`), not in the editor. The editor's `peripherals/audio/midiPort.ts` and `pcm/` only play messages and chunks that already carry a time. So M6 builds two device models in TypeScript, and reuses only the output side.

**The MIDI port model:**

- a 4 KiB byte FIFO draining at 31,250 baud in Program time;
- the busy bit, and a byte dropped while busy;
- the reset command;
- message assembly with running status and SysEx;
- an Undo journal keyed to the Core's rewindable instruction count, restoring channel state (program, controllers, pitch bend) as x86's journal does (ADR 0059);
- the all-notes-off at end and Stop, and the GM reset at Build and Run.

**The sampled-audio output model:**

- an 8,192-frame FIFO draining at its rate in Program time;
- the Free count;
- mono and stereo packing;
- a word written while the FIFO is full is dropped, which Free warns of;
- Undo takes back unplayed frames.

**Shared work:**

- **Testcases:** reading the busy bit or Free while the device is full moves the virtual clock to the next drain (decision 12).
- **Audio:** it owns these outputs only as `audio.x86` today (`Audio.ts`); that gets generalised so MIPS and RISC-V can own them too.
- **Channels:** confirm, against syscalls 31 and 33, which MIDI channels the port shares with MARS's notes.
- **Register modules:** `midiPortRegisters.ts` and `sampledAudioRegisters.ts`, plain data, read by the adapter, the Documentation, the agent prompt and `scripts/sim-header`, with `<sim.h>` helpers.
- **Documentation:** a chapter teaching both.

**Tests:**

- busy and drop, running status, SysEx, rate clamping;
- Free draining in Program time, packing, a write when full;
- Undo of notes and frames;
- Testcase timing with no spin;
- coverage.

### M7. asmOS on the new machine (asm-examples)

After M1, M3, M4, M5 and M6.

- **Preemption:**
    - `os/platform/riscv/` and `os/platform/mips/` get a hand-written context switch and trap handler, as `.riscv`/`.mips` Files the kernel calls, so M4 links them;
    - `PLATFORM_PREEMPTIVE` is 1;
    - RISC-V arms `timecmp` every 10 ms of running Program time;
    - MIPS calibrates Count against syscall 30 at boot, then arms Compare;
    - a process gives the processor up with a user software interrupt on RISC-V (`csrsi uip, 1`), since `ebreak` stops the debugger and `ecall` is a syscall, and with `teq` on MIPS, since `syscall` does not reach the handler;
    - the handler reports any other exception and ends the program.
- **Memory:**
    - `os/platform/sim/memory.c` reads the new limit, not its hardcoded 0x10400000;
    - `PLATFORM_SMALL_MEMORY` goes, so the back buffer, the wallpaper picture, the Video Player, Paint's undo levels and the Assembly Editor's limits come back;
    - the process table grows only as far as the 4 MB stack segment allows, with stacks of 64 to 120 KB measured against what each process needs, and DOOM's stack checked;
    - the boot check reflects the real budget.
- **Sound:** `os/platform/sim/sound.c` writes MIDI to the port and samples to the FIFO, mirroring x86's.
- **Verification:**
    - harness screenshots and responsiveness numbers against M0;
    - x86 unchanged, by screenshots and DOOM's checksum;
    - `npm run build`, `check` and `test` in asm-examples.

### M8. DOOM on MIPS and RISC-V (decision 11)

After M7.

- **The link needs C stubs or compile-time guards** for every x86 assembly symbol DOOM's C refers to, since hiding the menus removes no reference:
    - `doom_column` and `doom_span` (`r_draw.c`, `r_plane.c`, `asmos_segloop.c`);
    - `doom_palette_row`, `doom_palette_row2` and `doom_row_changed` (`i_asmos.c`);
    - `doom_mix_add` and `doom_mix_out` (`i_asmos_sound.c`);
    - the `bench_*` symbols;
    - `doom_fresh`.
- **x86-only Files are excluded** from the RISC-V and MIPS packs: `doom_simd.asm`, `asmos_fresh.asm` and the `.part.asm` wrappers.
- **Menus and restart:** drawing goes through C; Game > Profile and Game > Benchmark CPU are hidden; a second DOOM in one boot says "Restart asmOS to play DOOM again".
- **Measure** frames per second on both Targets, and put them in the README.

### M9. Integration, review and release

- **One Compiler Explorer pass**, through `recompile.task.ts`:
    - every unit whose inputs changed: asmOS's units on all three Targets, and DOOM's four parts for RISC-V and MIPS;
    - M5's fixtures.

    Then asm-examples' `npm run build`, `check` and `test`.

- **Full checks:**
    - the editor's full suite, svelte-check, `pnpm lint`, `pnpm format:check` and every generator's `--check`;
    - both Cores' JS and wasm suites, and x86's suite.
- **A browser check** of each feature, and of asmOS on all three Targets.
- **Docs:** the design docs' status lines, CONTEXT.md entries (**MIDI port**, **Sampled-audio output**) and an implementation record in this plan.
- **Remind the owner to look again at decision 10**, showing its earlier and its final versions side by side, as the owner asked on 2026-11-04.
- **Releases, for the owner:**
    - `@specy/mips` and `@specy/risc-v` 6.0.0, since interrupt delivery, the memory limit and the linking rule all change behaviour;
    - the next major of `@specy/x86` for the linking rule.

## Order and parallelism

| Track   | Milestones                                              | Where                                                                                                                                                                                     |
| ------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cores   | M1 → M3 → M2 → M5, on one `feat/stage2` branch per Core | Memory, the simulate loop, CP0/CSRs, BackStepper, `GnuAssembler.layout()`                                                                                                                 |
| Linking | M4, in parallel                                         | `GnuAssembler`'s archive pull and x86's project planning; the editor's `sourceCompilation`. M4 rebases onto the Cores' branch before merging, because M3 and M5 also touch `GnuAssembler` |
| Sound   | M6, after M1 and M3                                     | the editor's `MarsDevices.ts` and audio modules                                                                                                                                           |
| asmOS   | M7 → M8                                                 | asm-examples                                                                                                                                                                              |

## Risks

- **Interrupt entry under Undo:** the RARS loop restructure is the riskiest change. It is tested by stepping into and out of handlers, with mutation checks, before anything is built on it.
- **Store paths outside `set()` and `storeRawWord()`** would show as stale pixels. A test writes through each caller found.
- **The RV32 register path** may cost more than the time box; the spike decides.
- **RISC-V timer tests** run on the virtual clock. Interactive behaviour is checked in the browser.
- **DOOM** may run at one or two frames a second, which decision 11 accepts; its answer sizes are known from M0.
- **The shared Memory:** every new Core state (dirty map, pending interrupts, timer arming) is reset at `initialize` and guarded by the ownership check, so emulators cannot leak into one another.

## Implementation record

Implemented on 2026-11-04, uncommitted:

- the editor on `feat/asmos-stage2` (worktree `.cache/wt/s2`, from 98d3d141);
- MARS and RARS on `feat/stage2` (`.cache/wt/s2-mips`, `.cache/wt/s2-risc-v`, from their v5.0.0 commits 95ff540 and 31d8a51);
- x86's Core on `feat/stage2` (`.cache/wt/s2-x86`, from its v8.0.0 commit e2558fd);
- asm-examples on `feat/stage2` (`.cache/wt/s2-examples`, from 618f939).

The measurements are in [asmos-stage2-baselines.md](../research/asmos-stage2-baselines.md).

### M0, baselines

- `framebuffer.measure.ts` joins the editor's measurement harness (compute, full frame and window copy at 640 × 480), and the measure config now runs the Cores' ES module builds, so the WebAssembly build is measured too.
- Compiler Explorer's answers were estimated with the local Clang: every unit under 16 MiB, MIPS's `apps.c` at -Os the closest.

### M1, native dirty tracking

- **Cores:** the dirty map is marked in `set()` and `storeRawWord()`, with `trackWrites`, `takeWrittenBlocks` and `readMemoryWords`.
- **Editor:** `MarsDevices.ts` flushes through them, guarded by the ownership check, and Undo redraws only the blocks it wrote (ADR 0005, dated note).
- **Speed:** drawing about twice as fast everywhere; reading a whole 640 × 480 grid takes about 1 ms.

### M4, hand-written Files only when needed

- **MARS and RARS:** an archive is read by scanning declarations only, and a unit is parsed when the link takes it. A needed unit in the MARS or RARS dialect fails with an error explaining that it must be GNU syntax.
- **x86's Core:** `X86Project.units`, `src/declarations.ts` (the scan, after `nasm -E -MD`'s expansion), `pullDeclaredUnits` and `getProjectUnits`.
- **Editor:** the candidates are the Target's assembly extensions plus `.asm` and `.s`, neither an Entry nor reached by any Entry's includes.
- **The scan does not expand `.macro`:** closed at review, see "Review fixes" below.
- An x86 Build's configuration now includes its unit list, so saved Build outputs read as stale once; asmOS's `os/main` was made again at M9.

### M3, timers and interrupts

- **RARS:** the run loop is restructured: interrupt entry is a step of its own, with no −4, and the pass ends after it. `InterruptController` is rewritten, with level lines, journaled timer arming and an attention flag, and `wfi` has a host hook.
- **MARS:**
    - delivery is gated by IE, EXL and IM, with Cause's IP bits OR-ed;
    - Count is the BackStepper's count ÷ 2 plus an offset;
    - CP0 shows and pokes registers 8, 9, 11, 12, 13 and 14;
    - the GNU profile places `.ktext` at 0x80000180 and `.kdata` at 0x90000000, and rejects a `j`/`jal` across the regions.
- **Editor:** level-triggered receiver and transmitter, `runningTime.ts` (Program time counted only while running), the Log line, an "Interrupts and the timer" chapter for each Target, and dated notes on ADRs 0035 and 0040.
- **Speed:** MIPS unchanged; RISC-V 4 to 43% faster.
- **Choices for the owner:**
    - the transmitter requests for as long as IE is set and it is ready, the literal level rule; revised after the review: one request per character taken, as MARS's (decision 12);
    - MIPS's `wait` stays a no-op;
    - a RISC-V `wfi` with no deadline waits until a key, Pause or Stop; revised after the review: a key only while the receiver's interrupt and `uie` bit 8 are on, the status line naming what can end the wait, and a Step's wait ended by Pause too (decision 12).

### M6, the MIDI port and the sampled-audio output

- **Devices:** `MidiPortDevice.ts`, a port of x86's `rawmidi.c`, and `SampledAudioDevice.ts`, with plain register modules `midiPortRegisters.ts` and `sampledAudioRegisters.ts`.
- **Audio:** x86's sound became `TimelineSound` (`audio.timeline`), which MIPS and RISC-V own too.
- **`<sim.h>`** gains `SIM_MIDI_*` and `SIM_PCM_*`.
- **Documentation:** a "MIDI and audio" chapter, and **MIDI port** and **Sampled-audio output** in CONTEXT.md.
- **Provisional, in decision 12:** a Testcase's unchanged Free read advances the virtual clock; the port has its own sixteen-channel synthesizer.

### Integration of M4 and M6

- `stage2Interplay.test.ts` covers the features together; a missed sound refresh after `wfi` was fixed.
- **RISC-V's `time` stops at Pause while sound drains:** kept, as decision 12 records.
- **RARS's GNU profile rejected `csrw utvec, t0`:** fixed with M2.
- **A handler-only `.ktext` File was never linked:** first always linked, provisionally; at review a C program asks for it with `SIM_LINK` instead (decision 12, "Review fixes" below).

### Review fixes (2026-11-04, after three independent reviews)

**Linking, on every Target:**

- **`.ktext` gets no special treatment.** MARS no longer links every File holding `.ktext`, nor reports two such Files the link does not take. Two linked ones are still an error, now on the second File's first kernel instruction.
- **A `.globl` of a name a unit does not define is a need**, as for `ld`: MARS and RARS already counted it once a unit was parsed. RARS now takes `.extern`, a declaration only, as MARS did; neither counts it as a need, as GNU as keeps nothing of it.
- **`<sim.h>`'s `SIM_LINK(name)`** on all four Targets: `__asm__(".globl " #name)`. On x86 the translator writes such a `.globl` as NASM's `required`, which keeps the symbol in the object, where `extern` did not; GCC writes no such line itself, so no corpus output changed.
- **The scan reads blocks:**
    - In MARS and RARS, nothing between `.macro`, `.rept`, `.irp`, `.irpc` or an `.if` and its end counts, and such a File is parsed on its own, with its messages kept apart, only for a name still missing. The GNU profiles take none of these directives today, so such a File is never taken.
    - On x86, the scan joins `\`-continued lines, reads local labels as `base.local` (not after `equ`, as NASM has it), and reads `struc` names.
- **x86:**
    - `.nasm` Files are candidates again (`linkedExtensions`).
    - The Entry's scan is only `nasm -M`, when its text can include anything, and is never cached, so a File checked as the Entry is read again as a unit.
    - When the Entry does not assemble, the units its `extern` lines name, and those the objects that did assemble need, are still assembled, so their mistakes are reported.
    - The not-linked Hint reads "This File is not part of the program: the program uses nothing it defines."
- **Documentation:** "Linking assembly Files" on MIPS's and RISC-V's Using C pages, and `SIM_LINK` and `required` on x86's.
- **Build outputs:** a test pins that an x86 Build output reads as stale once a linkable File is added, since the candidates are in the Build configuration.

**RARS:**

- Width switches are lossless: a register made narrow keeps its long until a narrow write.
- A `timecmp` write outside an instruction or a Poke arms the timer without an Undo step.
- A `timecmp` write restarts the 1,024-instruction interval, so a run does not judge a half-written RV32 value.
- RV64's `ucause` for an interrupt has bit 63 set.
- `csrw`/`csrs`/`csrc` with a constant lower to `csrr?i`, and RARS's register-first order is an error that shows GNU's order.

**MARS:**

- Count's parity rule is documented: a write that makes Count equal Compare raises IP7 at once only on an even-numbered instruction.
- In the CP0 register text, Count reads 0 at the program's first instruction, which for C is the start code's.

**Both Cores: `pulseExternalInterrupt(code)`,** an edge-triggered request for the display transmitter:

- It is pending until taken, whatever Status or `ustatus` say, and spent on entry.
- It is journaled during an instruction or a Poke and on entry (`INTERRUPT_PULSES_RESTORE`).
- `clearExternalInterrupt` withdraws one.
- MIPS keeps the taken bit in Cause until the next exception or interrupt entry, or until the program writes it as 0.

### M2, tuning

- **Kept:** the observers' bounds check, call-frame reuse, MARS's `refreshStack` early-out, a "ticked" flag in RARS instead of a counters entry, narrow undo records, and 32-bit registers for RV32 (the spike said go).
- **Speed:** the Cores alone, against M1's:
    - MIPS 1.16 to 1.89 times;
    - RISC-V's JavaScript build 1.69 to 2.48 times;
    - RISC-V's WebAssembly build 1.35 to 1.55 times.
- **For the owner:** RV32 registers are 32-bit now, and `csrr time` keeps the low half; both Core READMEs have "Migrating to 6.0.0".

### M5, 64 MB

- **Cores:** the data block table is 16,384 blocks of 4 KB, apart from the stack's and the kernel data's. `.bss` is left out of the 16 MiB output limit, up to 1 GiB before the segment's end bounds it.
- **Editor:** `MARS_DATA_SEGMENT_END` in `marsDisplay.ts` feeds `<sim.h>`, whose `SIM_SCREEN` limit is 67,043,328 bytes; `SIM_DATA_SEGMENT_END` names the end.
- **Tests:** 40 MB from sbrk, 20 MB of `.bss`, sbrk past 64 MB, and RV64.

### Fixes found by M7

- MARS's GNU profile takes `mfc0`/`mtc0`'s select operand and `cfc1`/`ctc1 $31`.
- **The call stack after Undo,** on both Cores, through `CALL_RESTORE` and `RETURN_RESTORE` history actions: MARS's Undo of a `jal` never popped its frame, and RARS's Undo never touched the call stack. `getCallStack`'s quadratic copy went too.
- **For the owner:** Undo-on call-heavy code is about 12% slower (folding the markers into the instruction entries is a follow-up); MARS ignores FCSR's rounding mode; there is no `<fenv.h>`.

### M7, asmOS on the new machine (asm-examples)

- **Preemption:** `trap.riscv` and `trap.mips` with `switch.c`, every 10 ms. MIPS calibrates Count against syscall 30, about 7,200 Counts a millisecond on WebAssembly.
- **A kernel timer-arming bug** was fixed, on x86 too, whose screenshots and DOOM checksum did not change.
- **Full memory:** the back buffer, the wallpaper picture, the Video Player, Paint's undo levels, and 32 processes with 64 KB stacks.
- **Sound** goes through the MIDI port and the FIFO, and the Music player's int64 bug is fixed.
- **For the owner:** opening a window is about twice as slow as at stage 1 on the same Cores, because of the back buffer and preemption mid-drawing. `-DPLATFORM_BACK_BUFFER=0` and composing once a frame are the options.

### M8, DOOM on MIPS and RISC-V

- **x86 assembly:** `os/doom/asmos_x86.h` guards every x86 assembly symbol with `DOOM_X86`.
- **Menus and restart:** one game per boot; Fast Drawing, Profile and Benchmark CPU are hidden.
- **Demo 1** plays tic for tic as on x86 (sum `cf6b7f4d`). Frames a second:
    - RISC-V: 4.9 on WebAssembly, 2.3 on JavaScript;
    - MIPS: 3.8 on WebAssembly, 1.9 on JavaScript;
    - x86: 22.1.
- **Count's calibration** takes the fastest of five windows.
- **Open:** DOOM's mixer may clip.
- **The 16 MiB a Project may hold** set the two provisional choices in decision 12: DOOM's parts at -Os, and no `videos/` on MIPS.

### M9, integration

**Documents:**

- The design documents and ADRs 0074 and 0075 joined the branch, with the main checkout's dated notes on ADRs 0008, 0033, 0035 and 0039.
- ADR 0035 merges two notes of the same day: 64 MB, then Count/Compare and the interrupt deviations.

**Compiler Explorer, one pass of 25 requests:**

- `recompile.task.ts` now creates Generated assembly a record names but the tree lacks, prints each answer's size, and lists what it would compile with `ASM_EXAMPLE_DRY_RUN=1`.
- 19 asmOS units:
    - x86: `main.c`, `apps.c`, `ide.c`, `doom_render.c` and `doom_world.c`;
    - RISC-V and MIPS: all seven each, DOOM's at -Os.
    - Answers ran from 3.2 MiB to 12.2 MiB, the largest MIPS's `apps.c`.
- The six `<sim.h>` fixtures were recaptured as `screen-largest-*`. With 64 MB no `SIM_SCREEN` can fail, so their test now checks that the largest grid, 1024 × 1024 words, builds and shows.
- **The local Clang** (`tools/harness/localClang.ts`, tabs expanded) gave Compiler Explorer's Generated assembly byte for byte on RISC-V. On MIPS it came out 2 to 4% smaller, because Compiler Explorer's MIPS Clang keeps a frame pointer.

**asm-examples:**

- `npm run check` reports every port's problems, not only the first failing port's.
- **Project sizes** against the 16 MiB a Project may hold:
    - x86 13.3 MiB, 14.9 MiB with its Build output `os/main`;
    - RISC-V 15.2 MiB, whole;
    - MIPS 14.3 MiB, without `videos/`.

**Checks**, on freshly rebuilt Core dists:

- MARS and RARS: their JavaScript and WebAssembly suites;
- blink-js: 3,500 tests, and its dist smoke test;
- the editor: 374 files, 7,563 tests, none failing;
- svelte-check, `vp lint`, ESLint, `vp fmt --check`, and the `--check` of `<sim.h>`'s, the source-language help's and the audio bank's generators;
- the Runtime library: its ABI guard, `generate:check`, offline, and the 40 frozen ABI fixtures;
- asm-examples: `npm run build`, `check` and `test`, 21 tests.

All of them pass.

**In the browser**, on a dev server of the branch:

- **The Input controller:** the arrows print `RLDU`, and Escape ends the program.
- **Folder calls:** a folder made, a file written into it and renamed, then listed: `.`, `..` and `b.txt`.
- **Two C units** and a hand-written GNU File link on both Targets. A broken RARS- or MARS-dialect exercise beside them gets the "not part of the program" Hint and breaks nothing.
- **Interrupts:**
    - a Step lands on 0x80000180, and the Log says "Timer interrupt at 0x00400008 → handler at 0x80000180";
    - Undo goes back to 0x00400008;
    - RISC-V's timer example ends in 525 ms for five 100 ms ticks.
- **Sound:** the MIDI port's scale and the sampled-audio output's square wave both reach the audio output.
- **64 MB:** a word read past 20 MB of `.space`, and the last word of a 40 MB sbrk.
- **asmOS:**
    - it boots to its desktop from the built archives on x86, RISC-V and MIPS;
    - DOOM plays its demo on RISC-V at about 5 frames a second;
    - MIPS's Video Player opens with nothing to play.

**Still for the owner:**

- **Decision 10's two versions**, the earlier and the final one, side by side, as the owner asked on 2026-11-04.
- **The provisional choices in decision 12.**
- **The releases:**
    - `@specy/mips` and `@specy/risc-v` 6.0.0;
    - the next major of `@specy/x86`.
