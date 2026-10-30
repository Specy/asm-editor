# A real 68000 behind the M68K Target

Status: proposed on 2026-10-21. The owner reviewed it the same day:

- **Confirmed:** decisions 4, 7, 9 and 24.
- **Deferred:** the Hardware panel (20–22) and the S-record Executables (33).
- **Changed:** decision 3 now offers the 68010 and the 68020 as dialects.

On 2026-10-28 the owner confirmed ("ok go") design decision 3's choice of `opt p=` in the source over a per-Program Setting, and the plan's planning decisions 11 (the dialect plumbing ships in batch 1) and 12 (the pause on a write into code is a Preference). Batch 1 is being implemented. The editor ADR numbers moved, since 0055–0064 were taken in the meantime: the IRQs will be ADR 0065. The same day the owner deferred the Build output's format (32), so an M68K Build saves no File for now and the S-record Build output has no ADR.

On 2026-10-30 the owner decided that the Workbench's Documentation panel and completion follow the processor the program chooses (36).

The remaining decisions are recommendations drawn from three fact bases and from a read of the s68k Core and the editor summarised in the [plan](./m68k-machine-plan.md)'s Starting point. The fact bases are:

- [EASy68K's machine behaviour](../research/easy68k-machine-behaviour.md), read from its 5.16.1 source;
- [the 68000 verification and timing references](../research/m68k-verification-references.md);
- [the 68010 and 68020 as dialects](../research/m68k-cpu-variants.md).

Decisions still marked **(owner)** are calls for the owner before the ADRs are written.

## What it is

s68k today interprets an assembled program; it does not emulate a 68000. It runs `Instruction` values looked up in the Program by address. Every instruction is four bytes, code is not in memory, and the status register's system byte has no effect. Everything a 68000 handles through its exception machinery ends the run.

This design turns s68k into a 68000 as EASy68K simulates one, and says how each new part of the machine appears in the editor:

- real instruction encodings at their real sizes, placed in memory and run from a cache the assembler fills, with a decoder and a disassembler;
- exceptions through a vector table, supervisor and user mode with two stack pointers, `rte`, `trap #0`–`#14`, trace, privilege violations, and address and bus errors with their frames;
- interrupts at levels 1 to 7 under the status register's mask, `stop` and `reset`, and the interrupt sources EASy68K has without its hardware window: timers, the keyboard and the mouse;
- EASy68K's memory map (ROM, read-only, protected and invalid ranges) and bus errors;
- a cycle counter with the 68000's timing, and the trap tasks that read it;
- conformance tests against a 68000 reference;
- after the 68000, the 68010 and the 68020 as dialects a Program can choose.

## In the editor, end to end

Four things a person can do once this is in, to show where each decision lands.

- **Build and read the machine code.**
    - Hovering `bra loop` after a Build shows `Machine code 60 F6` and "assembled as `bra.s`". Hovering `add.l #1,d0` shows "assembled as `addq.l #1,d0`" (26).
    - The memory view at `$1000` shows the program's own bytes, which take Pokes. After a Poke, that line is marked as changed, and its hover disassembles what now runs there (27).
    - The Build saves no File: the program is in memory only, and the Explorer shows no Build output until its format is chosen (32).
- **Overwrite code by mistake.**
    - A `move.l d0,(a0)` with `a0` pointing into the program pauses the Run after it: "The program wrote into its own code at $1008, line 4: `add.w d1,d2`" (4).
    - Run again continues, and the overwritten instruction runs as its new bytes decode.
- **Handle a fault.**
    - A program writes `move.l #div_handler,$14` and then divides by zero.
    - The History row of the `divs` reads "Divide by zero → vector 5, `div_handler`". The Call stack gains a frame "Divide by zero → div_handler".
    - The System Register file shows S set and the SSP lowered by six, and the memory view shows the frame in its Exception vectors and Stack regions (9, 10, 25, 28, 31).
    - `rte` pops the frame, and Undo walks back through all of it.
    - The same program without the `move.l` ends as today: "Division by zero at line 12: vector 5 at $000014 holds no handler".
- **Wait for a timer and a key.**
    - A program installs level-2 and level-5 autovectors at `$68` and `$74`. It sets a 500 ms timer at level 2 with task 32 #6 and asks for a level-5 IRQ on key down with task 62. Then it lowers the mask and executes `stop #$2000`.
    - The status reads "Stopped: waiting for an interrupt above level 0". Every half second an IRQ row appears in the History, and the level-2 handler redraws a clock on the Screen. A key pressed on the Screen runs the level-5 handler (16–19, 29).
    - In a Testcase the same program runs instantly, because the virtual clock jumps to each firing (19).

## Decisions

### The reference

1. **The machine is a 68000 as EASy68K 5.16.1 simulates it, and a 68000 where EASy68K is wrong.**
    - ADR 0035 already makes EASy68K the reference for every service. This decision extends it to the machine itself:
        - the reset state, the memory and the 24-bit bus;
        - the list of exceptions and their frames, and trap #15;
        - the memory map;
        - cycle counts;
        - the assembler's choice of sizes and encodings.
    - Where EASy68K's simulator departs from a 68000 by mistake, s68k follows the 68000, and the reference suite (34) decides what the 68000 does. The known cases are listed at the end of the EASy68K fact base:
        - An interrupt taken in the same step as a trap, CHK, TRAPV, divide by zero or line A/F is lost, and one taken beside an illegal instruction re-executes it.
        - The trace and TRAP frames are pushed in the wrong order.
        - Line A, line F and privilege violations push the PC after the opcode instead of the opcode's address.
        - The bus-error status word always says "write", never sets I/N, and always gives a supervisor function code.
        - The Protected check reads the S bit from the GUI.
        - `stop` runs one instruction before the interrupt it waited for, and treats an immediate with S clear as a privilege violation.
        - `link` and `unlk` on A7 use the user stack pointer while in supervisor mode.
    - No program can usefully rely on any of these.

2. **The reset state is EASy68K's.**
    - SR is `$2000`: supervisor, interrupt mask 0. Today it is `$2700`.
    - D0–D7 and A0–A6 are zero. SSP, and so A7, is `$01000000`; USP is `$00FF0000`.
    - The PC is the Entry point. Memory is `$FF`, and the vector table is not initialised, so every vector reads `$FFFFFFFF`.
    - There is no reset exception at the start, and nothing reads the vectors at `$0` and `$4`. EASy68K's Reset button is deferred with the Hardware panel (20).

3. **The processor is a dialect of the Program, the 68000 by default.**
    - **Choosing it.**
        - A Program picks the 68010 or the 68020 with `opt p=68010` or `opt p=68020`, once, before its first instruction. That is the Devpac spelling vasm also reads, and it extends the `opt` EASy68K users already write.
        - `opt bit` keeps its EASy68K meaning, the 68020's bit-field instructions on a 68000 with 68000 addressing modes, and `p=68020` implies it.
        - The Program carries its processor, as it carries the memory map (15): it travels with the source, a Playground and an exam, and the Build and the language service read it from the assembly.
        - Confirmed by the owner on 2026-10-28. The alternative was a per-Program Setting, as the RISC-V assembly profile is; the processor decides whether the source assembles at all, so it belongs in the source.
    - **One machine with gates.** There is one decoder, encoder, executor and disassembler. Each form and each decoder entry names the first processor that has it. A word outside the dialect is an illegal instruction, or a privilege violation where the manuals say so.
        - These differ per dialect:
            - the reading of an index extension word;
            - the `$FF` branch displacement;
            - the frames and `rte`'s checks;
            - the stack pointers and the SR mask;
            - data alignment;
            - the vector base;
            - the timing tables.
        - The 68000 work is built dialect-ready: a processor column in the opcode table, a dialect parameter in the effective-address decoder, and one frame builder. This decoder must already ignore bits 10–8 of an index word and read `$FF` as a byte displacement of −1, as the 68000 does. Most of the reference suite's indexed `lea` tests set those bits.
    - **The 68010, complete:**
        - `move ccr,<ea>`, `rtd`, `bkpt`, `movec` (SFC, DFC, USP, VBR) and `moves`;
        - a privileged `move sr,<ea>`;
        - VBR;
        - format `$0` frames, and the format `$8` frame for bus and address errors, whose internal words are written as zeros, with `rte` resuming at the stacked PC;
        - `rte`'s format check and the format error;
        - Section 9 timing with loop mode.
    - **The 68020, as a 68EC020**, which keeps the 24-bit bus, the 16 MB memory and the memory map:
        - every user-mode integer instruction except `callm` and `rtm`, and every addressing mode (scaled index, base displacements, memory indirect, `bcc.l`);
        - unaligned data;
        - the SR with T1, T0 and M, and the ISP and MSP with the `$1` throwaway frame;
        - frames `$0` and `$2`;
        - CACR and CAAR stored with no cache behind them;
        - F-line as vector 11.
        - The FPU, the MMU, the cache and `callm`/`rtm` are left out.
    - **Cycles.** The 68010 counts exactly. The 68020 counts the manual's cache case and calls it an estimate, since the manual itself says exact counts are impossible.
    - **`extb.l` and `move ccr,<ea>`** are refused in a 68000 Program. The hint gives the 68000 equivalent (`ext.w` then `ext.l`; `move sr,<ea>`, whose low byte is the CCR) or the `opt p=` line, which the editor offers as a quick fix. The dialect plumbing ships with the 68000 work, with these two instructions as the first members of their dialects, so a saved program migrates in one click from the start. The rest of each dialect arrives in its own batch.
        - Keeping the two in 68000 Programs is possible: 58 opcode words would decode differently from a 68000, and the reference suite tests none of them. But the machine would be one that never existed, and EASy68K, real boards and exam environments reject both instructions.
    - **Verification.** No single-step suite covers the 68010 or the 68020, and the MAME suite contradicts both where they differ from the 68000.
        - A differential harness runs Musashi (MIT, built with the `cc` crate in an opt-in test) beside s68k instruction by instruction.
        - Moira checks the 68010's loop mode and timing.
        - Musashi's 68040 self-checking programs cover the 68020's new instructions.
        - GNU `as -m68010`/`-m68020` checks the encodings.
    - **EASy68K.** A non-68000 Program's S-record does not run in EASy68K, except bit fields under `opt bit`. The Log note that says so is written with the S-record Build output and switched off with it (32).
    - **In the editor:**
        - The Program's processor is shown beside the registers.
        - The System Register file (25) gains VBR, SFC and DFC on the 68010, and ISP, MSP, CACR and CAAR on the 68020.
        - Documentation entries and forms carry their first processor as a tag, the way the privileged tag works, and completions and hovers say so.
        - The Exception vectors region (31) follows VBR.

### Code in memory

4. **Instructions are encoded as EASy68K encodes them, placed in memory, and run from a cache the assembler fills.** Confirmed by the owner.
    - **The image.** The Program's memory image holds the code beside the data. A program can read its own code and change it, and the change runs. `InstructionAccess` is gone.
    - **The cache.** The Interpreter runs from a cache of decoded instructions instead of looking them up in the Program.
        - The cache is kept in 4 KB pages, with one slot per word. A slot holds the decoded instruction (40 bytes today), its size and its source line.
        - A page exists only once code is placed or run in it, so a program of a few thousand instructions takes a few hundred KB.
        - At the Build, the assembler fills the slots with the instructions it has just encoded, so assembled code is never decoded at run time.
        - A fetch is two array reads. Today each step binary-searches the Program's instructions (152 bytes each), which halves throughput between an 8-instruction program and a 20,000-instruction one.
    - **The decoder runs only on a miss:** bytes the assembler did not place as code (data jumped into, a handler written by a Poke) or code the program has changed. Its result is cached until those bytes change again.
    - **Writes** all pass the cache: the program's, a Poke's, Undo's and the trap tasks'.
        - A write to a page with no cache costs one branch. That is where the stack and most data live.
        - A write into a cached page clears the slots of the instructions that cover its bytes. An instruction is at most 10 bytes, so that is at most five slots.
        - Undo writes the old bytes back, and the next fetch decodes them again.
    - **The educational tools are unchanged.** Source lines, Breakpoints, the History and the Call stack find their line through the Program's address map, which does not move when bytes change. A changed line keeps its Location and is marked (27).
    - **A write into code pauses the Run**, replacing today's error.
        - The Core flags a step whose write cleared a valid slot. A Run then pauses after that step, the way a Breakpoint stops it, and names what was overwritten: "The program wrote into its own code at $1008, line 4: `add.w d1,d2`".
        - Run again continues, and the program's change takes effect. A stray store is almost always a bug, so the pause keeps that lesson without forbidding programs that modify themselves on purpose.
        - A Preference, on by default, turns the pause off. A Poke never pauses anything.
    - **The gate.** Throughput must be no lower than today's 10–20 M instructions/s, measured before and after on the plan's loops.

5. **Sizes and encodings follow EASy68K's assembler.**
    - **Passes.** There are two passes and no relaxation. Every size decision depends only on whether each symbol in an operand is defined above it (EASy68K's back reference) and on its value, so both passes agree.
    - **Branches.**
        - An unsized `bra`, `bsr` or `b<cc>` is short when its target is above it, within −128 to 127 and not zero; otherwise it is a word, so a forward branch is always a word.
        - `.s` out of range, or with a zero displacement, is an error.
        - `.l` means word on the 68000, which has no long branch. It means long under `opt p=68020`.
    - **Absolute addresses.** An unsized absolute address is `.w` when it is above and within −32768 to 32767, and `.l` otherwise.
    - **Optimisations.** These are always on in EASy68K and have no option there.
        - `move.l #n,dn` with n in −128 to 127 assembles as `moveq`.
        - `add`, `addi`, `sub`, `subi`, `adda` and `suba` of 1 to 8 assemble as `addq`/`subq`.
        - An immediate written `#n.l` keeps the long form.
    - **Alternative encodings.** Where an instruction has two encodings, the first of EASy68K's forms wins:
        - `cmp #n,dn` is `cmp`, not `cmpi`;
        - `and #n,dn` and `or #n,dn` are `and` and `or`, not `andi` and `ori`;
        - `add #n,dn` beyond 8 is `addi`;
        - `add #n,an` is `adda`.
    - **PC-relative displacements** are measured from their own extension word. That is the instruction's address plus 2, except for `movem` from `d(pc)` and `btst #n,d(pc)`, where another word comes first.
    - **`simhalt` and alignment.** `simhalt` is the four bytes `$FFFF $FFFF`. Instructions and word or long data align to even addresses, and the pad byte is not written.
    - The editor shows what each line assembled as wherever it differs from what was written (26).

6. **Two strictnesses stay, for the learner.**
    - An address forced to `.w` outside −32768 to 32767 stays an error. EASy68K warns and encodes the sign-extended low word.
    - Two placements over the same address stay an error.
    - Core ADR 0001 justified both by "instructions do not live in memory". The reason becomes that each is almost always a mistake.

7. **Running off the program.** Confirmed by the owner.
    - `$FFFF $FFFF` is SIMHALT wherever it is, as in EASy68K.
    - Inside the bytes the program placed, it pauses, as `simhalt` does today.
    - In memory the program never placed, which is where a program that does not end itself runs to, it ends the program with the termination EndOfProgram and reports the address. EASy68K halts quietly there instead, and its Run would pause again at every following pair.
    - Any other bytes run as what they decode to, so jumping into data raises whatever exception its words make.

8. **A decoder and a disassembler are part of the Core.**
    - They are the inverse of the encoder, and they print EASy68K syntax: `MOVE.L D0,(A1)+`, `BRA.S $1004`.
    - The Interpreter decodes cache misses with them, and the editor uses them to show what runs where no source line says (26, 27, 28).

### Exceptions and privilege

9. **Exceptions are always taken, and a vector with no handler ends the program.** Confirmed by the owner.
    - Every 68000 exception pushes its frame and jumps through its vector, apart from those EASy68K also lacks: spurious and uninitialised interrupts, and vectored interrupts.
    - A vector holding an odd address has no handler. On a 68000 the jump would raise an address error, then a second one on that error's own vector, and the CPU would halt.
    - Instead the program ends with the first exception as its cause, as it does today, and the message names the vector: `Division by zero at line 12: vector 5 at $000014 holds no handler`.
    - The unfilled table reads `$FFFFFFFF`, so a program that installs nothing behaves exactly as now.
    - EASy68K's "Enable exceptions" option is off by default and turned on by task 32 #5. It is not reproduced: task 32 #5 is accepted and changes nothing.

10. **Frames, PCs and priorities are the 68000's.**
    - **Frames.** Group 1 and 2 frames are SR then PC, 6 bytes. Address and bus errors push the 14-byte group 0 frame: the access address, the instruction register, and the status word with R/W, I/N and the function code of the real mode.
    - **Stacked PC.**
        - Illegal instructions, line A, line F and privilege violations stack the instruction's own address.
        - Traps, TRAPV, CHK and divide by zero stack the next instruction.
        - Address errors stack what the reference suite records.
    - **Trace** is taken after an instruction that started with T set and raised nothing else.
    - **Double faults.** If exception processing itself faults, because the SSP is odd or a frame is pushed into invalid memory, the CPU halts. The program ends with the termination Halted, a double bus fault.
    - The 68010 and 68020 frames are those dialects' own (3).

11. **Supervisor and user mode.**
    - There are two stack pointers: A7 is the USP or the SSP depending on the S bit. Every write to SR, every exception entry and every `rte` can swap them.
    - Privileged instructions, which raise a privilege violation in user mode: `move <ea>,sr`, `andi`/`ori`/`eori #,sr`, `rte`, `stop`, `reset` and `move usp`.
    - `move sr,<ea>` is not privileged on the 68000, but it is from the 68010 on.
    - `trap #15` works in user mode, as in EASy68K.
    - The SR keeps only the bits a 68000 has (`$A71F`).

12. **`trap #0` to `#14` go through vectors 32 to 46, and `trap #15` is EASy68K's service trap.**
    - `trap #15` is the service trap always, in either mode, and costs no cycles.
    - A task number EASy68K does not know goes through vector 47, as in EASy68K. With no handler there, the program ends as `UnsupportedTrapTask` ends it today.
    - Tasks the editor cannot carry out (printer, serial, network, and the hardware window's, 21) stay refused with their reason.

13. **`reset` and `stop`.**
    - `reset` is privileged and does nothing but take 132 cycles, as in EASy68K.
    - `stop #n` loads SR and waits for an interrupt above the new mask (17).

### Memory

14. **16 MB on a 24-bit bus.** Addresses are masked to 24 bits at the bus; registers and the PC keep 32 bits. The 68020 dialect keeps this bus, as a 68EC020.

15. **EASy68K's memory map, declared with its `memory` directive.**
    - `memory rom|read|protected|invalid start,end` declares a range:
        - ROM ignores writes;
        - read-only raises a bus error on a write;
        - protected raises one on any access from user mode;
        - invalid raises one on any access.
    - Reads are checked against invalid and protected; writes against all four.
    - The trap #15 tasks check their buffers as EASy68K does.
    - The map is part of the Program, so it travels with the source and needs no UI.
    - The debugger is not the program. A Poke, a Testcase's starting memory and the memory view read and write past the map.
    - This declares ranges of the program's own memory. Running a real machine's ROM image is Deferred.

### Interrupts

16. **Seven levels, all autovectored.**
    - A request at level 1 to 7 is latched until it is taken.
    - Between two instructions, the highest pending level above the SR mask is taken through its autovector at `$64`–`$7C`, and the mask rises to that level. Level 7 is taken whatever the mask.
    - Taking an interrupt is an Execution step of its own, so Undo takes it back separately and the History shows it.

17. **`stop` waits.**
    - It loads SR, then the CPU stops until a request above the new mask arrives, and that request is taken at once.
    - A stopped CPU has a status of its own, neither terminated nor paused. Run waits in it without spending the host's time.

18. **The interrupt sources are EASy68K's, without the hardware window.**
    - Automatic timers, set per level by task 32 #6 with an interval in milliseconds.
    - The keyboard (task 62: key down and key up, each at a level) and the mouse (task 60: button down, button up and move), on the Screen.
    - The task 60 and 62 levels and the timer settings are the Core's state, journaled for Undo. The editor reports events and timer firings, and the Core decides what they raise.
    - This amends ADR 0008, under which the Keyboard and Mouse deliver no CPU interrupts.
    - The hardware window's seven IRQ buttons are deferred with it (20).

19. **Timers run on Program time.**
    - The clock is ADR 0010's: host time in an interactive run, virtual time in a Testcase.
        - In a Testcase a stopped CPU advances the virtual clock to the next firing, so timer-driven programs are testable and run instantly.
        - A program that busy-waits for a timer instead of stopping never sees one there, as ADR 0010 already says of a program that polls the clock.
    - Timers fire only while a Run is in progress, since EASy68K stops them on Pause and while tracing. A Step never meets one.
    - A firing reaches the Core between two slices, at most one slice late.

### The hardware window

20. **Deferred by the owner.** EASy68K's hardware window, the Hardware panel this design first proposed, does not come with this work. It has:
    - seven-segment digits at `$E00000`;
    - LEDs at `$E00010`;
    - toggle switches at `$E00012`;
    - push buttons at `$E00014`;
    - seven IRQ buttons;
    - a Reset button that runs the 68000 reset sequence.

    The editor keeps the panels it has, and the memory at `$E00000` is ordinary memory. The design it would follow is kept under Deferred.

21. **Task 32 in part.**
    - #4 returns the version `$00051001`.
    - #5 is accepted and does nothing (9).
    - #6 sets the timers (18).
    - #0, which shows the window, and #1, #2, #3 and #7, which return the device addresses, stay refused with the reason "there is no hardware window", as ADR 0035 asks of what cannot be done faithfully.

22. **Nothing runs the reset sequence.** The `reset` instruction does not run it (13), and its only trigger in EASy68K is the window's Reset button.

### Cycles

23. **The 68000's timing, counted per instruction.**
    - **Source.** Base time plus effective-address time, from section 8 of the 68000 User's Manual with Yacht's corrections. Every value is checked against the reference suite's cycle counts.
    - **Exact data-dependent cases:**
        - MULU and MULS by bit pattern;
        - DIVU and DIVS by Cwik's algorithm;
        - shifts by count;
        - MOVEM per register;
        - Bcc and DBcc taken or not taken.
    - **Exceptions** cost what they cost on the 68000. `trap #15` tasks cost nothing, as in EASy68K.
    - **The counter** is 64 bits and journaled per step. Task 30 clears it and task 31 reads it into D1.L, giving 0 above 32 bits, as in EASy68K.
    - This is the timing model that environment-library decision 9 waited for.
    - EASy68K's own tables differ from the 68000 in a few rows (TRAP is 38 there, and TST is always 4). The 68000 wins.
    - The other dialects count as decision 3 says.

### The editor

24. **Vocabulary.** Confirmed by the owner.
    - **Interrupt** keeps its meaning, a trap #15 task waiting on the host. The Core, the adapter and 46 call sites use it.
    - The 68000's concepts get two new terms:
        - **Exception**: the processor saving PC and SR and continuing at a vector's handler, traps and interrupts included.
        - **IRQ**: an interrupt request at a level from 1 to 7.

25. **SR, USP and SSP are a Register file, "System".**
    - It holds SR, with its own row of Status flags T, S, I2, I1 and I0, then USP and SSP. Each takes Pokes.
    - The CPU file keeps D0–A7, where A7 is the active stack pointer. The CPU's Status flags stay X, N, Z, V and C.
    - The dialects add their control registers to this file (3).
    - This reverses register-files.md's exclusion of the M68K SR, which was inert when that was decided.

26. **What a line assembled as.**
    - The Build hover shows each line's machine code, as it already does for MIPS, RISC-V, Z80 and x86.
    - Where the encoding differs from the source, the hover also shows what the line assembled as: `bra loop` → `bra.s`, `add.l #1,d0` → `addq.l #1,d0`, `move.l #5,d0` → `moveq #5,d0`.

27. **Code is memory in the memory view.**
    - Its bytes show as encoded and take Pokes. Memory-regions decision 13 already says so, and it becomes true.
    - A line whose bytes the program or a Poke has changed is marked in the editor, and its hover disassembles what runs there now.
    - The pause on a write into code is decision 4's.

28. **Exceptions in the Debug tools.**
    - **History.** An instruction that raised an exception shows it in its row: the vector, and the handler's address and label. An IRQ has a row of its own.
    - **Call stack.** It shows each exception frame, pushed at entry and popped by `rte`, named for its vector: `TRAP #3 → trap3_handler`, `IRQ 2 → timer`. Where two causes share a vector the frame is named after the instruction, `CHK2 → handler`, `TRAPEQ → handler`, and its vector is given at the address it was read from as the exception was taken.
    - **Steps with no source line**, such as a handler reached in data or a changed line, show their disassembly.

29. **Stopped.**
    - While the CPU is stopped, Run waits and the status says what it waits for: "Stopped: waiting for an interrupt above level 3".
    - Pause and Stop still work, and so do the key presses and mouse events on the Screen that can wake the CPU.
    - A Step while stopped takes a pending IRQ if there is one. Otherwise it reports that nothing can run.
    - A Testcase whose program stops with no timer to wake it fails with that reason.

30. **The cycle counter** appears above the PC, with the cost of the last step, in each History row, and in the Log when the program exits. Under the 68020 it is marked as an estimate.
    - _Amended 2026-10-29, the owner's call:_ the line moved from under the Register files to above the PC, with its look unchanged, and the last step's cost sits at the line's right end, so that a growing count moves nothing. A Playground shows it only when asked: the `cycles` fence flag, or `showCycles=true` in an embed's link, which the embed builder's Show cycles switch writes.

31. **Memory regions.**
    - `$000`–`$3FF` is the "Exception vectors" region. Its vectors are its data labels, listed by name (Reset SSP, Reset PC, Bus error, …, TRAP #15, Level 7 autovector), so the picker and the hover name them. Under the 68010 and 68020 it starts at VBR.
    - The memory map's ranges are regions of their own: ROM, Read only, Protected and Invalid.
    - One Stack region follows A7. The other stack is not drawn (Deferred).

32. **No Build output File for now.** On 2026-10-28 the owner deferred the Build output's format; a later choice is an ELF or a Build output option. An M68K Build saves no File, presents none to the running program and says nothing of one in the Log, and [ADR 0056](../adr/0056-a-build-saves-the-program-it-links-as-a-file.md)'s consequence that only x86 links a program still holds. The Core can already write EASy68K's S-record, `Program.toSRecord()`, with the memory map's S0 records and the S8 entry address, and it stays available. The editor's S-record Build output is kept in code and switched off: `main.S68` for `main.x68`, saved as text through ADR 0056's host, with the Log note on a 68010 or 68020 Program's (decision 3). [`m68kSRecordOutput`](../../packages/asm-editor/src/lib/languages/M68K/M68KEmulator.svelte.ts) is off until the format is chosen, and its tests turn it on. The ADR first written for it was deleted before it was merged, and its number, 0065, goes to the IRQs.

33. **No S-record Executables for now.** The owner deferred loading an S-record as an Executable with a Listing (the plan's former batch 4). The S-record the Core writes (32) is not read back.

### Verification

34. **The MAME-derived single-step suite is the oracle.**
    - SingleStepTests/m68000 is MIT-licensed: 317,500 tests generated from MAME's microcoded 68000, with user mode, line A/F and STOP included.
    - It checks every instruction's registers, memory, flags, exception frames and cycles.
    - A vendored subset of 50 tests per file runs in the default `cargo test`. The whole suite runs from a fetched copy behind `--ignored` and in a scheduled CI job.
    - Tom Harte's set has no licence and known-wrong ASR and DIVU data, so it is at most a local second opinion.
    - The dialects are checked as decision 3 says.

35. **Encoder and decoder checks.**
    - Every form of the instruction table's export is assembled, encoded, decoded and compared, at every size and with one operand per mode.
    - An opt-in test compares each encoding with GNU `as -m68000` for m68k, one instruction at a time, and checks the decoder against `objdump`. `objdump` decodes the 68020's index words whatever processor is selected, so that check uses canonical encodings only.
    - Musashi's sixty self-checking 68000 programs (MIT) run as integration tests.

### Documentation and completion

36. **The Documentation panel, completion and hovers follow the program's processor.** The owner's call, 2026-10-30.
    - In the Workbench they leave out what a later processor brought than the one the program chooses: instructions, the rows of their forms and the privilege only a later processor gives one (`move sr,<ea>`'s "Privileged on the 68010 and 68020"), Chapter sections such as the exceptions page's "On the 68020", addressing modes, the panel's search results, and completion's mnemonics, sizes, modes and control registers. `opt bit` or `opt p=68020` brings the bit fields.
    - A hover of an instruction the program cannot write in any form, `extb` in a 68000 program, keeps its whole document, which says the processor it needs. Hovers followed the processor from the same day, once the owner saw the 68010's privilege in a 68000 program's hover.
    - The site's pages show everything, tagged, and so does a host with no live analysis of the program, whose processor is unknown: a Playground, a lecture or an embed.
    - `opt p=` stays the only choice of processor (3). A "68000 · 68010 · 68020" switch in the panel's header, to look ahead without editing the code, is built and kept off behind a code flag, `m68kProcessorSwitch` in [`m68kDialect.ts`](../../packages/asm-editor/src/lib/languages/M68K/m68kDialect.ts).
    - s68k's assembly says the processor while the code has an error too (the Core's ADR 0011, amendment of 2026-10-30), and the live analysis carries it to all three.

## Glossary changes

**Repository CONTEXT.md**

- New terms: **Exception**, **IRQ**, **Vector**, **Processor dialect**.
- **Interrupt** gains "Distinct from an IRQ".
- **Memory region** gains the exception vectors and the memory map's ranges.
- **Status flag** gains the System file's T, S and I2–I0.

**The Core's CONTEXT.md**

- **Interpreter** now runs from the decode cache.
- **Runtime error** no longer always ends the program.
- New terms: **Exception**, **Vector**, **Handler**, **IRQ**, **Memory map**, **Stopped**, **Processor dialect**, **Code write**.
- **Termination** gains Halted.

## ADRs to write once confirmed

- **Core 0006:** instructions are encoded, placed in memory and run from a cache the assembler fills. Amends 0001's four-byte, `.w` and overlap consequences (decisions 4, 5, 6).
- **Core 0007:** the machine follows EASy68K's simulator, and the 68000 where EASy68K is wrong (1, 2, 10).
- **Core 0008:** exceptions are always taken, and a vector with no handler ends the program (9).
- **Core 0009:** SIMHALT, and running into memory the program never placed ends it (7).
- **Core 0010:** the MAME-derived single-step suite is the conformance oracle (34).
- **Core 0011:** the processor is a dialect the source chooses with `opt p=` (3).
- **Editor 0065:** M68K devices deliver IRQs (18, 19). Amends 0008.

## Deferred

- **The Hardware panel**, EASy68K's hardware window (20–22).
    - **Devices:** seven-segment digits (digit k at `$E00000+2k`, bit 0 segment a through bit 7 the point), LEDs at `$E00010`, toggle switches at `$E00012` (1 is up) and push buttons at `$E00014` (active low).
    - **Memory behaviour:** the devices are plain memory that the program reads and writes, and they are exempt from the memory map. The panel would read its outputs at each refresh, so Undo restores them, and would write switches and buttons as live input.
    - **Its other parts:** seven IRQ buttons, the Reset button (S set, T clear, mask 7, SSP from `$0`, PC from `$4`, as a step of its own), task 32's #0, #1, #2, #3 and #7, and EASy68K's dialog for moving the addresses.
- **ROM images.** Running a real machine's ROM, for example a boot ROM read through the reset vectors, is beyond this work. The owner would like it later.
- **The Build output's format** (32), deferred by the owner on 2026-10-28: an ELF, or a Build output option. EASy68K's S-record needs only [`m68kSRecordOutput`](../../packages/asm-editor/src/lib/languages/M68K/M68KEmulator.svelte.ts) turned on.
- **S-record Executables** (33): a `.S68` File opening in the Hex editor and as a Listing, loaded by a Build, with address Breakpoints. Raw images and m68k ELF go with it, and so does the **Patch** of an M68K Listing line, which the encoder makes possible.
- **Macros, conditional assembly and EASy68K's structured control** (`if … endi`, `repeat`). These are not part of the machine, but EASy68K's own interrupt and hardware samples (`mouseWindowSize.X68`, `clockDigital.X68`) use them and cannot be built until they exist. They are a natural next design.
- **Testcases for the new state.** Presetting or checking SR, USP, SSP, the dialects' control registers and cycles needs work, because Testcases know only the CPU file's names. So does scripting IRQs.
- **Both stacks in the memory view** at once.
- **Pseudocode for M68K.** Ghidra ships a 68000-family spec (the 68020 variant, 68 KB compiled), but it lifts `trap #n` with no inputs, so the decompiler would drop the setup of every trap #15 call as dead code. It needs a fix-up before it is useful.
- **Vectored interrupts and the spurious interrupt**, which EASy68K lacks too.
- **The rest of the 68020:** the 68881/68882 FPU, the MMU, the instruction cache, `callm`/`rtm`, a full 32-bit bus and real bus-fault continuation.
