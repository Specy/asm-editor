# Memory-mapped input conventions for MARS and RARS

Gathered 2026-11-03 for decision 2 of [asmOS portability](../design/asmos-portability.md): one editor extension to MARS 4.5 and RARS 1.6, a memory-mapped block of input registers (mouse position and buttons, key down and up including arrows), placed like the **Synth** at 0xFFFF0100. It collects the conventions of other teaching simulators, hardware and operating systems, this repository's own models, the address map of 0xFFFF0000 to 0xFFFFFFFF, and the questions the design grill must settle. Nothing was built or run. This is a fact base, not a set of decisions; the last section, "Leanings", is opinion and is kept apart.

## Sources and citation scheme

- **MARS 4.5**: `Mars4_5.jar` from the GitHub release `v.4.5.1` of https://github.com/dpetersanderson/MARS, which carries its `.java` sources. Prefix `MARS/` = `mars/` inside the jar. The four tools cited below differ from the repository's `main` (ac3d34e, 2025-12-20) only in line endings and one Latin-1 comment, so the line numbers hold for both once carriage returns are stripped. `DigitalLabSim.java` is Latin-1.
- **RARS 1.6**: tag `v1.6` (7acf325, 2023-02-26) of https://github.com/TheThirdOne/rars. Prefix `RARS/` = `src/rars/`. `src/rars/tools` is unchanged from the tag to `master` (b0c5cd1).
- **This repository**: paths from the repository root. The Cores are the submodules `packages/mips` and `packages/risc-v`.
- **asmOS sources**: `.cache/asmos-source/`, the unpacked archive (git-ignored, `.gitignore:10`).
- **Other simulators, Part A3 to A9, and Part B**: read by a second agent from shallow clones and official PDFs, at these commits (accessed 2026-11-03): Ripes 1ee5646, QtRVSim a3a03ca, QtMips 521544d, TIC-80 ed19a43, Saturn db965b6, Creator 7dc95b9, kvakil/venus 60b0d07, ThaumicMekanism/venus bf1b1f6, Jupiter c51efb6, EduMIPS64 c9830e6, MARS Red d9f5df2, Linux master 6628e7d4, QEMU master 74f7bf4c. I re-read Ripes' `iodpad.cpp`, the Pitt keypad tool and TIC-80's `tic80.h` myself; the rest is as that agent cited it.

## At a glance

- Stock MARS and RARS have no mouse and no key state. Their only keyboard is a **single-slot character register**, fed from Java's `keyTyped`, so arrows, modifiers and key-up never reach a program (MARS/tools/KeyboardAndDisplaySimulator.java:799-820).
- Key state and a mouse in MARS-lineage tools do exist, outside the stock distribution:
    - The University of Pittsburgh's **Keypad and LED Display Simulator** has key held, pressed and released registers and mouse registers at 0xFFFF0040 to 0xFFFF0068, latched once per frame. It takes over the whole 0xFFFF0000 page.
    - **Saturn** keeps a 128-byte ASCII key-held table at 0xFFFF0080.
- This editor already tracks key state, arrows included, and the Mouse on MIPS and RISC-V. The Screen widget feeds both on every non-x86 Target. Nothing maps them into memory.
- On MIPS and RISC-V, **Escape never reaches the program from the Screen**: it is the key that releases the Screen's focus.
- The Cores' memory observers run **after** a read has returned its value. A register's value must therefore be in memory before the program reads it, and the adapter reacts to the read afterwards. The MARS receiver already works this way.
- The Cores do not journal the adapter's register writes. Pushed state therefore stays live across Undo, as [ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md) asks for key state.
- Between the stock tools and the Synth, these ranges are free: 0xFFFF0028 to 0xFFFF00FF, and 0xFFFF0300 to 0xFFFF7FFF. Mars Bot and ScavengerHunt use 0xFFFF8000 and up.

---

# A. Teaching simulators and boards

## A1. MARS 4.5

### Keyboard and Display MMIO Simulator

| Address    | Register            | Bits                                                                                                                                        |
| ---------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 0xFFFF0000 | Receiver control    | bit 0 Ready, bit 1 Interrupt enable                                                                                                         |
| 0xFFFF0004 | Receiver data       | low byte: the typed character                                                                                                               |
| 0xFFFF0008 | Transmitter control | bit 0 Ready, bit 1 Interrupt enable                                                                                                         |
| 0xFFFF000C | Transmitter data    | low byte: the character to display; 12 (form feed) clears; 7 (bell) moves the cursor to X in bits 20-31 and Y in bits 8-19 of the same word |

Sources: MARS/tools/KeyboardAndDisplaySimulator.java:86-89, 164-167, 283-292.

- **Addresses are relative to `Memory.memoryMapBaseAddress`**, 0xFFFF0000 in the default configuration (MARS/tools/KeyboardAndDisplaySimulator.java:164).
- **Input is one slot and is overwritten.**
    - A typed character (Java `keyTyped`) writes `getKeyChar() & 0xFF` into the data word and sets Ready, whether or not the previous character was read (:799-803).
    - `keyPressed` and `keyReleased` are empty (:814-820). So keys that type nothing (arrows, Shift, function keys) never reach the program, and neither does any key-up.
- **A read of the data register clears Ready** (:242-243). The tool watches only reads of 0xFFFF0004 and writes of 0xFFFF000C (:186-192).
- **Interrupts**:
    - The keyboard interrupt is requested when the receiver's interrupt-enable bit is 1, Status bit 1 (EXL) is 0 and Status bit 0 (IE) is 1. It sets `Simulator.externalInterruptingDevice = 0x40` (:803-809).
    - MARS encodes the device in the Cause value: 0x40 becomes Cause bit 8 (keyboard) and 0x80 bit 9 (display) (MARS/simulator/Exceptions.java:40-54).
    - The request is one volatile slot, taken before the next instruction (MARS/simulator/Simulator.java:334-337).
- **Transmitter delay** is simulated in instruction counts (:79-94, 259-279). This editor's transmitter is never busy ([ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md), Deviations).

### Digital Lab Sim

| Address    | Direction | Meaning                                                                                                                |
| ---------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0xFFFF0010 | write     | right seven-segment digit, bit 0 = segment a … bit 7 = point                                                           |
| 0xFFFF0011 | write     | left seven-segment digit                                                                                               |
| 0xFFFF0012 | write     | hex keypad: the row to scan (bits 0-3, one-hot) and keypad interrupt enable (bit 7)                                    |
| 0xFFFF0013 | write     | non-zero enables the counter interrupt                                                                                 |
| 0xFFFF0014 | read      | the pressed key in the scanned row: column bit in the high nibble, row bit in the low nibble (0x11 … 0x88), 0 for none |

Sources: MARS/tools/DigitalLabSim.java:28-32, 127-141.

- **The keypad is a scanned 4×4 matrix, read as state.** The program writes a row and reads back whether the pressed key is in it (:273-286).
- **A key is a toggle.** A click presses it and stays pressed; the next click on any key releases it (:318-333). Only one key can be down.
- **Interrupts**: a keypad press raises external code 0x200 (Cause bit 11) when keypad interrupts are on (:326-331). The counter raises 0x100 (Cause bit 10) after every 30 observed instruction fetches (:82-91, 140-141). Both check only Status EXL, not IE.

### Bitmap Display

- **Base address choices**: 0x10000000 (global data), 0x10008000 ($gp), 0x10010000 (static data, the default), 0x10040000 (heap), 0xFFFF0000 (memory map) (MARS/tools/BitmapDisplay.java:402-413).
- **Sizes**: display width and height 64 to 1024 pixels, unit 1 to 32, powers of two (:64-70).
- **A display at the memory-map base overlays every device in that page**: the keyboard and display registers are its first four pixels. The tool caps a kernel-range grid at -4 (0xFFFFFFFC) (:137-145).

### Mars Bot and ScavengerHunt

- **Mars Bot** uses absolute addresses that do not follow the memory-map base (MARS/tools/MarsBot.java:17-21, 263):
    - 0xFFFF8010 heading, 0xFFFF8020 leave track, 0xFFFF8030 X, 0xFFFF8040 Y, 0xFFFF8050 move;
    - it observes 0xFFFF8000 to 0xFFFF8060, and writes X and Y with `setWord` (:112-113).
- **ScavengerHunt** is a classroom game tool in the same Tools menu. It uses 0xFFFFE000 to 0xFFFFE00C for its administration words and per-player space from 0xFFFF8000, observing 0xFFFF8000 to 0xFFFFFFF0 (MARS/tools/ScavengerHunt.java:47-57, 454).

### The memory-mapped segment itself

- **Size**: 16 tables of 4 KB, so 64 KB from 0xFFFF0000; the default configuration's limit is 0xFFFFFFFF (MARS/mips/hardware/Memory.java:132, 164; MARS/mips/hardware/MemoryConfigurations.java:93-100).
- **Compact configurations** move the base to 0x7F00 with a limit of 0x7FFF, i.e. 256 bytes (MemoryConfigurations.java:118-125, 143). This editor's Cores run only the default configuration.

## A2. RARS 1.6

- **Keyboard and Display MMIO**: the same four registers and the same single-slot, `keyTyped`-only input as MARS (RARS/tools/KeyboardAndDisplaySimulator.java:93-96, 171-174, 770-787).
- **Interrupts go through `InterruptController`**:
    - A typed character with the interrupt-enable bit set calls `registerExternalInterrupt(0x40)`, and the display uses 0x80 (RARS/tools/KeyboardAndDisplaySimulator.java:131-132, 272, 774-776).
    - Only one external request can be pending; a second is refused (RARS/riscv/hardware/InterruptController.java:36-44).
    - The simulator takes it when `ustatus.UIE` is set and `uie` bit 8 is set. It writes `ucause` = 0x80000008, `uepc` = PC and `utval` = the device code, then jumps through `utvec`, which can be vectored (RARS/simulator/Simulator.java:292-311, 403-413; RARS/riscv/hardware/ControlAndStatusRegisterFile.java:43-45; RARS/SimulationException.java:16-18).
- **Timer Tool** (RARS only):
    - `time` is a 64-bit count of milliseconds at 0xFFFF0018 to 0xFFFF001F. It is wall-clock time since the tool started, paused with the tool (RARS/tools/TimerTool.java:53, 61-63, 154-172).
    - `timecmp` is 64 bits at 0xFFFF0020 to 0xFFFF0027 (:54, 198-221).
    - When `time >= timecmp`, the tool calls `registerTimerInterrupt(0x10)` once per write of `timecmp` (:246-251).
    - The help text gives the upper word of `time` as 0xFFFF001B, a typo for 0xFFFF001C (:317).
- **Digital Lab Sim**: the same five addresses as MARS (RARS/tools/DigitalLabSim.java:46-50). The keypad raises external interrupt 0x200 (:349-353). The counter raises a **timer** interrupt with value 0x100 (:82-89).
- **Bitmap Display**: the same base choices as MARS, 0xFFFF0000 included (RARS/tools/BitmapDisplay.java:402-412).
- **Memory map**: base 0xFFFF0000, limit 0xFFFFFFFF, 16 × 4 KB (RARS/riscv/hardware/MemoryConfigurations.java:88, 93; RARS/riscv/hardware/Memory.java:158, 189).
- **No other RARS 1.6 tool maps memory.** The tools are BHT simulator, Bitmap Display, Cache simulator, Digital Lab Sim, Floating-point representation, Instruction counter, Instruction memory dump, Instruction statistics, Keyboard and Display, Memory reference visualization and Timer Tool (RARS/tools/). The memory visualization only observes. There is no Mars Bot.

## A3. SPIM and QtSpim

- **The same four registers at 0xFFFF0000 to 0xFFFF000C**, bit 0 Ready and bit 1 interrupt enable, word-wide, unused bits 0 (SPIM CPU/mem.h:108-127; Larus, H&P Appendix A §A.8, Fig. A.8.1, https://pages.cs.wisc.edu/~larus/HP_AppA.pdf). QtSpim builds from the same `CPU/mem.cpp`.
- **Interrupt levels**: the receiver uses level 3, which sets Cause bit 11 (IP3), and the transmitter level 2, bit 10 (IP2) (mem.h:118, 127; CPU/inst.h:163-172).
    - These are **not** the bits MARS uses (8 and 9).
    - Enabling the interrupt while Ready is already set raises it at once (mem.cpp:585-599).
- **Input** is one byte, ASCII, with no key-up. It is checked every 100 instructions and is overwritten if unread (spim.h:183-193; mem.cpp:522-536, 623-627).
- **Off by default**: memory-mapped I/O needs `-mapped_io` (§A.8).

## A4. The Pitt "Keypad and LED Display Simulator" (a MARS tool outside the stock jar)

- **Origin**:
    - Pitt CS 0447 used "the modified MARS with the LED and Keypad simulator" in spring 2013 (https://people.cs.pitt.edu/~jmisurda/teaching/cs447/2134/cs0447-2134-lab4.htm, fetched with certificate checks off).
    - The copy read here is "Version 2" with an "enhanced mode", in https://github.com/CaptainChicky/Java-MIPS-Assembler at `mars/tools/KeypadAndLEDDisplaySimulator.java` (2026 commit, `@author CC`, line 18). Its original author is unverified.
- **Classic mode**:
    - It **replaces** the keyboard registers: 0xFFFF0000 is a display control register and 0xFFFF0004 `DISPLAY_KEYS` (:24-30).
    - `DISPLAY_KEYS` returns level state as bit flags for the arrows and Z, X, C, B (:122-124).
- **Enhanced mode input registers** (:69-79, 325-356):

| Address    | Register         | Semantics                                           |
| ---------- | ---------------- | --------------------------------------------------- |
| 0xFFFF0040 | `KEY_HELD`       | write a key code, then read 1 or 0                  |
| 0xFFFF0044 | `KEY_PRESSED`    | same, 1 only in the frame the key went down         |
| 0xFFFF0048 | `KEY_RELEASED`   | same, 1 only in the frame the key came up           |
| 0xFFFF004C | `MOUSE_X`        | 0 to 127, or -1 when the pointer is off the display |
| 0xFFFF0050 | `MOUSE_Y`        | likewise                                            |
| 0xFFFF0054 | `MOUSE_HELD`     | button bit flags                                    |
| 0xFFFF0058 | `MOUSE_PRESSED`  | buttons that went down this frame                   |
| 0xFFFF005C | `MOUSE_RELEASED` | buttons that came up this frame                     |
| 0xFFFF0060 | `MOUSE_WHEEL_X`  | signed delta, positive is right                     |
| 0xFFFF0064 | `MOUSE_WHEEL_Y`  | signed delta, positive is up                        |
| 0xFFFF0068 | `MOUSE_VISIBLE`  | read/write                                          |

- **Codes** are Java `KeyEvent.getKeyCode()` values (:1163-1171). A game's include file lists them as A = 65, Left/Up/Right/Down = 37 to 40, Space = 32, Enter = 10 (`display_constants_2254_0205.asm`:64-236, below).
- **Frame-latched**:
    - The tool pushes the mouse words into memory and clears the pressed and released sets and the wheel only when the program finishes a frame by writing `DISPLAY_SYNC` (:1454-1462, 1520-1536).
    - "Pressed" therefore means "since the previous frame". A tap inside one frame is still seen.
- **Users**: a game's include file names the registers and codes (https://github.com/TommyWritesCode/MIPS-Breakout-Game, `display_constants_2254_0205.asm`).

## A5. Saturn (MIPS and RISC-V IDE)

Source: https://github.com/1whatleytay/saturn @db965b6, src-backend/src/keyboard.rs.

- **Character queue**:
    - 0xFFFF0000 reads 1 when the key queue is not empty; 0xFFFF0004 pops a key as ASCII (:6, 59-78).
    - The pop is `Vec::pop`, so the **most recent** key comes first. An empty queue returns the last key again (:33-39).
- **Key-held table**: 0xFFFF0080 to 0xFFFF00FF, one byte per ASCII code, 1 while held (:7, 21-31, 79-88). Writes are errors (:94).
- **Mapping**: single-character keys are lowercased and Enter is `\n`. Everything else, **arrows included**, is dropped (src/components/console/BitmapTab.vue:212-227).

## A6. Ripes

Source: https://github.com/mortbopet/Ripes @1ee5646; docs/mmio.md.

- **Peripherals**: LED matrix, switches, D-pad, real-time clock, screen. No keyboard or mouse (src/io/ioregistry.h:23-44).
- **Placement**: they start at 0xF0000000, configurable, and sit back to back in creation order (src/ripessettings.cpp:34; src/io/iomanager.cpp:37-59).
- **D-pad**: four 32-bit read-only registers, UP 0x0, DOWN 0x4, LEFT 0x8, RIGHT 0xC (src/io/iodpad.cpp:57, 73).
    - A register reads 1 while the button is held **or** if it was pressed since that register was last read. **Reading clears the captured press** (iodpad.cpp:97-107, 143-168).
    - This edge capture was added on 2026-08-18; before that the D-pad was level only (agent's reading of the file's commit history).
- **Generated C header `ripes_system.h`** (iomanager.cpp:165-233; iobase.cpp:16-26):
    - For each peripheral it defines `<NAME>_BASE` and `<NAME>_SIZE`, and for each exported register `<NAME>_<REG>` and `<NAME>_<REG>_OFFSET`, e.g. `D_PAD_0_UP`.
    - The C compile includes it (src/ccmanager.cpp:109-112), and assembly can use the same symbols.
    - This is the closest precedent for `<sim.h>` naming registers from a device model.
- **Pull model**: Ripes peripherals compute a value on read (`ioRead`), unlike MARS's push model (C9).

## A7. QtRVSim and QtMips

Source: https://github.com/cvut/qtrvsim @a3a03ca.

- **Serial port**: 0xFFFFC000, mirrored at 0xFFFF0000 for SPIM and MARS programs (src/machine/machine.cpp:142-143). RX_ST, RX_DATA, TX_ST and TX_DATA mirror the MARS registers.
    - RX interrupt is `mip`/`mie` bit 16 and TX bit 17, level-triggered while IE and Ready (serialport.cpp:14-29, 71-97, 110-124).
- **Knobs and LEDs**: 0xFFFFC100 to 0xFFFFC1FF. `KNOBS_8BIT` at +0x024 holds three 0-255 knob values (bits 0-23) and three push flags (bits 24-26), as level state with no interrupt (src/machine/memory/backend/peripspiled.cpp:7-13, 115-154).
    - The "direct keyboard" registers are declared but never updated (peripspiled.h:55-56).
- **No key-state or mouse peripheral.**
- QtMips (@521544d) has the same map (README.md:142-185).

## A8. CPUlator and the DE1-SoC and DE10-Lite computers

Sources: https://cpulator.01xz.net/doc/; FPGAcademy's "DE1-SoC Computer" manuals for Nios II, ARM and Nios V, and the DE10-Lite one (https://fpgacademy.org/Downloads/).

- **Systems**:
    - DE1-SoC with Nios II, ARMv7, or RV32 (Nios V, since CPUlator v831, 2024-03-07).
    - DE10-Lite with Nios II only.
- **Parallel port layout** (Nios II manual §3.1, PDF pp. 10-11):
    - Base+0 data, +4 direction, +8 interrupt mask, +C **edge capture**.
    - An edge-capture bit is set on a 0→1 change and stays set until software **writes 1 to it**, which also clears the interrupt.
- **DE1-SoC registers** (Nios II §2.3.4 and §4.5; ARM manual Fig. 22; Nios V Fig. 20):
    - Switches 0xFF200040.
    - KEY pushbuttons: data 0xFF200050, mask 0xFF200058, edge capture 0xFF20005C.
    - PS/2 port at 0xFF200100:
        - Data register: bits 31-16 RAVAIL, bit 15 RVALID, bits 7-0 a byte. A read with RVALID pops a **256-byte FIFO**. A write sends a command byte.
        - Control register at 0xFF200104: RE (bit 0) enables an interrupt raised while RAVAIL > 0, RI (bit 8) shows it pending, CE (bit 10) flags a command error.
    - A second PS/2 port at 0xFF200108/0xFF20010C is meant for a mouse.
    - Linux's driver agrees (drivers/input/serio/altera_ps2.c:37-38, 64, 72).
- **Interrupt numbers**:

| Processor                | KEY | PS/2 | PS/2 dual | Source            |
| ------------------------ | --- | ---- | --------- | ----------------- |
| Nios II                  | 1   | 7    | 23        | Table 1, PDF p.10 |
| ARM (GIC IDs)            | 73  | 79   | 89        | Table 1, PDF p.13 |
| Nios V (`mie` bit = IRQ) | 18  | 22   | 23        | Table 1, PDF p.11 |

- **CPUlator's PS/2 panel** sends make and break codes for typed keys, or 3-byte and 4-byte (IntelliMouse) mouse packets.
    - Which scan code set it uses is not stated (unverified).
- **DE10-Lite**: no PS/2. 0xFF200100 is an Arduino GPIO port there.

## A9. Simulators with no key-state or mouse peripheral

- **Creator** (creatorsim @7dc95b9): a command-driven console device at 0xF0000000 to 0xF000000F that works like a syscall (architecture/RISCV/RV32IMFD.yml:4154-4171; src/core/executor/DeviceManager.mts:222-336). MIPS32 has no devices.
- **Venus** (both forks) and **Jupiter**: no memory-mapped peripherals found; console I/O only.
- **EduMIPS64**: I/O through `SYSCALL` 0 to 5 only (docs/user/en/src/instructions.rst:520-600).
- **MARS Red**: the stock MARS tool set.
- **RARS forks**: a GitHub code search for mouse or key-state tools under `rars/tools` found none.
- **Unverified**: WebRISC-V (no source found; reportedly syscalls and a pop-up console), BRISC-V.

## A10. Summary

| Simulator / board          | Where                                       | Keys                                                       | Mouse                               | Model                               |
| -------------------------- | ------------------------------------------- | ---------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| MARS 4.5, RARS 1.6, SPIM   | 0xFFFF0000-0xFFFF000F                       | typed ASCII, one slot                                      | none                                | push; read clears Ready; interrupts |
| MARS/RARS Digital Lab Sim  | 0xFFFF0010-0xFFFF0014                       | 4×4 hex keypad, row scan, toggle keys                      | none                                | state; interrupt on press           |
| Pitt Keypad and LED (MARS) | 0xFFFF0004 (classic), 0xFFFF0040-0x68       | Java VK codes: held, pressed, released per frame           | x, y, held/pressed/released, wheel  | push, latched at frame sync         |
| Saturn                     | 0xFFFF0000-0x07, 0xFFFF0080-0xFF            | ASCII queue (LIFO) + 128-byte held table, no arrows        | none                                | queue + state                       |
| Ripes                      | from 0xF0000000                             | D-pad, 4 registers                                         | none                                | state with read-to-clear capture    |
| QtRVSim / QtMips           | 0xFFFFC000 (+0xFFFF0000 mirror), 0xFFFFC100 | serial characters; knobs                                   | none                                | state; serial interrupts            |
| DE1-SoC (CPUlator)         | 0xFF200050, 0xFF200100                      | KEY with edge capture; PS/2 byte FIFO (scan codes)         | PS/2 packets via the FIFO           | FIFO + state + write-1-to-clear     |
| EASy68K (here: M68K)       | trap #15 tasks 7, 19, 61; $E00012/$E00014   | VK codes: held, last down, last up; switches; push buttons | state, last-down, last-up snapshots | state, live                         |
| This editor's Z80 Port map | ports 0x30-0x33, 0x40-0x43                  | EASy68K codes                                              | three views + event count           | state, pulled at the `in`           |
| This editor's x86          | `/dev/input` (evdev)                        | `KEY_*` events + `EVIOCGKEY` state                         | tablet 0-32767 + wheel              | queue + state                       |

---

# B. Hardware and OS conventions

## B1. PS/2

Sources: Chapweske (archived), https://web.archive.org/web/20110111153818/http://www.computer-engineering.org/ps2keyboard , `…/ps2keyboard/scancodes2.html` (archived 20101227175828) and `…/ps2mouse/` (archived 20101223225414); OSDev "PS/2 Keyboard" and "PS/2 Mouse" (archived 2024-12-31 and 2025-01-22).

- **Scan code sets**:
    - Set 2 is the default and the only one modern keyboards guarantee; the 8042 controller normally translates it to set 1.
    - Set 1 breaks are make + 0x80.
    - Set 3 alone has per-key make/release/typematic modes.
- **Set 2 key sequences**:
    - A key sends its make code on press and on each typematic repeat, and `F0` + make on release. Extended keys add an `E0` prefix.
    - Examples: A = `1C`/`F0 1C`, Enter = `5A`, Esc = `76`, Left Shift = `12`, Up = `E0 75`/`E0 F0 75`, Left `E0 6B`, Down `E0 72`, Right `E0 74`.
    - Pause is `E1 14 77 E1 F0 14 F0 77` with no break.
    - There is no relation between make codes and ASCII.
- **Mouse, 3-byte packet**:
    - Byte 0, bit 7 to bit 0: Y overflow, X overflow, Y sign, X sign, always 1, middle, right, left. Bytes 1 and 2 are X and Y movement.
    - X and Y are 9-bit two's complement deltas since the last packet.
    - Positive Y is up. The pages do not say so outright: Linux negates Y for `REL_Y` (drivers/input/mouse/psmouse-base.c:130-138) and QEMU builds Y from host coordinates the same way (hw/input/ps2.c:810-814).
- **IntelliMouse**:
    - The sample-rate sequence 200, 100, 80 gives ID 3 and a 4th byte, Z, from -8 to +7.
    - The sequence 200, 200, 80 gives ID 4, with buttons 4 and 5 in that byte.
    - Z's sign conflicts between sources: Chapweske says wheel up increments it, while Linux and QEMU treat positive as wheel down (psmouse-base.c:165; ps2.c:819-824).

## B2. USB HID boot protocol

Sources: HID 1.11, https://www.usb.org/sites/default/files/hid1_11.pdf (Appendix B, printed pp. 59-61; Appendix C, p. 62); HID Usage Tables 1.5, https://usb.org/sites/default/files/hut1_5.pdf (§10, PDF pp. 90-96; §4.2, p. 39).

- **Boot keyboard input report**, 8 bytes:
    - Byte 0 holds the modifier bits for usages 0xE0 to 0xE7: bit 0 LeftCtrl, 1 LeftShift, 2 LeftAlt, 3 LeftGUI, 4 RightCtrl, 5 RightShift, 6 RightAlt, 7 RightGUI.
    - Byte 1 is reserved; bytes 2 to 7 hold up to six usage IDs of keys **currently pressed**.
- **It is a state report, not events**:
    - Order in the array has no meaning, and the host finds presses and releases by comparing consecutive reports.
    - More than six keys fills the array with ErrorRollOver (0x01).
- **Usage IDs, page 0x07**:
    - 0x04 a … 0x1D z, 0x1E 1 … 0x27 0.
    - 0x28 Return, 0x29 Escape, 0x2A Backspace, 0x2B Tab, 0x2C Space.
    - 0x4F Right, 0x50 Left, 0x51 Down, 0x52 Up.
    - The modifiers 0xE0 to 0xE7 are the largest standard keyboard usages, so one byte holds every code.
- **Boot mouse report**:
    - Byte 0 bits 0-2 are buttons 1-3; bytes 1 and 2 are **relative** signed X and Y, -127 to 127.
    - A wheel is not part of the boot report.
    - X grows left to right and Y grows "far to near", i.e. downward.
- **Browsers use HID names**: the browser's `KeyboardEvent.code` values follow USB HID naming, are "based only on the key's physical location", and the spec calls `code` "a platform-independent 'scancode'". The spec has no table of usage IDs (W3C Recommendation, 22 April 2025, https://www.w3.org/TR/uievents-code/, §1, §3.1.1, Privacy).

## B3. Linux evdev and virtio-input

Sources: Linux @6628e7d4, Documentation/input/input.rst and event-codes.rst, include/uapi/linux/input.h and input-event-codes.h; virtio 1.2 cs01 §5.8, https://docs.oasis-open.org/virtio/virtio/v1.2/cs01/virtio-v1.2-cs01.html, and include/uapi/linux/virtio_input.h:32-74.

- **`struct input_event`**: time, `__u16 type`, `__u16 code`, `__s32 value` (input.h:28-47).
    - `EV_KEY` values are 0 (release), 1 (press) and 2 (autorepeat).
    - `EV_REL` values are deltas and `EV_ABS` values new absolute positions (input.rst:256-279; event-codes.rst:120-127).
- **Both a queue and state**:
    - Events are emitted only on change, and the current state can be queried with `EVIOCG*`, e.g. `EVIOCGKEY` (event-codes.rst:18-22; input.h:173).
    - `SYN_REPORT` closes a group of events.
    - `SYN_DROPPED` means the reader's queue overflowed: skip to the next report and re-query the state (event-codes.rst:97-117).
- **Codes**:
    - `KEY_ESC` 1, `KEY_ENTER` 28, `KEY_A` 30, `KEY_LEFTSHIFT` 42, `KEY_SPACE` 57, `KEY_UP` 103, `KEY_LEFT` 105, `KEY_RIGHT` 106, `KEY_DOWN` 108; `KEY_MAX` 0x2FF.
    - `BTN_LEFT` 0x110, `BTN_RIGHT` 0x111, `BTN_MIDDLE` 0x112.
    - `REL_X` 0, `REL_Y` 1, `REL_WHEEL` 8, `REL_WHEEL_HI_RES` 0x0B (120 per notch, preferred); `ABS_X` 0, `ABS_Y` 1, with `input_absinfo` min/max (input-event-codes.h:77-184, 357-361, 844-872; input.h:93-100).
- **virtio-input**:
    - Events are `{ le16 type; le16 code; le32 value }` with evdev meanings, on an event queue (§5.8.6).
    - Configuration is read by writing `select`/`subsel` and reading a union back (`ID_NAME`, `EV_BITS` per type, `ABS_INFO` per axis); size 0 means unsupported (§5.8.4-5.8.5).
    - A device short of buffers should drop whole `SYN`-terminated groups, not single events (§5.8.6.2).
- **virtio-mmio identifies itself**: a magic word at offset 0x000, 0x74726976 ("virt" little-endian), then version and device ID registers (virtio 1.2 §4.2.2; not re-read for this document).

## B4. Classic memory-mapped game input: state against queue

- **Amiga** (Hardware Reference Manual, Amiga Developer CD 2.1, Hardware_Manual_guide nodes 0038, 0173-0182, 018B, 010A, 010C):
    - **Mouse position**: `JOY0DAT` $DFF00A and `JOY1DAT` $DFF00C each hold two **8-bit wrapping counters** (Y high byte, X low byte). Software reads them at least once a frame and subtracts the previous reading with 8-bit signed arithmetic. A change of 128 or more is ambiguous.
    - **Buttons**: left on CIA-A PRA $BFE001 bits 6/7, active low; right and middle on POTGOR $DFF016 bits 10/8.
    - **The keyboard** is the opposite model: a serial stream of 7-bit codes with bit 7 = key-up.
- **NES** (https://www.nesdev.org/wiki/Standard_controller): a write to $4016 latches the buttons; eight reads of $4016/$4017 then shift out A, B, Select, Start, Up, Down, Left, Right. It is a level snapshot taken at the strobe.
- **SNES** (https://snes.nesdev.org/wiki/MMIO_registers):
    - Auto-read latches 16 bits per pad into `JOY1L/H` ($4218/$4219) each vblank; `HVBJOY` bit 0 is set while it runs.
    - Games keep last frame's value to find new presses.
- **C64** (https://sta.c64.org/cbm64mem.html): CIA1 $DC00/$DC01 scan the keyboard matrix and read joysticks, active low. Pure state, scanned by the program.
- **Game Boy** (Pan Docs, https://github.com/gbdev/pandocs, Joypad_Input.md:3-18, Interrupt_Sources.md:62-79):
    - `JOYP` $FF00 selects d-pad or buttons and reads 0 = pressed.
    - A joypad interrupt (IE/IF bit 4) fires on a falling edge, mainly to wake from STOP.

## B5. Fantasy consoles with memory-mapped mouse and keys

- **TIC-80** (https://github.com/nesbox/TIC-80 @ed19a43; include/tic80.h:45, 126-169; wiki RAM.md):
    - **Layout**: gamepads at 0x0FF80 (4 bytes), mouse at 0x0FF84 (4 bytes), keyboard at 0x0FF88 (4 bytes).
    - **Mouse**: x and y as unsigned bytes of **absolute screen position**, or signed deltas in relative mode. Then a u16 with bit 0 left, 1 middle, 2 right, bits 3-8 a 6-bit signed horizontal scroll, bits 9-14 vertical scroll, bit 15 relative mode.
    - **Keyboard**: up to **four held key codes** (0 = none). The codes are TIC-80's own: 1-26 A-Z, 27-36 digits, 48 space, 50 return, 58-61 arrows, 63 ctrl, 64 shift, 65 alt, 66 escape (src/tic.h:659-769).
    - **Per-frame edges**: a key pressed and released within one frame counts as down for that frame (src/system/sdl/main.c:763-775). `keyp()` compares with the previous frame's copy, which is kept outside RAM (src/core/io.c:34-41, 88-125).
- **WASM-4** (https://github.com/aduros/wasm4, site/docs/reference/memory.md:15-18, 68-99):
    - Four gamepad bytes at 0x16-0x19.
    - `MOUSE_X`/`MOUSE_Y` as signed 16-bit at 0x1A/0x1C, possibly outside the window.
    - `MOUSE_BUTTONS` at 0x1E: bit 0 left, 1 right, 2 middle.
    - No raw keyboard.
- **PICO-8** (manual v0.2.7 §6.13, https://www.lexaloffle.com/dl/docs/pico-8_manual.html, experimental):
    - `POKE(0x5F2D, 1)` enables mouse and keyboard.
    - They are read through `stat()`, not memory: 30/31 a character queue, 32/33 mouse x/y, 34 buttons, 36 wheel.

## B6. The key code sets in play

| Set                                    | Width              | Arrows             | Left/right modifiers | Used by                                                                                                                                                          |
| -------------------------------------- | ------------------ | ------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASCII                                  | 7-8 bits           | none               | none                 | MARS/RARS/SPIM receiver; Saturn                                                                                                                                  |
| Windows virtual keys (EASy68K's table) | 8 bits             | 0x25-0x28          | merged here          | M68K task 19 and the Z80 Port map (`packages/asm-editor/src/lib/languages/peripherals/keyCodes.ts:24-76, 120-125`)                                               |
| Java `KeyEvent.VK_*`                   | int; keys < 256    | 37-40              | merged               | the Pitt MARS tool. Same values as Windows for letters, digits and arrows, but Enter is 10 (Windows 0x0D) (Pitt tool :1163-1171 and the game include file in A4) |
| Linux `KEY_*` (evdev)                  | up to 0x2FF        | 103, 105, 106, 108 | separate             | x86 (`packages/asm-editor/src/lib/languages/peripherals/linuxKeyCodes.ts:1-18`); asmOS's input code (`.cache/asmos-source/os/input.c:19, 30-32`)                 |
| USB HID usage IDs, page 0x07           | 8 bits (0-0xE7)    | 0x4F-0x52          | separate (0xE0-0xE7) | USB boot keyboards; the naming of the browser's `KeyboardEvent.code`                                                                                             |
| PS/2 scan code set 2                   | 1-8 byte sequences | `E0 75` etc.       | separate             | PS/2 keyboards; the DE1-SoC PS/2 FIFO                                                                                                                            |
| TIC-80 codes                           | 8 bits (1-94)      | 58-61              | merged               | TIC-80                                                                                                                                                           |

---

# C. This repository

## C1. The Keyboard (`packages/asm-editor/src/lib/languages/peripherals/Keyboard.ts`)

- **Two views** (:9-40):
    - A **typed-character queue** of code points that never drops one (:62-63, 139-144, 149-185).
    - A **key-state view**: the set of keys down, the last key down and the last key up, in EASy68K's codes (:64-69, 216-233).
- **One key event feeds both**: `keyDown` types the character the event produced **and** presses its key (:78-85).
    - An auto-repeat types again and presses again: the key becomes the last key down again and its listeners hear it again ([ADR 0066](../adr/0066-key-state-changes-at-the-event.md); :105-114).
    - `keyUp` types nothing (:87-92).
- **The state changes at the event and a read answers it as it is** (:23-28). A tap between two reads is gone from the held keys, while the last-key codes keep it.
- **Modifiers** are ordinary keys in the state; `modifiers()` samples Shift, Alt and Ctrl for the Mouse (:236-242).
- **Losing focus** releases every held key, each as an ordinary release (:126-133).
- **Undo**: `unreadCharacter` puts back a character a polled device took (:169-172). Key state is live and Undo does not replay it (:34).
- **Listeners**: `onKeyEvent` tells a listener of each down or up after the state shows it. The M68K's IRQs use this (:198-212).

## C2. The Mouse (`packages/asm-editor/src/lib/languages/peripherals/Mouse.ts`)

- **Three views, EASy68K's task 61 modes**: `state()` now, `lastUp()` and `lastDown()` (:177-190). Each snapshot persists until the next event of its kind (:5-11).
    - A snapshot holds x, y, the left, right and middle buttons, Shift, Alt, Ctrl, a double-click flag (last-down only) and the event counter (:33-46).
- **Event counter**: wraps at 256 and counts every down, up and move to another pixel. A program compares it for change, never for order (:75-76, 204-207, 235-237).
- **Double click**: the same button pressed again within 500 ms, Windows' default; distance is deliberately ignored (:67-73, 129-136).
- **Coordinates**:
    - Logical Screen pixels, top-left origin, independent of zoom (:13-17).
    - Clamped to the Screen, asking for its size at each event, so a drag past the right edge pins X (:223-233, 251-254).
    - A move that clamps to the same pixel is no event (:116-121).
- **Losing focus**: `releaseAll` releases the buttons as real events (:150-157).
- **No wheel**: the Mouse has no wheel field or method.

## C3. How the Screen widget routes input (`packages/asm-editor/src/components/specific/project/screen/ScreenRenderer.svelte`)

- **Routing**: keys go to `x86Input ?? keyboard` and the pointer to `x86Input ?? mouse` (:102-103). So **every non-x86 Target already feeds the Keyboard's key state and the Mouse**, MIPS and RISC-V included. Nothing on those two Targets reads them.
- **Buttons**: left, right and middle go to `mouse.buttonDown/Up` with the position (:285-295). Moves go to `pointer.moveTo` (:312-325).
- **Context menu and middle click** are suppressed on every Target (:589-590).
- **The wheel** goes only to x86. The handler returns at once when there is no `x86Input` (:346-356).
- **Escape is the release key on every Target but x86**. It blurs the canvas and is never handed to the Keyboard, and its key-up is skipped too (:376-391, 397-399). x86 uses Shift+Tab instead, because its programs read `KEY_ESC`.
    - So, contrary to the brief, a MIPS or RISC-V program cannot receive Escape from the Screen today. Whether Escape typed into the Terminal reaches the receiver was not checked.
- **Ctrl and Meta combinations** keep their browser default (:359-373). The Keyboard still records the keys as down (C1); only the typed character is dropped (`typedCharacterFromEvent`, keyCodes.ts:242-253).
- **A paste** goes to the typed queue on non-x86 Targets (:403-410).
- **Focus loss**, a window blur included, releases keys and buttons (:412-417, 486-490).

## C4. Key code tables (`keyCodes.ts`, `linuxKeyCodes.ts`)

- **`keyCodes.ts`** holds EASy68K's codes, the Windows virtual-key table EASy68K reads through `GetAsyncKeyState`. The M68K and the Z80 Port map use it (:1-20, 24-76).
    - The physical key (`KeyboardEvent.code`) is read first, so WASD stays positional whatever the layout (:14-17, 207-215).
    - Left and right Shift, Ctrl and Alt map to one code each; Meta has left and right codes (:120-125, 140-141).
    - The keypad depends on Num Lock through `key` (:217-229).
- **`typedCharacterFromEvent`** (:241-253):
    - No character for Ctrl or Meta combinations, except AltGr.
    - Named characters: Enter `\n`, Tab `\t`, Backspace `\b`, Escape `\x1b` (:195-201).
    - Otherwise `key` when it is one code point.
- **`linuxKeyCodes.ts`** holds Linux `KEY_*` for x86, read from `code` alone. Left and right modifiers are separate, and keypad codes ignore Num Lock (:1-18).
- **Rule**: since 2026-10-31 each environment uses its **Reference environment**'s codes ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md), update; `CONTEXT.md` "Keyboard"). MARS and RARS have no key codes of their own beyond ASCII.

## C5. EASy68K tasks 7, 19 and 61 in s68k and the editor

- **Task 7**:
    - s68k raises `CheckKeyboardInput` (packages/m68k/src/interpreter.rs:7020).
    - The editor answers from the Terminal's pending input, so scripted input counts ([ADR 0009](../adr/0009-share-screen-keyboard-input-with-terminal.md); packages/asm-editor/src/lib/languages/M68K/M68KEmulator.svelte.ts:2186-2192).
    - s68k puts the answer in D1.B (interpreter.rs:4120-4122).
- **Task 19**:
    - D1.L = 0 asks for the last keys; otherwise it holds up to four key codes, one per byte (interpreter.rs:7058-7066).
    - The answer goes in D1.L: $FF or $00 in the byte each code came in, or last-key-up in the high word and last-key-down in the low word (:4123-4132; adapter :2193-2211).
- **Task 61**:
    - D1.B selects the view: 0 now, 1 last up, 2 last down; anything else is an error (interpreter.rs:7084-7095).
    - The answer is the flags in D0.L and `(y << 16) | x` in D1.L (:4133-4140; adapter :2212-2229).
    - Flags: left 0x01, right 0x02, middle 0x04, double 0x08, Shift 0x10, Alt 0x20, Ctrl 0x40 (packages/asm-editor/src/lib/languages/M68K/M68K-traps.ts:720-735).
- **EASy68K's hardware window** is also memory-mapped input (docs/research/easy68k-machine-behaviour.md, "Hardware devices"):
    - Toggle switches at $E00012 (bit n = 1 while up) and push buttons at $E00014 (active low).
    - They are plain RAM bytes the GUI writes, and reads are not intercepted: the same push model as MARS.

## C6. The Z80 Port map ([ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md))

- **Ports** (packages/asm-editor/src/lib/languages/Z80/Z80-model.ts:197-212):
    - Keyboard: `KEY_AVAILABLE` 0x30, `KEY_STATE` 0x31 (key code in B), `KEY_LAST_DOWN` 0x32, `KEY_LAST_UP` 0x33.
    - Mouse: `MOUSE_X` 0x40, `MOUSE_Y` 0x41, `MOUSE_BUTTONS` 0x42, `MOUSE_EVENTS` 0x43, with B selecting the view (0 now, 1 last up, 2 last down).
    - The flags are task 61's (:431-453).
- **Pulled at the read**: values are bytes computed when the `in` runs (Z80Device.ts:253-268, 581-591, 650-659). Coordinates are bytes because the Z80 Screen is at most 256 × 256.
- **A select-then-read register**: `KEY_STATE` with the code in B is the Port map's form of "write a key code, read its state", which the Pitt tool does with a store and a load.

## C7. x86 evdev ([ADR 0067](../adr/0067-x86-devices-follow-a-qemu-guest.md), [0068](../adr/0068-x86-programs-run-on-a-serial-console.md), [0069](../adr/0069-x86-journals-the-input-its-reads-take.md))

- **Events**: `X86Input` turns each host event into one report (packages/asm-editor/src/lib/languages/peripherals/x86Input.ts:11-46):
    - keys as `EV_KEY` 1/0/2 with Linux codes;
    - the pointer as `EV_ABS` from 0 to 32767 across the Screen, clamped;
    - buttons as `BTN_LEFT/RIGHT/MIDDLE/SIDE/EXTRA`;
    - the wheel as `REL_WHEEL` ±1, positive away from the user.
- **The Core owns the queues** and journals what each read takes (ADR 0069).
- **Separate from the Terminal**: on x86, Screen keys never reach standard input (ADR 0068).

## C8. Decision records and glossary

- **[ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md)**:
    - Preserve each environment's graphics interface. MARS's transmitter is never busy.
    - The 2026-10-23 update lets the bitmap display take sizes MARS lacks, as a documented superset.
    - asmOS decision 2 calls for a dated note here rather than a new ADR (docs/design/asmos-portability.md:47).
- **[ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)**:
    - **Polling and no interrupts**, MARS's interrupt-driven keyboard mode out of scope.
    - Key and mouse input is **live after Undo**, not replayed.
    - Focus rules; three mouse views.
    - Coordinates in **logical Screen pixels, clamped**, with no "inside" flag (one "can be added to the Z80 ports if a use appears").
    - Modifiers are ordinary keys.
    - The 2026-10-31 updates give each environment its reference's codes and give x86 the tablet.
- **[ADR 0010](../adr/0010-program-time-without-clock-pacing.md)**: Program time follows host time. Testcases use a virtual clock that advances only through waits.
- **[ADR 0035](../adr/0035-environments-match-their-reference.md)**:
    - Services behave as in the reference. Deviations are kept only where they help a learner, and are documented.
    - **The Core owns semantics, the editor the transport**; adapters never parse or format.
- **[ADR 0057](../adr/0057-restore-the-terminal-on-undo.md)**:
    - Undo restores the Terminal.
    - **A keystroke a polled device took (MARS's receiver) goes back at the front of its queue.**
    - What a read that waited took is not put back; it asks again.
    - Testcases keep no history.
- **[ADR 0061](../adr/0061-the-synth-is-a-chip-that-could-have-been-built.md)** and **[ADR 0062](../adr/0062-the-synth-sits-beside-each-reference-s-own-devices.md)**:
    - The Synth is "a chip that could have been built", sitting beside each reference's own devices at 0xFFFF0100.
    - "A program using the Synth runs in no reference simulator."
    - Its registers are memory the Core rewinds.
- **[ADR 0065](../adr/0065-m68k-devices-deliver-irqs.md)**: M68K key and mouse IRQs. The editor reports events and the Core decides; "a Testcase has no keyboard or mouse". MIPS, RISC-V, x86 and the Z80 keep polling.
- **[ADR 0066](../adr/0066-key-state-changes-at-the-event.md)**:
    - The key state changes at the event, with no queue or hold interval; auto-repeat is a key going down again.
    - A press latched until the next read was considered and rejected: "a read that says a key is down after it came up is not an answer EASy68K gives".
    - "MIPS and RISC-V read only the typed-character queue."
- **[ADR 0069](../adr/0069-x86-journals-the-input-its-reads-take.md)**:
    - On x86, what a read took without waiting goes back on Undo, **every evdev event** included.
    - A read that waited asks again.
    - `EVIOCGKEY`'s key state and `EVIOCGABS`'s position stay live.
- **`CONTEXT.md`**:
    - "Keyboard" (line 117): typed characters, key state, or x86's key events, in the reference's codes.
    - "Mouse" (121): current state and snapshots, in logical pixels.
    - "Reference environment" (250).
    - "Program time" (191).
    - "Synth" (143): "An extension beyond MARS, RARS and EASy68K".

## C9. How MARS and RARS devices are wired today (`packages/asm-editor/src/lib/languages/mars/MarsDevices.ts`)

- **Adapter-side memory observers, no Core handlers**:
    - Devices register with the Core's JavaScript API: `addMemoryWriteObserver(start, end, fn)` over a range, `addMemoryAccessObserver(word, onRead, onWrite)` on one word, `setPeripheralWord`, `readMemoryBytes` and `removeMemoryObserver` (:72-87).
    - The Synth needed no Core change (docs/design/waveform-sound-plan.md:11, 24).
    - Syscalls are a separate mechanism (`marsHandlers.ts`).
- **Push model**:
    - The receiver writes the next keystroke into the data word and sets Ready with `setPeripheralWord` as soon as input changes, not when the program reads (:151-162, 391-406).
    - The read observer runs **after** the program got the value, then takes the keystroke and pushes the next (:431-436).
    - The Core notifies read observers after fetching the value (packages/mips/mars/src/main/java/app/specy/mars/mips/hardware/Memory.java:759-760, 825). So **no register can compute its value at read time** without a Core change.
- **Synchronous**: callbacks run inside the instruction that made the access (packages/mips/marsjs/src/main/java/app/specy/marsjs/JsMemoryObserver.java:12-18). A write observer can therefore set up a value that the very next load sees: a "write a code, read its state" register works.
- **A word observer matches every byte of its word**, so `lbu` from a register triggers it too (Memory.java:1404-1406).
- **Adapter writes are not journaled**:
    - `setPeripheralWord` is `setRawWordNoNotify`, which "notifies no observer and records no undo step" (packages/mips/marsjs/src/main/java/app/specy/marsjs/JsMips.java:956-959; Memory.java:519-529; the RISC-V fork's Memory.java:478).
    - Pushed state therefore survives Undo, which is ADR 0008's "live".
    - **Program stores into a register are journaled**, and the Core's undo replays the restored value as an ordinary store. `rewind` silences observers during undo (:250-264).
    - `onControlWrite` re-states the device's own Ready bit after any write, an Undo's included (:450-455).
- **Host reads do not notify**: `readMemoryBytes` uses `getByteForHost`, so the memory view cannot pop a register (JsMips.java:910-918).
- **A Poke writes as the program does**, so observers hear it (JsMips.java:921-953).
- **The interrupt-enable bit stops the program** with "Interrupt-driven I/O is not supported" (:438-449).
- **Testcase input**: the receiver answers scripted lines byte by byte, Enter as `\n` (:93-101, 385-390; packages/asm-editor/src/lib/languages/peripherals/Terminal.svelte.ts:884-911).
- **Coverage by the display**: when the bitmap display's grid overlaps the Synth's block, the Synth goes off and leaves the memory regions. A display at 0xFFFF0000 always covers it (:146-149, 307-312, 164-179).
- **The device host has no Mouse**: `MarsEmulator` passes screen, keyboard, terminal and audio only (packages/asm-editor/src/lib/languages/mars/MarsEmulator.svelte.ts:239-244; MarsDevices.ts:89-107).
- **One logical pixel is one framebuffer word** (packages/asm-editor/src/lib/languages/mars/marsDisplay.ts:138-157). So Mouse coordinates on MIPS and RISC-V would index the grid directly: word `y × columns + x`. The default Screen is 512 × 256 (packages/asm-editor/src/lib/languages/peripherals/peripheralSet.ts:59-61).
- **Testcases and the Keyboard and Mouse**:
    - They are reset at the start of each Testcase but **not swapped out**. Only the Terminal's input, the clock, the Random source and the Audio are (packages/asm-editor/src/lib/languages/GenericEmulator.svelte.ts:1145-1157, 1393-1401).
    - "A Testcase has no keyboard or mouse" is enforced per adapter. x86 drops input reports in a Testcase (x86Input.ts:59-64), and docs/design/x86-devices-plan.md:21 says "Keyboard and Mouse stay live in a Testcase; the adapter has to gate delivery itself".
- **Interrupts would need a Core change**. The Cores keep MARS's and RARS's interrupt plumbing (packages/mips/mars/…/simulator/Simulator.java:56, 389-391; packages/risc-v/rars/…/riscv/hardware/InterruptController.java:42-52), but neither `JsMips` nor `JsRiscV` exports a way to raise one.

### Files a polled input block would touch (the Synth's path as the template)

- A plain-data register module beside `packages/asm-editor/src/lib/languages/synthRegisters.ts`:
    - "Plain data with no imports, so … `scripts/sim-header` loads it under node" (:1-9).
    - The base and size follow the `SYNTH_BASES`/`SYNTH_BLOCK_SIZE` pattern (:11-19).
- `MarsDevices.ts`:
    - Observers and pushes; a `regions()` entry; the coverage check; `rewind`.
    - A `mouse` in `MarsDeviceHost`.
- `MarsEmulator.svelte.ts:239-244`: pass the Mouse.
- `ScreenRenderer.svelte:346-356`, if a wheel is wanted on non-x86 Targets, and `Mouse.ts`, which has no wheel today.
- `ScreenRenderer.svelte:376-399`, if Escape must reach the program.
- The Documentation:
    - `packages/asm-editor/src/lib/documentation/mars/screen.md` (:46 and :50 say "There is no mouse device in this simulator");
    - `packages/asm-editor/src/lib/documentation/mars/screen.ts`;
    - the coding agent's prompt, `packages/asm-editor/src/components/shared/agent/defaultCodingAgent/prompts.ts:24, 447-451, 525, 532`.
- `<sim.h>` (C10), the help catalogs it generates, and `MarsDevices.test.ts`.
- `docs/design/screen-peripherals.md:73` ("Nothing mapped; the simulators have no mouse").

## C10. How `<sim.h>` reaches device registers ([ADR 0034](../adr/0034-environment-library-is-header-only.md))

- **Generator**: `node scripts/sim-header/generate.mjs` writes `src/lib/sourceRuntime/generated/sim/{mips,riscv32,riscv64}.h`, run in `packages/asm-editor`. `--check` is the drift test (packages/asm-editor/scripts/sim-header/generate.mjs:1-12).
- **Inputs**: it loads the editor's TypeScript data modules under Node with type stripping (:28-58): the syscall tables, `MarsDevices.ts` (the four register constants and the Ready bit), `marsDisplay.ts` and `synthRegisters.ts`. These feed one `data` object (:59-92).
- **`simHeader.mjs`** emits, in order (packages/asm-editor/scripts/sim-header/simHeader.mjs:380-395):
    - one `static inline` function per syscall;
    - the device functions: `sim_keyboard_ready`, `sim_keyboard_read`, `sim_display_ready` and so on, as `volatile unsigned *` accesses (:225-236; helpers.mjs:2-17);
    - `SIM_SCREEN`;
    - the Synth section: `#define SIM_SYNTH_BASE 0xffff0100ul`, register offset defines, and accessor macros `SIM_SYNTH8/16`, `SIM_SYNTH_UPLOAD8/16/32` (:287-342).
- **Generated output**: packages/asm-editor/src/lib/sourceRuntime/generated/sim/mips.h:369-382.
- **The same addresses serve all three ABIs**, ILP32 for MIPS and RV32 and LP64 for RV64 (riscv64.h:382-384, 459). `unsigned` is 32 bits in all three; `unsigned long` is not.

## C11. What asmOS reads today (`.cache/asmos-source/os/input.c`)

- **Two evdev streams**: the keyboard and the tablet. It reads every event that arrived after a `poll` with a timeout (:183-198).
- **It rebuilds key state itself** in a 96-byte bitmap indexed by `KEY_*`, `KEY_MAX / 8 + 1` bytes (:30-32, 101-104).
- **It consumes events**:
    - Key down, repeat and up go to the window manager with the character from a US keymap (:101-122). A repeat (value 2) counts as a press.
    - Modifiers are tracked from events (:92-99, 105-110).
- **Pointer**:
    - Positions are converted from the tablet's range to pixels (:159-165).
    - Buttons are events, with a pending move flushed before each (:152-157, 166-174).
    - The wheel is `REL_WHEEL` (:175-178).
    - It detects double clicks itself, within 5 pixels and `double_click_ms` (:132-150).
- **Polled key state too**: apps read `os_key_down`, e.g. the falling-blocks game for Left, Right and Down (`.cache/asmos-source/os/apps/blocks.c:586-614`). So asmOS uses both an ordered event stream and polled key state.

---

# D. The address map from 0xFFFF0000 to 0xFFFFFFFF

| Range                 | Size    | Owner                                                                                                                    | Source                                                               |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 0xFFFF0000-0xFFFF000F | 16 B    | MARS/RARS/SPIM Keyboard and Display MMIO (implemented here)                                                              | MARS KDS :164-167; RARS KDS :171-174; MarsDevices.ts:29-33           |
| 0xFFFF0010-0xFFFF0014 | 5 B     | Digital Lab Sim, MARS and RARS (not implemented here)                                                                    | MARS/tools/DigitalLabSim.java:28-32; RARS :46-50                     |
| 0xFFFF0015-0xFFFF0017 | 3 B     | free                                                                                                                     |                                                                      |
| 0xFFFF0018-0xFFFF001F | 8 B     | RARS Timer Tool `time`, ms (not implemented here)                                                                        | RARS/tools/TimerTool.java:53                                         |
| 0xFFFF0020-0xFFFF0027 | 8 B     | RARS Timer Tool `timecmp` (not implemented here)                                                                         | RARS/tools/TimerTool.java:54                                         |
| 0xFFFF0028-0xFFFF00FF | 216 B   | free in stock MARS/RARS. The Pitt tool's enhanced input registers sit at 0x40-0x6B, and Saturn's held table at 0x80-0xFF | Pitt tool :69-79; Saturn keyboard.rs:7                               |
| 0xFFFF0100-0xFFFF02FF | 512 B   | this editor's Synth                                                                                                      | synthRegisters.ts:11-19; docs/design/waveform-sound.md:68            |
| 0xFFFF0300-0xFFFF7FFF | ~31 KB  | free                                                                                                                     |                                                                      |
| 0xFFFF8000-0xFFFF8060 | 97 B    | MARS Mars Bot (absolute addresses)                                                                                       | MARS/tools/MarsBot.java:17-21, 263                                   |
| 0xFFFF8000-0xFFFFFFF0 | ~32 KB  | MARS ScavengerHunt player space; 0xFFFFE000-0xFFFFE00C its admin words                                                   | MARS/tools/ScavengerHunt.java:47-57, 454                             |
| 0xFFFF0000 and up     | ≤ 64 KB | the bitmap display's grid when its base is "memory map"                                                                  | MARS/tools/BitmapDisplay.java:402-413; marsDisplay.ts:65-71, 146-150 |

- **Stage-2 timers** (docs/design/asmos-portability.md:59-61):
    - RISC-V's timer is RARS's own Timer Tool at 0xFFFF0018 to 0xFFFF0027, so those 16 bytes must stay free.
    - MIPS's is CP0 Count (`$9`) and Compare (`$11`), which are coprocessor registers and need no address.
    - The same doc rejects "an invented device" for timers. Stage 2 therefore needs no new address beyond keeping 0x18-0x27 clear.
- **Any block in this page can be covered** by a memory-map-base display. The editor clamps the grid at the top of the address space (marsDisplay.ts:146-150), so a large display covers all 64 KB. The Synth's answer to this is to switch off (C9).
- **Interrupt bits already used, for a later interrupt-driven mode**:
    - MIPS Cause:
        - MARS uses bits 8 and 9 (keyboard and display) and the Digital Lab Sim bits 10 and 11.
        - SPIM uses bits 10 and 11 for its receiver and transmitter.
        - IP7 (bit 15) is the one asmOS's stage 2 names for Count/Compare.
        - That leaves bits 12 to 14 (IP4 to IP6) unused by any of these tools. IP0 and IP1 (bits 8 and 9) are the software interrupts in MIPS32 terms (MIPS32 PRA; not re-read).
    - RARS:
        - External requests carry a device code in `utval`: 0x40 keyboard, 0x80 display, 0x200 keypad.
        - Timer requests carry 0x10 (Timer Tool) or 0x100 (lab counter).
- **Single-instruction reach** (from the ISA encodings: MIPS I-type 16-bit and RISC-V I-type 12-bit signed offsets):
    - On MIPS, `lui $t, 0xffff` reaches 0xFFFF0000 to 0xFFFF7FFF with positive offsets, and loads off `$zero` reach 0xFFFF8000 to 0xFFFFFFFF.
    - On RISC-V, `lui t, 0xffff0` reaches 0xFFFF0000 to 0xFFFF07FF (offsets up to 2047), and loads off `zero` reach 0xFFFFF800 to 0xFFFFFFFF.
    - A block below 0xFFFF0800 shares one base register with the keyboard registers and the Synth on both ISAs. Whether RV64 sign-extension of a `zero`-relative address matches the 32-bit memory map in the RISC-V Core is unverified.

---

# E. The questions the grill must settle

## E1. Event queue, state registers, or both

| Option                    | Precedents                                                                                                                | For                                                                                                                                                                                                               | Against                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **State only**            | EASy68K task 19 and 61; Z80 ports; USB boot report; NES, SNES, C64; TIC-80; WASM-4; Ripes; DE1-SoC KEY data; Saturn table | No read side effects, so nothing to journal: live across Undo as ADR 0008, 0066 and 0069 have it. Cannot overflow. Fits the push model: the adapter writes words at each event. Real MARS reads 0 = nothing held. | Loses order and taps between polls. asmOS's window manager wants ordered key events with repeats (C11). Mitigations: last-key codes (EASy68K), an event counter (Mouse), captured edges.                                                                                                                           |
| **Captured edges on top** | Ripes (read-to-clear); DE1-SoC edge capture (write-1-to-clear); Pitt tool and TIC-80 (per frame)                          | A tap is never missed.                                                                                                                                                                                            | Read-to-clear is a read side effect that Undo must restore. Write-to-clear is a program store the Core journals and replays (C9). Per-frame latching needs a frame signal, which MARS and RARS do not have (sleep is the nearest). ADR 0066 rejected "latch a press until the next read" for the key state itself. |
| **Queue only**            | PS/2 FIFO (DE1-SoC); evdev; virtio-input; Amiga keyboard; this editor's receiver                                          | Ordered, lossless up to its depth, carries repeats. A queue register already exists here: push the head, pop in the after-read observer (C9). ADR 0057 and 0069 already say a polled pop goes back on Undo.       | The program must drain it every frame and rebuild state itself (asmOS does, C11). Needs an overflow rule (evdev's `SYN_DROPPED`, the DE1-SoC's 256-byte FIFO). A record of more than one word needs a rule for when it is popped.                                                                                  |
| **Both**                  | evdev with `EVIOCGKEY`; this editor's Keyboard (typed queue + state); asmOS's own use (C11)                               | Matches what asmOS uses on x86. Each half keeps the simple semantics above.                                                                                                                                       | More registers. Two views of one key can disagree after Undo: the popped event goes back, the state stays live. evdev's `EVIOCGKEY` throws the reader's queue away; ADR 0069 keeps that rule for x86.                                                                                                              |

Mouse in particular:

- **Position** is state everywhere: TIC-80, WASM-4, the Pitt tool, EASy68K, the Z80, evdev's `EVIOCGABS`.
- **Buttons**: EASy68K's last-down and last-up snapshots, the Z80's event counter and the Pitt tool's pressed and released sets each catch a click between polls without a queue.

## E2. Key code set

| Option                        | For                                                                                                                                                                                                                                                                         | Against                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASCII                         | MARS's own receiver code; no table needed                                                                                                                                                                                                                                   | No arrows, modifiers or function keys; depends on the layout and on Shift (Saturn drops everything else, A5)                                                                 |
| EASy68K / Windows VK          | Already implemented (`keyCodeFromEvent`); the M68K and Z80 use it, so non-x86 Targets would share one table and one Documentation; 8-bit, so a 256-bit bitmap is 32 bytes; letters are ASCII capitals; close to Java VK (Pitt tool)                                         | Not MARS's or RARS's reference (ADR 0008's 2026-10-31 rule); a Windows API convention rather than hardware; left and right modifiers merged here; Enter differs from Java VK |
| Linux `KEY_*`                 | asmOS's code already uses it (C11), as does x86, and the table exists (`linuxKeyCodes.ts`); left and right separate                                                                                                                                                         | An operating system's numbering on a bare-metal simulator; up to 0x2FF, so a full bitmap is 96 bytes; not what a 1980s or 1990s device would report                          |
| USB HID usage IDs (page 0x07) | A real device convention: a USB keyboard controller reports exactly these. One byte per key, modifiers at 0xE0-0xE7 with a standard bit order, so a 256-bit bitmap is 32 bytes. Browser `code` names follow HID naming. Fits ADR 0061's "a chip that could have been built" | A new table to write and document; teaching material for MARS uses none of it; the boot report's six-key array is not a bitmap, so a bitmap would be our own layout          |
| PS/2 set 2                    | The most "real" byte stream, as in the DE1-SoC FIFO; teaches make and break codes                                                                                                                                                                                           | Multi-byte sequences (`E0`, `F0`, `E1`) are awkward for a state register and must be decoded by the program                                                                  |

## E3. Absolute logical Screen pixels or relative deltas

- **Absolute, clamped logical pixels** is the editor's rule on every non-x86 Target ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md); Mouse.ts:223-233). TIC-80, WASM-4 and the Pitt tool use absolute coordinates too.
    - On MIPS and RISC-V a logical pixel is a grid word (C9), so `y × columns + x` is the word under the pointer.
    - Off-screen handling varies: the Pitt tool reports -1, WASM-4 may report outside values, and ADR 0008 clamps with no inside flag.
- **Relative deltas** are what PS/2, the USB boot mouse and evdev `REL_*` report.
    - A wrapping counter the program differences, as on the Amiga, loses no motion between reads and has no read side effect.
    - But the program must keep its own position, and the browser pointer here is absolute (the Screen has no pointer lock; unverified whether one would be wanted).
- **Scaled absolute** (x86's 0 to 32767) exists only to follow QEMU's tablet ([ADR 0067](../adr/0067-x86-devices-follow-a-qemu-guest.md)). There is no such reason on MARS.
- **Register width**: a word per coordinate (Pitt tool), or two halves of one word (task 61's `(y << 16) | x`). The editor allows Screens up to 1024 a side ([ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md) update), so 16 bits suffice.

## E4. Buttons, wheel, double click, modifiers

- **Buttons**:
    - Left 1, right 2, middle 4 in task 61, the Z80, PS/2, WASM-4 and the Pitt tool. TIC-80 orders them left, middle, right. USB numbers them buttons 1 to 3.
    - x86 adds side and extra (x86Input.ts:5-9). The Screen suppresses the context menu and middle click already (C3).
- **Wheel**:
    - There is none on the non-x86 path today (C2, C3). It would need a handler in `ScreenRenderer.svelte` and a field in the Mouse.
    - Forms seen: a per-frame delta (TIC-80, the Pitt tool), a counter (Amiga-style; nobody does this for wheels in the sources read), or events (evdev).
    - Sign conventions disagree: evdev is +1 away from the user, PS/2 Z is disputed, the Pitt tool is positive up.
- **Double click**:
    - Only EASy68K's task 61 reports one, in Mouse.ts at 500 ms. No hardware does.
    - asmOS computes its own, with a distance threshold (C11).
- **Modifiers**:
    - As keys in the key state (ADR 0008: "ordinary keys with their own codes"), as a modifier byte (USB), or sampled into a mouse snapshot (task 61's Shift, Alt and Ctrl).
    - Ctrl and Meta combinations keep their browser default (C3), so Ctrl+W and the like never reach a program whatever the registers say.

## E5. The typed-character queue and the new block

- **The Keyboard already feeds both from one event** (C1). A key press that types a character fills the receiver's queue and changes the key state.
- **What the receiver alone gives**:
    - layout-correct text, AltGr characters and pastes (C3);
    - scripted Testcase input (C9);
    - Undo's put-back of a keystroke (ADR 0057).
- **What a block alone could give**: arrows, function keys, modifiers and key-up.
- **Options**:
    - (a) The block carries keys only, and text stays on the receiver; asmOS would take characters from the receiver and key codes from the block.
    - (b) The block carries events with the character attached, as asmOS's `KeyEvent { code, ch, mods }` does.
    - (c) The block replaces the receiver for graphical programs.
- **The Escape conflict**: on these Targets, Escape releases the Screen and never reaches the program (C3). A block that reports Escape needs another release gesture there, such as x86's Shift+Tab, or a documented gap.

## E6. Undo and Testcases

- **Undo, today**:
    - A keystroke the receiver took goes back (ADR 0057; Terminal.svelte.ts:200, 522-542).
    - Key state, mouse state and x86's `EVIOCGKEY`/`EVIOCGABS` answers are live (ADR 0008, 0066, 0069).
    - x86's evdev events go back (ADR 0069).
- **Undo, for a block**:
    - **State registers pushed with `setPeripheralWord`** are untouched by the Core's undo (C9), so they are live with no extra work.
    - **A queue register** needs the same put-back as the receiver, through the Terminal's journal or one of its own.
    - **Any register the program writes** (a select, an acknowledge, write-1-to-clear) is journaled by the Core and replayed as a store on undo. The device must ignore the replay (`rewind`) and re-state its value, as `onControlWrite` does.
- **Testcases**:
    - Today they script only typed input, which reaches the receiver (C9).
    - The Keyboard and Mouse are reset at the start of each Testcase but stay live during it (C9). Every other Target says a Testcase has no keyboard or mouse, and x86 gates delivery in its adapter.
    - The options: the block reads idle in a Testcase, gated by the adapter; or Testcases gain scripted key and pointer events. There is no precedent for scripted events in this repository.

## E7. Polling now, interrupts later

- **Today**:
    - Setting either receiver or transmitter interrupt-enable bit stops the program (C9).
    - ADR 0008 keeps MIPS and RISC-V on polling, and ADR 0065 brought interrupts to the M68K alone.
- **What a later interrupt mode needs**:
    - A Core export to raise an external interrupt. The plumbing exists in both Cores (C9) but is not exported.
    - An interrupt-enable bit in the block, reserved now so that a polled program never sets it by accident. The receiver's precedent: bit 1 of a control word.
    - A Cause bit on MIPS: 12 to 14 are unused by MARS's and SPIM's tools, and asmOS's stage 2 plans IP7 for Count/Compare (D).
    - A `utval` device code on RISC-V other than 0x40, 0x80, 0x200 and the timers' 0x10 and 0x100 (D).
- **ADR 0065's split is the template**: the editor reports events, and the Core owns the enable settings, which Undo restores.

## E8. Compatibility with real MARS and RARS

- **On real MARS and RARS the block is plain memory**:
    - Loads return 0, or whatever the program stored; stores are harmless. Exceptions: the Digital Lab Sim, Timer Tool, Mars Bot and ScavengerHunt ranges, if those tools are connected (D).
    - If every "nothing happening" value is 0, a program written for the block still runs there and sees no input.
    - An identification word that reads non-zero only in the editor would let a program tell the two apart, as virtio-mmio's magic value does (B3).
- **Programs written for real MARS and RARS stay unaffected if**:
    - the block avoids every range in D that a stock tool uses (0x10-0x27 and 0x8000 up);
    - and its registers keep no state a program could have stored there as scratch memory. A program that used free MMIO words as RAM would then see input values. No such program is known; unverified.
- **Coverage by a memory-map-base display**: the block would have to switch off as the Synth does, or the display would show input values as pixels.
- **Documentation**: following ADR 0003's update and ADR 0062, the Documentation and `<sim.h>` say that such a program runs only here. The Pitt tool and Saturn show that other MARS-family environments already put input registers in 0xFFFF0040 to 0xFFFF00FF. A program written for either would not run unchanged against an editor block in the same place, whatever its layout.

## E9. C access through `<sim.h>`

- **Data module**: a plain register module read by `MarsDevices`, the Documentation, the coding agent's prompt and `scripts/sim-header`, as `synthRegisters.ts` is (C10).
- **Header form**: the Synth's pattern of `#define SIM_<DEVICE>_BASE`, offset defines, volatile accessor macros and a few `static inline` helpers. Ripes generates the same shape of `<NAME>_BASE` and `<NAME>_<REG>` defines (A6).
- **Types**: 32-bit `unsigned` so that one type serves the MIPS, RV32 and RV64 headers (C10).
- **Access width**: a register read with `lbu` or `lhu` still triggers its word's observer (C9), so byte-wide fields inside a word are safe for side effects. The Documentation already tells MARS programs to use `lw` for the four registers.
- **Generated helpers**: possible, such as a key-down test or a function that drains a queue into a struct. `DEVICE_HELPERS` in `scripts/sim-header/helpers.mjs` is where they live.

---

## Not verified

- The original author of the Pitt Keypad and LED Display Simulator, and whether its 2013 version had the enhanced mode.
- Which PS/2 scan code set CPUlator's keyboard emits; the polarity of the DE1-SoC KEY data register.
- WebRISC-V's and BRISC-V's I/O; whether any MARS or RARS program in the wild stores scratch data at 0xFFFF0028 to 0xFFFF00FF or 0xFFFF0300 and up.
- Whether Escape typed into the Terminal reaches the MARS receiver in this editor.
- Whether RV64 programs addressing the memory map through `zero`-relative negative offsets reach 0xFFFFF800 and up in the RISC-V Core.
- The MIPS32 interrupt-bit assignments (IP0 to IP7 and Count/Compare on IP7) were taken from memory and the asmOS design, not re-read from the MIPS32 Privileged Resource Architecture.

---

## Leanings

Opinion, for the grill to accept or overturn.

1. **Both: key state and mouse state as pushed registers, plus one key-event queue register.**
    - asmOS uses both on x86: ordered key events with repeats, and `os_key_down` polls (C11).
    - The state half costs nothing under Undo (C9).
    - The queue half reuses the receiver's push-and-pop mechanics and ADR 0057's put-back rule.
    - Mouse buttons can stay state with an event counter, as the Z80 Port map does, rather than enter the queue. One queue, for keys only, keeps the record format to a single word: code, down/up/repeat, perhaps modifiers.
2. **Key codes: USB HID usage IDs.**
    - They are what a keyboard controller of the time would report, which is the Synth's standard (ADR 0061).
    - They fit a byte, with left and right modifiers kept apart.
    - The browser's `code` names already follow them.
    - EASy68K's codes are the close second, for one table across the non-x86 Targets. The deciding question is whether the block should read as hardware or as the editor's own convention.
3. **Absolute, clamped logical pixels**, which on MIPS and RISC-V are grid words. Keep ADR 0008's rule rather than add an off-screen value.
4. **The wheel as a signed wrapping counter**, Amiga-style, so that reading it has no side effect and no Undo record. The same goes for a button event counter.
5. **Leave the receiver alone** as the text channel, because of Testcase scripts, layouts and pastes. Settle the Escape release key explicitly.
6. **Poll now and reserve an interrupt-enable bit** that stops the program today, as the receiver's does. Pick the MIPS Cause bit (12 to 14) and the RARS `utval` code when interrupts come.
7. **Place it in free space reachable from the same base register as the keyboard and the Synth on both ISAs**: 0xFFFF0028 to 0xFFFF00FF, or from 0xFFFF0300 below 0xFFFF0800.
    - 0xFFFF0300, directly after the Synth, keeps the editor's extensions together and leaves 0x28 to 0xFF alone, where the Pitt tool and Saturn put theirs.
    - It also keeps RARS's Timer Tool range clear for stage 2.
8. **All-zero means idle, and add an identification word**, so a program can tell the editor from real MARS or RARS and still run harmlessly there.
