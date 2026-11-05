# asmOS stage 2

Status: decided in a grill with the owner on 2026-11-03 and 04; implemented, uncommitted, on feat/asmos-stage2 (the record is in the [plan](./asmos-stage2-plan.md#implementation-record)). The models are [ADR 0074](../adr/0074-mips-and-risc-v-timers-count-what-their-references-count.md) (timers and interrupts) and [ADR 0075](../adr/0075-mips-and-risc-v-get-a-midi-port-and-a-sampled-audio-output.md) (the sound devices), with dated notes on ADRs 0005, 0008, 0033, 0035, 0039 and 0040. Stage 2 of [asmOS portability](./asmos-portability.md), whose "Stage 1 record" holds the measurements this starts from.

## What it is

Stage 1 ported asmOS to MIPS and RISC-V on today's Cores, with two exceptions: the Input controller and the folder calls. The port runs cooperatively and silently, in 4 MB, without DOOM or the Video Player. A window drag also shows only about five steps a second. Stage 2 closes those gaps with Core extensions.

## Decisions

1. **Scope: everything.** It covers:
    - **(A) Responsiveness:** native tracking of framebuffer writes in the Cores.
    - **(B) Timers and preemption:** MIPS32 Count/Compare and RARS's Timer Tool, with interrupts delivered.
    - **(C) A larger memory configuration**, bringing back the Video Player, the back buffer and the wallpaper.
    - **(D) Sound**, for MIDI and sampled audio.
    - **(E) DOOM on MIPS and RISC-V.**

    The order is A → B → C → D → E. DOOM comes last because it depends on A and C, and its speed is measured once they land. The small follow-ups wait, except linking hand-written GNU-profile assembly units (decision 10).

2. **Responsiveness comes from the Cores we have: native dirty tracking plus TeaVM-level tuning.** A native rewrite of MARS and RARS (Rust to WebAssembly, as s68k is) is not part of stage 2. It stays an option for later, if these two prove not enough.
    - **Native dirty tracking** (A): each Core's Memory keeps a map of the framebuffer blocks written since the last Screen update, marked by every way a program can store: byte, halfword, word and doubleword stores, unaligned stores, atomics, floating-point stores, syscalls that write memory, Pokes and Undo's restores. The adapter reads the map once per update and fetches the changed blocks with one bulk word read, replacing today's JavaScript call on every store (55 to 65% of the Core's time while drawing). Undo redraws only what it changed. Programs and the people using the editor see no difference except speed.
    - **TeaVM-level tuning:** cheaper work in the Cores' own hot paths, still compiled by TeaVM (see decision 3).

    Rejected for now:
    - **A blitter device**, a memory-mapped rectangle fill and copy that the editor runs natively. It would cut asmOS's compositing the most, but it is a new device programs must be written for.
    - **Batching the per-store call**, which still allocates on every store.
    - **Re-reading the whole framebuffer at each update**, about 20 ms at 640 × 480.

3. **TeaVM-level tuning is one profiling-driven pass, time-boxed, on four known targets:**
    - **a 32-bit register path for RV32 in RARS**, whose registers are 64-bit `long`, which TeaVM makes expensive (about 10% in its long-arithmetic helpers). RV64 keeps `long`;
    - **the observer walk on every fetch and data access** (`notifyAnyObservers`), cut by a precomputed bounds check, which pairs with the native dirty tracking that removes the largest observer;
    - **the simulate loop's per-instruction overhead**, 17 to 24% in the last profile;
    - **Undo bookkeeping** (the BackStepper), 9 to 18% with Undo on.

    Each change is measured before and after on the compute benchmark and on asmOS through the harness, with Undo on and off, on both the JavaScript and the WebAssembly builds. Only wins the Core test suites hold up are kept.

    Rejected:
    - **Only the RV32 path:** it leaves the observer walk, which costs every program.
    - **An open-ended pass:** days on small wins, when a native rewrite is the real next step if this falls short.

4. **Each timer counts what its reference counts, on the editor's matching clock.**
    - **RISC-V:** RARS's Timer Tool registers, `time` at 0xFFFF0018 and `timecmp` at 0xFFFF0020, count Program-time milliseconds ([ADR 0010](../adr/0010-program-time-without-clock-pacing.md)), as the tool counts real ones. A "fire in one second" fires after a real second.
    - **MIPS:** CP0 Count (`$9`) counts CPU time ([ADR 0040](../adr/0040-programs-see-calendar-elapsed-and-cpu-clocks.md)). It goes up once every two retired instructions, a MIPS32 Count ticking every other cycle of the nominal 100 MHz machine, and Compare (`$11`) raises Cause IP7. Count says how much the program has run, not how long that took. It is the same on every run, so Undo, stepping and Testcases see interrupts at the same instructions.
    - **Calibration on MIPS:** as Linux on MIPS calibrates Count against a known clock at boot, asmOS's MIPS platform reads Count against syscall 30 for a moment at boot and derives how many ticks make a real 10 ms slice. Preemption then feels the same on every Target.
    - **In a Testcase,** a RISC-V program that spins for a timer interrupt without ever waiting gets none, because the virtual clock moves only on waits. It runs to the instruction limit, as [ADR 0010](../adr/0010-program-time-without-clock-pacing.md) already accepts for a program that polls the time. The Documentation says so.

    Rejected:
    - **Both on CPU time:** RARS's "one second" would take 20 to 30 real seconds, and `time` would disagree with syscall 30.
    - **Both on Program time:** a MIPS cycle counter ticking in milliseconds is no MIPS.
    - **A nominal clock nearer the real speed:** the 100 MHz rate is shared by every Target's CPU-time services, and the real speed varies by machine and by the Undo setting.

5. **Interrupts come from the timers and from the reference tools' own receiver and transmitter.**
    - **Delivery** goes the way each reference delivers it. MIPS: Status, Cause and EPC, the `.ktext` handler at 0x80000180, and `eret`; the timer is Cause IP7, the receiver Cause bit 8 and the transmitter bit 9, as in MARS. RISC-V: `utvec`, `ustatus`, `uie`, `uip` and `ucause`, then `uret`; the timer is a user timer interrupt and the receiver and transmitter external interrupts with `utval` 0x40 and 0x80, as in RARS.
    - **The receiver's and transmitter's interrupt-enable bits now work** instead of stopping the program, so the interrupt-driven keyboard labs written for MARS and RARS run unchanged.
    - **The Input controller's interrupt-enable bit stays reserved**, still stopping the program ([input-controller.md](./input-controller.md), decision 10): asmOS polls the controller, and its interrupt mode waits for a program that needs it.

    Rejected:
    - **Timers only:** the reference tools' interrupt labs would keep failing, when delivery costs the same either way.
    - **Designing the Input controller's interrupts now:** nothing needs them yet.

6. **The debugger shows interrupts as they happen.**
    - **Step runs one instruction**, so a pending interrupt can make it land on the handler's first instruction, as on the hardware and in MARS and RARS.
    - **When a Step takes an interrupt, the Log says so**, for example "Timer interrupt at 0x00400120 → handler", so a learner sees why the line jumped.
    - **Undo restores the interrupt state** (EPC, Cause and Status on MIPS; `uepc`, `ucause`, `ustatus` and `uip` on RISC-V), so stepping back out of a handler returns to the interrupted instruction. On MIPS, whose timer counts instructions, stepping forward again takes the interrupt at the same point.
    - **Breakpoints and Run to cursor** work inside handlers as anywhere else.

    A learner whose stepping keeps landing in a timer handler turns interrupts off in their program while debugging, as developers do on real machines.

    Rejected:
    - **Holding interrupts off while stepping:** it hides what an interrupts lesson teaches, and stepping would time differently from running.
    - **A setting to choose:** it can come later if the faithful behaviour proves a real annoyance.

7. **Every MIPS and RISC-V program gets 64 MB for static data and heap**, up from MARS's and RARS's 4 MB, as a documented superset, as the arbitrary display sizes were ([ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md), 2026-10-23 update).
    - **Nothing else moves:** addresses, the heap start and the 4 MB stack are as before, and a program that fits in 4 MB behaves exactly as before.
    - **The one difference:** a program that would run out of memory in real MARS or RARS keeps going here. The Documentation, `<sim.h>`'s `SIM_SCREEN` limit and the GNU profile's static-data check say so.
    - **It costs nothing until used:** both Cores allocate memory in 4 KB blocks on first write, and the limit is only the length of a pointer table.
    - **64 MB holds** DOOM (its WAD read whole, about 4 MB, plus about 6 MB of zone memory), the Video Player's 2.5 MB video, and a back buffer and wallpaper of 1.2 MB each, with room to spare.

    Rejected:
    - **A per-Program memory setting:** faithful by default, but a setting every growing C program would have to discover.
    - **Raising only the heap:** static data would still hold the 1.2 MB framebuffer.

8. **Sound comes through two small new devices** beside the Synth and the Input controller, both chips that could have been built ([ADR 0061](../adr/0061-the-synth-is-a-chip-that-could-have-been-built.md)'s standard):
    - **A MIDI port**, in the style of the MPU-401's UART mode: a data register a program writes MIDI bytes to, and a ready bit. The bytes go to the General MIDI synthesizer that already plays MARS's and RARS's MIDI notes and x86's raw MIDI port.
    - **A sampled-audio output**, a DAC with a FIFO, in the style of the Sound Blaster's or the Amiga's: a rate register, a free-space register, and a register samples are written into. It drains at its rate in Program time, as x86's `/dev/dsp` does, and plays through the same sampled-audio output.

    asmOS's MIPS/RISC-V sound code then mirrors its x86 code. The devices' registers are settled below (decision 9).

    Rejected:
    - **Syscall 31 for MIDI, with durations found by looking ahead, and the Synth's sample memory for short effects:** no new device, but the Video Player stays silent, Pac-Man's mixer has to be rewritten, and the Synth cannot stream.
    - **MIDI only.**

9. **The two sound devices**, right after the Input controller (0xFFFF0300 to 0xFFFF033F), within reach of the same base register.

    **The MIDI port at 0xFFFF0340**, in the style of the MPU-401's UART mode:

    | Offset | Register        | Meaning                                                                                                          |
    | ------ | --------------- | ---------------------------------------------------------------------------------------------------------------- |
    | +0x00  | Data (write)    | a MIDI byte goes out                                                                                             |
    | +0x04  | Status (read)   | bit 6 set while the port is busy, its buffer full; bit 7 always set, no MIDI in: the MPU-401's own bit positions |
    | +0x04  | Command (write) | 0xFF resets: buffer cleared, all notes off; 0x3F, enter UART mode, is accepted and does nothing                  |

    Bytes reach the synthesizer at MIDI's 31,250 baud in Program time, about 3,125 a second, behind a 4 KiB buffer, as x86's raw MIDI port's do. A byte written while the port is busy is dropped, as on the hardware, so a program checks bit 6 first.

    **The sampled-audio output at 0xFFFF0350**, a DAC with a FIFO:

    | Offset | Register          | Meaning                                                                               |
    | ------ | ----------------- | ------------------------------------------------------------------------------------- |
    | +0x00  | Control           | bit 0 on (off clears the FIFO), bit 1 stereo                                          |
    | +0x04  | Rate              | samples a second, 4,000 to 48,000, clamped; reads back what was set                   |
    | +0x08  | Free (read)       | how many frames the FIFO can take now                                                 |
    | +0x0C  | Data (word write) | mono: two signed 16-bit samples, the low half first; stereo: one left and right frame |

    The FIFO holds 8,192 frames, about half a second at 16 kHz: enough for asmOS's worst gap between two pumps while it redraws, and 32 KB that a chip of about 1990 could have had. It drains at its rate in Program time, and an empty FIFO plays silence.

    **Both follow the rules x86's raw MIDI port and `/dev/dsp` follow** ([x86-devices.md](./x86-devices.md)):
    - **In a Testcase** they are silent but keep their timing on the virtual clock.
    - **Undo** takes back the sound and the notes the undone writes made that have not been heard yet, and restores the settings; nothing already heard comes back ([ADR 0059](../adr/0059-undo-takes-back-the-sounds-an-instruction-made.md)).
    - **Pause and Breakpoints change nothing.**
    - **Stop** silences everything at once.
    - **At the program's end** the buffers play out and held notes are released.
    - **The synthesizer is reset** at every Build and Run.
    - **Coverage:** a bitmap display based at 0xFFFF0000 that covers either device switches it off, as it does the Synth.

    `<sim.h>` names both, and a Documentation chapter teaches them.

    Left out:
    - MIDI in;
    - recording;
    - sample formats other than signed 16-bit;
    - an underrun flag;
    - interrupts, since both are polled as decision 5 has it; a FIFO-low interrupt is a natural later addition.

10. **A hand-written assembly File joins a C Build only when the program needs it, on every Target** (revised 2026-11-04 after the plan's review; the owner reviews it again at the end of the implementation, see below):
    - **Need is found before assembling:** a quick scan of each hand-written File's global declarations (`.globl`/`.global` and the labels they name) tells whether it defines a symbol the program still needs. Only a needed File is assembled, under the Build's GNU profile, and linked, as `ld` takes members from a library.
    - **What counts as a need is what `ld` counts** (review fixes, 2026-11-04): a symbol the program refers to, and a `.globl` of a name a unit does not define, which GNU as keeps as an undefined global. `<sim.h>`'s `SIM_LINK(name)` writes such a `.globl`, so a C program can ask for a File it never calls, as `ld -u` asks for a member. `.extern` declares nothing GNU as keeps, so it needs nothing; on x86, NASM's `required` is the `.globl`.
    - **A File whose globals a macro, a repetition or a conditional may make** is not read for certain by the scan: nothing between such a line and its end counts. Once the rounds leave a name undefined, each such File is assembled on its own and taken only if it assembles cleanly and defines the name, so a definition seen only inside a false conditional never pulls a File that then fails. x86's scan joins lines a backslash continues and reads local labels (`helper.inner`) and `struc` names.
    - **A File the program does not need is never assembled**, so it cannot break the Build. It gets the existing "not part of this program" hint. A MARS- or RARS-dialect exercise, an unrelated program, or a File saved from asmOS's own editor beside a C Program changes nothing for that Program.
    - **A needed File in MARS or RARS dialect fails with an error that says why:** it is linked into a C program, so it must be written in GNU syntax.
    - **x86 gets the same rule**, so that on no Target an unrelated File breaks a Build. Today x86 assembles every File and fails on any error ([ADR 0033](../adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md), [ADR 0039](../adr/0039-x86-links-start-objects-before-user-and-support-archives.md)).
    - **asmOS's context switch and trap handlers become readable `.riscv`/`.mips` Files**, linked because the kernel calls them. Its `code/` examples stay as they are.

    **Earlier version, kept for the owner's second look:** x86's rule unchanged, Project-wide. Every other assembly File of the Target that nothing includes and that is no Program's Entry would be assembled under the GNU profile, failing the Build on any error. asmOS's `code/` examples would be renamed to an extension the editor does not assemble. The review showed this breaks ordinary Projects: any MARS-dialect File beside a C Program, Pac-Man's `assembly/*.s`, extension-less Files counted as assembly, and Files saved from asmOS's editor. The owner then rejected an opt-in `# @unit` marker and asked for editor-first behaviour (the owner's priority: asm-editor first, asmOS second).

    Rejected:
    - **An opt-in marker** (`# @unit`): an editor-only convention to learn, whose purpose was asmOS.
    - **Renaming Files so they are not assembled:** a workaround, not a rule.
    - **A rule scoped to the Entry's folder:** still breaks a Project whose exercises share the C Program's folder.

11. **One DOOM per boot on MIPS and RISC-V.** DOOM never resets its own globals. x86 restores them through hand-written NASM wrappers around each DOOM part, which MIPS and RISC-V lack. So closing DOOM and opening it again there says "Restart asmOS to play DOOM again". The rest of DOOM's x86-only parts drop out on these Targets:
    - **Drawing** goes through DOOM's own C loops, the "off" setting of Fast Drawing, instead of the AVX2 ones.
    - **Game > Profile** is hidden: it names functions from the linked `os/main`'s ELF symbol table, and MIPS/RISC-V Builds make no such file.
    - **Game > Benchmark CPU** is hidden: it times x86 instructions.

    Deferred: section-bound symbols for a fresh second game (Deferred).

12. **Refinements after the plan's review** (2026-11-04):
    - **RISC-V's `time` counts only while the program runs.** It stops at Pause, at Breakpoints and between Steps, so a learner stepping through a program with a 10 ms timer is not taken into the handler at nearly every Step after a pause. It starts at 0 at each run, as RARS's Timer Tool does, rather than at the calendar time syscall 30 reads.
    - **RISC-V's timer is checked every 1,024 instructions**, at every slice's end and at every Step, as x86's Core checks its alarm. A check on every instruction would bring back the per-instruction host call decision 2 removes.
    - **`wfi` waits** in Program time until `timecmp` is reached or an external interrupt arrives, each only while `uie` enables it; in a Testcase it moves the virtual clock to `timecmp`, as the M68K's `stop` does ([ADR 0065](../adr/0065-m68k-devices-deliver-irqs.md)). RARS's own `wfi` waits for ever. Revised after the implementation's review (2026-11-04), provisionally for the owner to confirm:
        - the status line names only what can end the wait: "wfi waits for the timer", "for a key" (only while the receiver's interrupt and `uie` bit 8 are on) or both;
        - when nothing the program turned on can end it, the status line says "Waiting for an interrupt that cannot come: Pause or Stop ends this wfi", and the Log says once a run what to turn on;
        - Pause ends the wait during a Step as during a Run: the Run button becomes Pause while a Step waits, and the Step ends after `wfi`.
    - **A Testcase never spins on the sampled-audio output either when a program waits for a given amount of room:** a read of Free that returns the same value as the last read, with no write in between, also moves the virtual clock to the next drain. A program waiting for 512 free frames would otherwise spin. Added during implementation, accepted provisionally for the owner to confirm. The MIDI port keeps the busy-bit rule.
    - **A hand-written File holding `.ktext` joins a MIPS Build by need, as every File does** (revised at review, 2026-11-04). An exception handler sits at a fixed address, 0x80000180, that no program names, so a C program names it with `<sim.h>`'s `SIM_LINK` (decision 10); a File the program does not use is never linked, whatever it holds. Two linked Files that both hold `.ktext` are an error naming both. On RISC-V a handler is installed by name in `utvec`, so it is needed by symbol.
        - Rejected at review: **always linking a File holding `.ktext`**, as first implemented. An unrelated MARS interrupt lab beside a C program then took over the program's faults, a Clang divide check spinning in the lab's handler, and two labs failed every C Build.
        - asmOS's `trap.mips` needs nothing new: the kernel calls `platform_trap`, `mips_count`, `mips_set_compare` and `mips_timer_enable`, which it defines beside its `.ktext` handler.
    - **Sound plays on while the timer stops.** At Pause, at Breakpoints and between Steps, RISC-V's `time` stops (decision 12), but the MIDI port and the sampled-audio output keep draining, as x86's sound does. Sound is what a person hears, the timer is what the program measures. In a Testcase both follow the virtual clock.
    - **The MIDI port has a synthesizer of its own**, 16 channels with drums on 10, as x86's port does. Syscall 31 and 33's notes keep their own channels on the notes' synthesizer, so a program change on the port never changes a note's instrument.
    - **The keyboard receiver's interrupt is level-triggered:** requested for as long as a character is waiting and the interrupt is enabled, so the handler runs once per waiting key. A key typed before interrupts were turned on, a Testcase's scripted input, and two keys typed quickly then all reach the handler. MARS and RARS raise theirs once per key event, which would leave keys stuck in the editor's queue. Serial chips' data-ready interrupts behave this way. A documented difference.
    - **The display transmitter's interrupt is edge-triggered, as MARS's and RARS's are:** one request each time it becomes ready again after taking a character, which here is at once, the console never being busy (revised after the implementation's review, 2026-11-04; it was level-triggered too). Setting the enable bit asks for nothing by itself, as in MARS, whose tool raises the interrupt only at the Ready transition after a write. A MARS display lab, whose handler prints the next character at each interrupt and simply returns once the string is done, leaving the bit set, then ends; with the level rule it re-entered the handler for ever. The Cores take the request through `pulseExternalInterrupt`, pending until an interrupt takes it, then spent, and journaled for Undo; on MIPS the handler finds Cause bit 9, as MARS leaves it. A request that comes while interrupts are held back, inside the handler say, waits to be taken, where MARS drops one it cannot take at once. Accepted provisionally, for the owner to confirm.
    - **MIPS's timer stays off until the program first writes Compare.** MARS starts programs with interrupts enabled. With Compare at 0, Count would meet it after about 8.6 billion instructions, half an hour of a running game, and a program that never used the timer would stop at an interrupt it never asked for. A documented difference from MIPS32, where Count equal to Compare always raises it.
    - **`.bss` does not count towards the assembler's 16 MiB output limit**, which counts emitted bytes. `.data` and `.rodata` stay within 16 MiB, while `.bss` and the heap reach the full 64 MB of decision 7.
    - **A Testcase never spins on the sound devices.** Reading the MIDI port's busy bit, or the audio output's free count, while the device is full moves the virtual clock to the moment the next byte or frame drains, as `wfi` and `stop` move it.
    - **DOOM's four parts are compiled at -Os on MIPS and RISC-V**, as `os/apps/apps.c` already is, where x86 compiles them at -O2. Measured on both Targets, -Os runs DOOM no slower than -O2, and its Generated assembly is smaller, which the 16 MiB a Project may hold needs. Chosen during implementation, accepted provisionally for the owner to confirm.
    - **The MIPS archive leaves out `videos/`**, Bad Apple!!'s 2.4 MB video, for now: with DOOM, MIPS's larger Generated assembly would take its Project past the 16 MiB a Project may hold. The Video Player is still there, starting with nothing to play. RISC-V keeps the video, since it fits. Chosen during implementation, accepted provisionally for the owner to confirm.

## What follows without a decision

- **The Cores own the timers** ([ADR 0035](../adr/0035-environments-match-their-reference.md)). MARS keeps Count and Compare in CP0, counted from its retired instructions. RARS keeps the Timer Tool's `time` and `timecmp`, read from the host's Program time through the time hook syscall 30 already uses. The receiver and transmitter stay in the adapter, which raises their interrupts through a new Core export.
- **asmOS's context switch and trap handlers become hand-written `.riscv`/`.mips` Files** (decision 10). RISC-V installs its handler's address in `utvec` at run time. MIPS needs its handler at 0x80000180, so the GNU profile in MARS places a unit's `.ktext` section there, as MARS's own dialect does.
- **The two sound devices live in the adapter**, as the Synth and the Input controller do. They reuse the editor's General MIDI synthesizer and the sampled-audio output x86 already uses.

## Deferred

- **A fresh second DOOM on MIPS and RISC-V** (decision 11), through section-bound symbols in the GNU profile: each DOOM part's data goes into a named section with Clang's `#pragma clang section`, and the linker defines `__start_<section>` and `__stop_<section>`, as GNU `ld` does.
