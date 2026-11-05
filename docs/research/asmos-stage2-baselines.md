# asmOS stage 2 baselines — 2026-11-04

Recorded for M0, M1 and M3 of [asmos-stage2-plan.md](../design/asmos-stage2-plan.md): how fast MIPS and RISC-V programs compute and draw, and how asmOS responds, before native dirty tracking and after it; and how large Compiler Explorer's answers for asmOS and DOOM would be on those Targets. M2's tuning is measured against the same numbers, with the same tools.

## How it was measured

- **Machine:** Intel Core i7-10750H, Node 24.11, WSL2. Other sessions used the machine at the same time, so every table gives the load average (1 minute) the runs started at. A single pass swings by 30% and more with that load: "after M1" was therefore measured against the baseline Cores **interleaved**, each configuration run on both, so both see the same load.
- **Compute and drawing:** [`framebuffer.measure.ts`](../../packages/asm-editor/src/lib/languages/measurements/framebuffer.measure.ts), new in the editor's measurement harness, run as `CORE_BACKEND=javascript|webassembly pnpm measure`. It builds each program the way the project page does and runs it through the adapter's slices, so the Screen's updates are part of what is measured:
    - **compute:** the harness's compute loop (`addi` and `j`), median of three runs of about two seconds;
    - **full frame:** a store to every word of a 640 × 480 grid each frame, about 0.92 million instructions;
    - **window copy:** a 300 × 200 picture copied from memory past the grid to a place that moves 4 pixels a frame, about 0.3 million instructions.

    Each frame ends with a 16 ms sleep, which ends the slice and brings the Screen up to date as it does in the editor; the sleep itself is answered at once, so frames a second is the most the program could show. Every run also checks that the Screen shows what memory holds.

- **The WebAssembly build under Node:** Node resolves `@specy/mips` and `@specy/risc-v` to their CommonJS build, which never loads the wasm (`import.meta.url` is a stub there), so the editor's suite has only ever run the JavaScript build. The measure config now points both packages at their ES module build and passes `--experimental-wasm-exnref`.
- **asmOS:** asmOS's harness, `MarsHarness.test.ts`, run on the editor as `tools/README.md` describes, with the same ES module aliases and one line added to the copy, which calls `useWebAssembly()` first for the WebAssembly runs. Its units were compiled once with the local Clang 21.1.0 and reused by every run. Undo off is the asmOS Programs' setting; Undo on is the default history of 200,000 steps. Two scripts:
    - `sim-timing.json` from asmOS's tree: boot to the desktop, the Start menu, Notepad opening, one step of a window drag, and the drag back in eight steps;
    - a key in the Assembly Editor: the editor opened on `code/hello.riscv` by `autostart.txt`, a `#` typed at the start of the first line, timed until the comment it pushes right shows at its new place.

    ```json
    [
        { "mark": "boot to desktop" },
        { "untilPixel": [320, 470, "c0c0c0"] },
        { "mark": "Assembly Editor opens" },
        { "untilPixel": [50, 75, "008000"] },
        { "wait": 2500 },
        { "mark": "Assembly Editor key" },
        { "type": "#" },
        { "untilPixel": [58, 77, "008000"] },
        { "wait": 1500 },
        { "stats": "end" }
    ]
    ```

    A time runs from the action's start until the pixel shows, checked every 2 ms. The harness's own waits are inside it: a key is held 15 ms and released for 15, and a one-step drag spends 90 ms moving, pressing and releasing. The boot time includes asmOS's splash.

## Baselines (M0)

### Compute and drawing

MARS 95ff540 and RARS 31d8a51 (both 5.0.0), one pass each, load 1.5 (JavaScript) and 2.4 (WebAssembly):

| Core   | Build       | Undo | Compute, instructions/ms | Full frame, frames/s | Window copy, frames/s |
| ------ | ----------- | ---- | -----------------------: | -------------------: | --------------------: |
| MIPS   | JavaScript  | off  |                   12,100 |                  3.4 |                  11.8 |
| MIPS   | JavaScript  | on   |                    5,542 |                  2.9 |                   9.9 |
| RISC-V | JavaScript  | off  |                   10,968 |                  3.3 |                   8.4 |
| RISC-V | JavaScript  | on   |                    2,716 |                  1.5 |                   4.7 |
| MIPS   | WebAssembly | off  |                   15,839 |                  5.4 |                  18.6 |
| MIPS   | WebAssembly | on   |                    9,083 |                  4.6 |                  15.1 |
| RISC-V | WebAssembly | off  |                   15,450 |                  5.3 |                  17.9 |
| RISC-V | WebAssembly | on   |                    7,552 |                  4.3 |                  13.6 |

A full frame is 921,606 instructions on both Cores, a window copy 301,020 on MIPS and 301,419 on RISC-V. Undo costs RISC-V's JavaScript build the most: a quarter of its compute speed, against half on MIPS, because RARS's registers and history are Java `long`, which TeaVM's JavaScript makes a BigInt; WebAssembly has a real 64-bit integer.

### asmOS

The same Cores, the stage-1 asmOS (asm-examples 618f939) with its units compiled by the local Clang, load 1.0 to 2.6, milliseconds; where a configuration ran twice both values are given:

| Core   | Build       | Undo | Boot        | Start menu | Notepad opens | Drag step | Drag back, 8 steps | Assembly Editor opens | Assembly Editor key |
| ------ | ----------- | ---- | ----------- | ---------: | ------------: | --------: | -----------------: | --------------------: | ------------------: |
| RISC-V | JavaScript  | off  | 2,528–2,618 |   136, 149 |      837, 802 |  160, 184 |           699, 686 |          1,031, 1,079 |            158, 168 |
| RISC-V | JavaScript  | on   | 2,856–2,892 |   165, 186 |  1,269, 1,101 |  160, 172 |           839, 784 |          1,625, 1,527 |            180, 188 |
| RISC-V | WebAssembly | off  | 2,137–2,350 |        133 |           476 |       175 |                521 |                   822 |                 156 |
| RISC-V | WebAssembly | on   | 2,373–2,384 |        122 |           686 |       170 |                513 |                   819 |                 118 |
| MIPS   | JavaScript  | off  | 2,406–2,753 |        131 |           771 |       167 |                526 |                 1,210 |                 115 |
| MIPS   | JavaScript  | on   | 2,593–2,631 |        130 |           897 |       156 |                632 |                 1,135 |                 157 |
| MIPS   | WebAssembly | off  | 2,100–2,111 |        115 |           419 |       166 |                514 |                   476 |                  86 |
| MIPS   | WebAssembly | on   | 2,250–2,256 |        121 |           576 |       164 |                523 |                   669 |                 110 |

What the program ran meanwhile: about 2.2 to 2.4 million instructions to boot, 0.23 to 0.28 million for the Start menu, 2.6 to 2.9 million to open Notepad, 3.5 to 3.6 million to open the Assembly Editor and 0.43 to 0.45 million for its key. The drag step's count, 0.17 to 0.52 million, grows with the time it took, since asmOS keeps polling until the pointer stops. Static data is 1,460 KB (RISC-V) and 1,464 KB (MIPS), and 1,641 to 1,645 KB of the 4 MB are left after the timing script.

The drag step sits near 160 ms on every configuration, the harness's 90 ms of moving and pressing included, so it says more about the harness and the slices than about the Cores' speed. Opening Notepad and the Assembly Editor, which redraw much more, are where the builds and Undo differ.

## Compiler Explorer answer sizes

Each unit was compiled through the editor's own request (`compileSource`, with source annotations, as a Compile sends it) answered by the local Clang 21.1.0 (asmOS's `localClang.ts`), not by Compiler Explorer. DOOM's four parts were compiled for RISC-V and MIPS against those ports' Files, which leave DOOM out today, with `os/doom/` added; all four compile without errors on both Targets.

**Calibration.** The local Clang writes what Compiler Explorer wrote: the Generated assembly made from its answers has exactly the line counts of the RISC-V Files in asmOS's tree (`os/*.c.riscv`, 38,620, 58,321 and 35,723 lines), and 1 to 3% fewer than the MIPS ones (`os/*.c.mips`). Compiler Explorer's answer is JSON of one entry per line of assembly; at the earlier measurement's 96 to 100 bytes a line (its entries add `labels` and a column to what the local stand-in writes, and expand tabs), an answer is its line count times that. The local stand-in's own JSON, 86 to 90 bytes a line, is the floor.

| Target | Unit                    | Optimization | Answer lines | Local answer, MiB | Estimate at 96–100 B/line, MiB | At 120 B/line, MiB |
| ------ | ----------------------- | ------------ | -----------: | ----------------: | -----------------------------: | -----------------: |
| RISC-V | `os/main.c`             | -O2          |       85,949 |               7.0 |                        7.9–8.2 |                9.8 |
| RISC-V | `os/apps/apps.c`        | -Os          |      114,927 |               9.6 |                      10.5–11.0 |               13.2 |
| RISC-V | `os/ide/ide.c`          | -O2          |       65,447 |               5.5 |                        6.0–6.2 |                7.5 |
| RISC-V | `os/apps/apps.c`        | -O2          |      141,520 |              12.1 |                      13.0–13.5 |               16.2 |
| RISC-V | `os/doom/doom_game.c`   | -O2          |       52,685 |               4.7 |                        4.8–5.0 |                6.0 |
| RISC-V | `os/doom/doom_play.c`   | -O2          |       76,200 |               7.0 |                        7.0–7.3 |                8.7 |
| RISC-V | `os/doom/doom_render.c` | -O2          |       50,387 |               4.3 |                        4.6–4.8 |                5.8 |
| RISC-V | `os/doom/doom_world.c`  | -O2          |       78,974 |               6.7 |                        7.2–7.5 |                9.0 |
| MIPS   | `os/main.c`             | -O2          |       88,620 |               7.2 |                        8.1–8.5 |               10.1 |
| MIPS   | `os/apps/apps.c`        | -Os          |      124,995 |              10.4 |                      11.4–11.9 |               14.3 |
| MIPS   | `os/ide/ide.c`          | -O2          |       71,433 |               6.0 |                        6.5–6.8 |                8.2 |
| MIPS   | `os/apps/apps.c`        | -O2          |      151,367 |              13.0 |                      13.9–14.4 |               17.3 |
| MIPS   | `os/doom/doom_game.c`   | -O2          |       60,743 |               5.4 |                        5.6–5.8 |                7.0 |
| MIPS   | `os/doom/doom_play.c`   | -O2          |       86,136 |               7.8 |                        7.9–8.2 |                9.9 |
| MIPS   | `os/doom/doom_render.c` | -O2          |       55,273 |               4.7 |                        5.1–5.3 |                6.3 |
| MIPS   | `os/doom/doom_world.c`  | -O2          |       90,304 |               7.6 |                        8.3–8.6 |               10.3 |

**No unit as asmOS compiles it is over 16 MiB**, so nothing needs splitting before M9:

- **DOOM's parts are the smallest units:** 4.6 to 8.6 MiB, the largest `doom_world.c` on MIPS. DOOM's MIPS assembly is 1.4 to 2.1 times its x86 Generated assembly in lines, not the 2.2 assumed.
- **`apps.c` at -Os on MIPS is the closest**, at 11.4 to 11.9 MiB, 71 to 74% of the cap. It is the unit to watch as M7 brings the Video Player, the back buffer and the wallpaper back into `apps.c`.
- **A contradiction to keep in mind:** stage 1 recorded that `apps.c` at -O2 went over the cap, yet at 96 to 100 bytes a line its answer would be 13.0 to 14.4 MiB. If that was a real answer, Compiler Explorer writes at least 111 (MIPS) to 119 (RISC-V) bytes a line for this unit. Even at 120 bytes a line every unit as compiled stays under 16 MiB, `apps.c` -Os on MIPS at 14.3 MiB; M9's one Compiler Explorer pass will settle it.

## After M1

### What changed

- **The Cores** (MARS and RARS, `feat/stage2`): Memory keeps a bitmap of the 1 KB blocks of one tracked range, marked in `set()` and `storeRawWord()`, the two primitives every store reaches. Reading every caller confirmed the list: store instructions of every width (with MARS's `swl`/`swr`/`sc`/`swc1`/`sdc1` and RARS's atomics, `fsw`/`fsd` and RV64's `sd`), the syscalls that write memory, `setMemoryBytes` and Pokes, `setPeripheralWord`, the assembler's data, `setDouble`/`setDoubleWord`, and the BackStepper's restores. A store straddling a block boundary marks both blocks. `JsMips` and `JsRiscV` export `trackWrites(start, end)` (`(0, 0)` stops), `takeWrittenBlocks()` and `readMemoryWords(address, count)`, both returning an `Int32Array`. Assembling empties the map and keeps the range, as observers are kept; `trackWrites` empties it too. The per-store observer API is unchanged.
- **The editor** (`MarsDevices.ts`): the grid's write observer is gone. Configuring the display arms `trackWrites` over the grid, a flush takes the written blocks and reads each run of them with one `readMemoryWords`, and Undo and a Poke flush instead of reading the whole grid back. Arming, taking and stopping happen only for the devices that own the Core's shared memory (`memoryOwners`), so a stale Emulator neither takes the live one's blocks nor moves its range.

### The cost of a large read

`int[]` exports cross as an `Int32Array` on both builds, and TeaVM's WebAssembly build copies them in bulk, not element by element. Under Node, one pass, the mean of 30 to 300 calls:

| Words read          | `readMemoryWords`, JavaScript | `readMemoryWords`, WebAssembly | `readMemoryBytes` of the same bytes, JavaScript / WebAssembly |
| ------------------- | ----------------------------: | -----------------------------: | ------------------------------------------------------------: |
| 256 (one block)     |                      0.005 ms |                 0.003–0.005 ms |                                           0.06–0.07 / 0.08 ms |
| 4,096               |                0.011–0.020 ms |                 0.011–0.013 ms |                                      0.26–0.35 / 0.13–0.20 ms |
| 307,200 (640 × 480) |                        1.0 ms |                     1.0–1.1 ms |                                              21–24 / 11–13 ms |

A whole 640 × 480 grid now crosses in about a millisecond on either build, ten to twenty times faster than as bytes, so even a full redraw is cheap to bring across.

### Compute and drawing

MARS and RARS `feat/stage2` against the baseline Cores, each pass run on both in turn, five rounds, the best of the five for each; frames a second, and compute in instructions per millisecond. Three rounds ran while another session ran a full test suite (load 4.7 to 16.1); the last two ran on a quiet machine (load 0.6 to 1.7), and those gave nearly every best value.

| Core   | Build       | Undo | Full frame, frames/s | Window copy, frames/s |    Compute, /ms |
| ------ | ----------- | ---- | -------------------: | --------------------: | --------------: |
| MIPS   | JavaScript  | off  |     3.5 → 7.8 (2.2×) |    12.2 → 23.5 (1.9×) | 11,783 → 11,623 |
| MIPS   | JavaScript  | on   |     3.0 → 5.6 (1.9×) |    10.3 → 17.3 (1.7×) |   5,970 → 5,909 |
| RISC-V | JavaScript  | off  |     3.3 → 7.1 (2.2×) |    10.9 → 20.7 (1.9×) | 10,748 → 10,963 |
| RISC-V | JavaScript  | on   |     2.1 → 3.9 (1.9×) |     7.4 → 11.8 (1.6×) |   4,127 → 4,156 |
| MIPS   | WebAssembly | off  |    6.1 → 12.0 (2.0×) |    21.3 → 38.4 (1.8×) | 18,136 → 19,914 |
| MIPS   | WebAssembly | on   |     4.9 → 7.9 (1.6×) |    16.0 → 24.6 (1.5×) | 10,450 → 10,647 |
| RISC-V | WebAssembly | off  |    6.2 → 13.2 (2.1×) |    19.6 → 35.7 (1.8×) | 18,793 → 18,379 |
| RISC-V | WebAssembly | on   |     4.3 → 6.8 (1.6×) |    14.0 → 19.8 (1.4×) |   7,882 → 7,964 |

- **Drawing is 1.6 to 2.2 times faster for full frames and 1.4 to 1.9 times for window copies**, as decision 2 expected from removing the call out of the Core on every store. The compute loop stores nothing, and its column is the same on both sides, which is what says the comparison was fair.
- **On WebAssembly a full 640 × 480 redraw now takes 76 to 83 ms** with Undo off (12 to 13.2 frames a second) and a window copy 26 to 28 ms. With Undo on, the history is what is left: a full frame keeps 66% of that rate on MIPS and 52% on RISC-V, which is M2's BackStepper target.
- **The gain is smaller with Undo on** (1.4 to 1.9 times), because the history's share of each store is untouched.

### asmOS

The same interleaving, one run of each script on each side, on a quiet machine (load 0.8 to 1.7), milliseconds, the baseline first; boot twice, once per script:

| Core   | Build       | Undo | Boot                      | Start menu | Notepad opens | Drag step | Drag back, 8 steps | Assembly Editor opens | Assembly Editor key |
| ------ | ----------- | ---- | ------------------------- | ---------: | ------------: | --------: | -----------------: | --------------------: | ------------------: |
| RISC-V | JavaScript  | off  | 2,636–2,709 → 2,040–2,066 |  159 → 104 |     860 → 624 | 163 → 147 |          745 → 504 |           1,190 → 771 |           172 → 121 |
| RISC-V | JavaScript  | on   | 2,992–3,063 → 2,425–2,448 |  215 → 128 |   1,327 → 910 | 177 → 152 |          903 → 503 |         1,567 → 1,242 |           224 → 194 |
| RISC-V | WebAssembly | off  | 2,104–2,129 → 1,834–1,893 |  120 → 115 |     466 → 328 | 177 → 152 |          523 → 516 |             522 → 358 |             84 → 68 |
| RISC-V | WebAssembly | on   | 2,326–2,391 → 1,970–1,989 |  116 → 105 |     671 → 488 | 159 → 145 |          517 → 511 |             770 → 662 |            121 → 96 |
| MIPS   | JavaScript  | off  | 2,439–2,569 → 1,977–2,000 |  137 → 107 |     792 → 498 | 179 → 157 |          649 → 506 |             939 → 664 |            147 → 86 |
| MIPS   | JavaScript  | on   | 2,775–2,878 → 2,241–2,406 |  140 → 114 |     990 → 721 | 171 → 150 |          687 → 510 |           1,186 → 870 |           182 → 108 |
| MIPS   | WebAssembly | off  | 2,070–2,077 → 1,836–1,851 |   135 → 82 |     496 → 335 | 171 → 147 |          524 → 491 |             535 → 355 |             82 → 60 |
| MIPS   | WebAssembly | on   | 2,210–2,255 → 1,944–2,011 |   107 → 93 |   1,035 → 434 | 173 → 151 |          516 → 498 |             672 → 515 |            109 → 96 |

- **Everything that redraws is faster:** boot by 0.2 to 0.6 s, opening Notepad by 1.3 to 1.6 times (2.4 on MIPS WebAssembly with Undo, whose baseline sample looks slow), opening the Assembly Editor by 1.2 to 1.5 times, and its key by 1.1 to 1.7 times, most on JavaScript.
- **The drag no longer costs what it did, but its times have reached the harness's floor.** One step is 145 to 157 ms against 159 to 179, of which 90 ms is the harness's own moving and pressing; eight steps take about 500 ms on every configuration now, where the baseline's JavaScript took up to 900. What a drag step costs asmOS itself is now under what this harness can see; M2 needs a finer probe (a mark after the button is released) to see its gains there.
- With WebAssembly and M1, a key in the Assembly Editor shows in 60 to 96 ms, the 30 ms of the key press included, and Notepad opens in a third to half a second.

## After M3

M3 adds interrupt delivery and the timers to both Cores (ADR 0074). What it costs every program is
what the simulate loop now does per instruction:

- **MARS:** one test of a static flag before the instruction (has anything interrupts depend on
  changed?), and one more after it (is the timer on?). Status and Cause are only read when the first
  is set, and Count's match with Compare is worked out once per write, not per instruction.
- **RARS:** the same flag, which replaces the three CSR reads (`uip`, `uie`, `ustatus`, Java `long`s)
  and three pending-flag calls the loop made on every instruction before; and, only while the timer
  is armed, a countdown that reads the host's clock every 1,024 instructions.

Measured on the Cores alone, under Node: a script assembles the compute loop (`addi` and `j`) or a
full-frame fill (a `sw` per word of a 640 × 480 grid, with `trackWrites` armed and the blocks taken
after every 50,000-instruction call), and runs it in 50,000-instruction calls for five seconds after a
warm-up. The M1 dists (copied before M3) and the M3 dists ran in turn, three rounds, the order
alternating, with other sessions' test suites running on the machine (load 2.5 to 6.4); the best
second of each, instructions per millisecond:

| Core   | Build       | Undo | Program |     M1 |     M3 | Change |
| ------ | ----------- | ---- | ------- | -----: | -----: | -----: |
| MIPS   | JavaScript  | off  | compute | 13,934 | 13,449 |    −3% |
| MIPS   | JavaScript  | off  | fill    |  7,267 |  7,238 |     0% |
| MIPS   | JavaScript  | on   | compute |  8,031 |  7,977 |    −1% |
| MIPS   | JavaScript  | on   | fill    |  4,922 |  4,745 |    −4% |
| MIPS   | WebAssembly | off  | compute | 19,267 | 19,429 |    +1% |
| MIPS   | WebAssembly | off  | fill    | 12,890 | 13,107 |    +2% |
| MIPS   | WebAssembly | on   | compute | 10,657 | 11,703 |   +10% |
| MIPS   | WebAssembly | on   | fill    |  8,131 |  8,424 |    +4% |
| RISC-V | JavaScript  | off  | compute | 10,762 | 14,691 |   +37% |
| RISC-V | JavaScript  | off  | fill    |  6,370 |  9,114 |   +43% |
| RISC-V | JavaScript  | on   | compute |  4,353 |  5,103 |   +17% |
| RISC-V | JavaScript  | on   | fill    |  3,549 |  3,857 |    +9% |
| RISC-V | WebAssembly | off  | compute | 19,898 | 22,541 |   +13% |
| RISC-V | WebAssembly | off  | fill    | 12,739 | 13,492 |    +6% |
| RISC-V | WebAssembly | on   | compute |  8,290 |  8,634 |    +4% |
| RISC-V | WebAssembly | on   | fill    |  5,739 |  6,817 |   +19% |

The MIPS compute rows combine that run with a second, four rounds of compute alone, which also
tried the two flags in a class without a static initializer (TeaVM's JavaScript otherwise calls the
class initializer check before the first): it measured the same as M3, so M3 keeps them in
Coprocessor0.

- **MIPS costs nothing measurable:** every row is within the ±10% a single pass swings by on this
  machine. A first three-round pass put compute with Undo off at −8 to −9% on both builds; the second,
  longer one did not repeat it.
- **RISC-V is faster:** the per-instruction CSR reads M3 removed cost more than the flag that replaced
  them, most on the JavaScript build, where each was a Java `long`.
- The editor-level `framebuffer.measure.ts` needs both Cores to have M3's API (the adapter now
  raises interrupt lines), so it cannot run the M1 dists any more: the comparison is on the Cores.

## After M2

M2 is the time-boxed pass of decision 3 over the four targets the plan names, one at a time, each
kept only when both Cores' suites (JavaScript and WebAssembly) and the editor's MIPS, RISC-V and
`mars` tests passed and it measured faster. Three of the four, and part of the fourth, were kept.

### How it was measured

On the Cores alone, under Node, with the observers the editor's `MarsDevices` registers (the four
keyboard and display registers, the extension block's range from 0xFFFF0100, and three read
observers): a script assembles one of three programs and runs it in 50,000-instruction calls, the
best and median 250 ms window after a second's warm-up, and each build of a pair runs in turn in a
process of its own, the order alternating each round:

- **compute:** the `addi`/`j` loop;
- **fill:** a `sw` per word of a 640 × 480 grid, with `trackWrites` armed and the written blocks
  taken and read after every call, as a flush does;
- **mixed:** a loop that loads, adds and stores a word and a byte of a 1 KB array and calls a
  function that saves and restores `ra` on the stack, a call every ten instructions as compiled C
  makes them.

The best of the rounds is given, instructions per millisecond, with Undo off and with the editor's
history of 200,000 steps. Profiles came from `node --cpu-prof` on the JavaScript build, which TeaVM
writes with its own names.

### What was kept

| Change                                   | Cores | What it removes                                                                                                                                                                                   |
| ---------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. The observers' bounds**             | both  | `Memory` keeps the lowest and highest address any observer watches; every fetch and data access outside them, which is nearly every one, skips the walk over the editor's eight observers         |
| **2. Call-stack frames reused**          | both  | every `jal`/`jalr` allocated a frame and a 32-register array for the debugger's call stack; the frames are now kept and refilled, and a host gets copies                                          |
| **2. The stack-top check**               | MARS  | `MemoryLayoutFacts.refreshStack`, run after every instruction, returns at once when `$sp` did not move                                                                                            |
| **3. No counters entry per instruction** | RARS  | every instruction pushed a `CONTROL_AND_STATUS_COUNTERS_DECREMENT` entry for `cycle` and `instret`; its newest entry now carries the count, so the history holds about twice as many instructions |
| **3. Narrow undo records**               | RARS  | a memory restore of a word or less, and an RV32 register restore, keep their values in ints instead of widening them to a Java `long`, which TeaVM's JavaScript makes a BigInt                    |
| **4. 32-bit registers for RV32**         | RARS  | see below                                                                                                                                                                                         |

Each step against the one before it, best of two rounds, load 0.9 to 2.8:

| Step                              | Core   | JS, Undo off: compute / fill / mixed | JS, Undo on        | wasm, Undo off     | wasm, Undo on      |
| --------------------------------- | ------ | ------------------------------------ | ------------------ | ------------------ | ------------------ |
| 1. observers' bounds              | MIPS   | +44% / +13% / +17%                   | +16% / +14% / +11% | +27% / +31% / +31% | +27% / +14% / +21% |
| 1. observers' bounds              | RISC-V | +32% / +57% / +12%                   | +11% / +9% / +7%   | +37% / +34% / +25% | +20% / +19% / +18% |
| 2. frames and stack top           | MIPS   | +4% / – / +63%                       | 0% / – / +31%      | +5% / – / +19%     | +3% / – / +13%     |
| 2. frames                         | RISC-V | – / – / +39%                         | – / – / +25%       | – / – / +18%       | – / – / +12%       |
| 3. counters entry                 | RISC-V | –                                    | +38% / +22% / +13% | –                  | +8% / +19% / +10%  |
| 4. RV32 registers, narrow records | RISC-V | +86% / +47% / +40%                   | +57% / +32% / +27% | +4% / +5% / +7%    | +5% / −4% / +2%    |

(Step 3's narrow undo records arrived with step 4, whose row includes them; a dash is a program
the step does not touch, not measured.)

All four together, the Cores before M2 against M2's, two rounds, load 0.8 and 1.0:

| Core   | Build       | Undo | Compute, /ms            | Fill, /ms               | Mixed, /ms             |
| ------ | ----------- | ---- | ----------------------- | ----------------------- | ---------------------- |
| MIPS   | JavaScript  | off  | 12,221 → 17,382 (1.42×) | 7,550 → 9,634 (1.28×)   | 4,437 → 8,396 (1.89×)  |
| MIPS   | JavaScript  | on   | 7,915 → 9,649 (1.22×)   | 5,328 → 6,194 (1.16×)   | 3,792 → 5,746 (1.52×)  |
| MIPS   | WebAssembly | off  | 18,680 → 25,353 (1.36×) | 10,688 → 15,365 (1.44×) | 8,877 → 14,288 (1.61×) |
| MIPS   | WebAssembly | on   | 10,734 → 13,819 (1.29×) | 7,490 → 9,014 (1.20×)   | 6,324 → 8,885 (1.41×)  |
| RISC-V | JavaScript  | off  | 12,089 → 29,924 (2.48×) | 7,313 → 12,372 (1.69×)  | 3,720 → 7,908 (2.13×)  |
| RISC-V | JavaScript  | on   | 4,731 → 11,679 (2.47×)  | 3,957 → 6,705 (1.69×)   | 2,568 → 5,028 (1.96×)  |
| RISC-V | WebAssembly | off  | 21,953 → 31,005 (1.41×) | 12,713 → 17,107 (1.35×) | 9,481 → 14,674 (1.55×) |
| RISC-V | WebAssembly | on   | 9,459 → 13,538 (1.43×)  | 6,890 → 9,472 (1.38×)   | 5,772 → 8,448 (1.46×)  |

- **RISC-V's JavaScript build runs 1.7 to 2.5 times as fast**, compute at about 30,000 instructions a millisecond with Undo off, now above MIPS's: its registers and undo records no longer go through BigInts.
- **Every configuration is faster**, by 1.16 times (MIPS, JavaScript, a fill with Undo on) to 2.5 (RISC-V, JavaScript, compute). Compiled C, which calls often, gains the most from the call stack: 1.4 to 2.1 times for the mixed program.

### Tried and not kept

- **A synchronous call for every instruction but `syscall`.** TeaVM compiles the simulate loop into
  a resumable state machine because `syscall` can wait for the host, and the instruction's call
  re-enters it through its `switch` on every instruction. Giving `syscall` an interface of its own
  left every other call a plain one, which the generated code confirmed, but MARS measured −6% to
  +4%: V8 runs the state machine's jumps for almost nothing now. Reverted.
- **The history's serials in an array of their own**, so that evicting the oldest entry of a full
  history reads a `double[]` instead of a cold object: −4% to +2% on MIPS. The profile's hot lines
  there were stalls, and a history of 2,000 entries ran only 3 to 6% faster than one of 200,000, so
  cache misses are not what Undo costs. Reverted.
- **`MAX_DIRTY_RUNS`** (the M1 open item). The written blocks every flush took during asmOS's
  `sim-timing.json` were recorded on both Targets (109 and 107 flushes, up to 328 runs) and replayed
  against a real Core with the editor's copy and color packing: a call costs 0.5 to 1.3 µs and a
  word about 4.3 ns, so reading runs separated by small gaps whole, as merging them would, saves
  little. Over the whole 18-second script every rule costs 19 to 28 ms, today's included, a tenth
  of a percent of the run, with differences inside the noise. `MAX_DIRTY_RUNS` stays.

### The RV32 spike: go

RARS's registers are Java `long`s, so on the JavaScript build every register read, write and undo
record of an RV32 program was BigInt arithmetic (`Long_lo`, `Long_fromInt`). The spike made an
integer register _narrow_ on RV32: `Register` holds an `int` beside its `long` and reads it as the
`long` sign-extended, `RegisterFile.updateRegister(int, int)` and `getValue(int)` never touch a
`long` on RV32 (and every call site passing an `int` picks the new overload by itself), the
BackStepper's register and memory records keep `int`s, and the instructions RV32 programs run most
take `int` paths: `computeW` for the base ALU, the M extension's `mul` and the Zbb/Zba ones that are
one line, `loadNarrow`/`storeNarrow` for the loads and stores of a word or less, and `int`
comparisons in the six branches. RV64 is unchanged: every narrow path falls back to the `long` one.

It took about an hour and measured +27% to +86% on the JavaScript build and −4% to +7% on
WebAssembly, where a `long` is a native 64-bit integer, so it was kept. The one loss, a fill with Undo
on WebAssembly at −4% over five rounds, is a store's undo record taking a narrow path there that
costs a little more than widening its value did. The one difference programs
can see: an RV32 register holds 32 bits, as RV32's do. A 64-bit value reaching one keeps its low half,
which matters for `csrr t0, time`, `cycle` or `instret` (the low 32 bits; `timeh` and the others give
the high ones) and for a Poke of a wider value; before, the register kept all 64 bits, which a
branch then compared. Checked by a differential run of 90 random programs (about 15,000 steps of ALU,
load, store, branch, `lui`/`auipc` and, on RV64, W instructions) against the build before, register
by register after every step and after every Undo, on RV32 and RV64, JavaScript and WebAssembly.

### Drawing, on the editor's harness

`framebuffer.measure.ts`, as before, on the Cores before M2 and after it, two rounds interleaved,
the best of each, load 1.1 to 1.3:

| Core   | Build       | Undo | Full frame, frames/s | Window copy, frames/s |            Compute, /ms |
| ------ | ----------- | ---- | -------------------: | --------------------: | ----------------------: |
| MIPS   | JavaScript  | off  |    7.2 → 9.3 (1.29×) |   21.5 → 29.1 (1.35×) | 11,700 → 16,470 (1.41×) |
| MIPS   | JavaScript  | on   |    5.5 → 6.3 (1.15×) |   16.6 → 19.5 (1.17×) |   5,652 → 6,747 (1.19×) |
| RISC-V | JavaScript  | off  |   7.5 → 14.6 (1.95×) |   22.1 → 39.1 (1.77×) | 12,148 → 21,806 (1.80×) |
| RISC-V | JavaScript  | on   |    4.2 → 6.4 (1.52×) |   12.7 → 19.5 (1.54×) |   4,572 → 6,820 (1.49×) |
| MIPS   | WebAssembly | off  |  11.2 → 14.3 (1.28×) |   34.4 → 43.0 (1.25×) | 17,900 → 24,382 (1.36×) |
| MIPS   | WebAssembly | on   |    7.6 → 9.0 (1.18×) |   23.5 → 28.6 (1.22×) |  9,971 → 12,124 (1.22×) |
| RISC-V | WebAssembly | off  |  13.2 → 18.7 (1.42×) |   37.5 → 54.6 (1.46×) | 20,895 → 31,227 (1.49×) |
| RISC-V | WebAssembly | on   |    6.9 → 9.2 (1.33×) |   20.6 → 27.9 (1.35×) |  8,644 → 11,902 (1.38×) |

- **A full 640 × 480 frame on WebAssembly now takes 53 ms on RISC-V and 70 ms on MIPS** with Undo off, and a window copy 18 to 23 ms: about three times the frames a second of M0, 5.3 and 5.4.
- The editor's compute numbers are lower than the Cores' alone: they include the adapter's slices and their Screen updates.

### asmOS

The same scripts on the same units, one run of each on each side, interleaved, milliseconds,
before M2 → after; boot twice, once per script:

| Core   | Build       | Undo | Boot                      | Start menu | Notepad opens | Drag step | Drag back, 8 steps | Assembly Editor opens | Assembly Editor key |
| ------ | ----------- | ---- | ------------------------- | ---------: | ------------: | --------: | -----------------: | --------------------: | ------------------: |
| RISC-V | JavaScript  | off  | 2,070–2,081 → 1,903–1,910 |   113 → 95 |     543 → 381 | 151 → 149 |          505 → 510 |             714 → 515 |            110 → 70 |
| RISC-V | JavaScript  | on   | 2,373–2,388 → 2,018–2,030 |  123 → 102 |     866 → 593 | 154 → 143 |          507 → 497 |           1,185 → 675 |           168 → 113 |
| RISC-V | WebAssembly | off  | 1,809–1,825 → 1,723–1,753 |    84 → 82 |     348 → 239 | 150 → 132 |          504 → 517 |             430 → 251 |             67 → 52 |
| RISC-V | WebAssembly | on   | 1,951–1,989 → 1,898–1,902 |   101 → 90 |     503 → 387 | 149 → 148 |          509 → 506 |             617 → 409 |             77 → 76 |
| MIPS   | JavaScript  | off  | 1,978–2,066 → 1,909–1,947 |  106 → 100 |     541 → 385 | 156 → 157 |          505 → 567 |             719 → 513 |             95 → 74 |
| MIPS   | JavaScript  | on   | 2,197–2,390 → 2,100–2,127 |  121 → 113 |     654 → 594 | 157 → 150 |          514 → 507 |             871 → 731 |           105 → 109 |
| MIPS   | WebAssembly | off  | 1,788–1,863 → 1,757–1,789 |    88 → 81 |     334 → 287 | 141 → 145 |          501 → 515 |             412 → 309 |             62 → 67 |
| MIPS   | WebAssembly | on   | 1,989–2,012 → 1,897–1,900 |   97 → 115 |     492 → 376 | 146 → 147 |          504 → 503 |             563 → 460 |             72 → 68 |

Load 0.3 to 1.3. A key's time, 52 to 113 ms with the harness's 30 ms of pressing, moves by a few milliseconds either way, inside one sample's noise.

- **Everything that redraws is faster:** opening Notepad by 1.1 to 1.5 times, the Assembly Editor
  by 1.2 to 1.8 times, the most on RISC-V, whose JavaScript build with Undo opens it in 675 ms
  instead of 1,185.
- **The drag step and the drag back still sit at the harness's floor** (about 150 and 500 ms), now
  with up to twice the instructions inside the same time.

## After M5

M5 gives every MIPS and RISC-V program 64 MB for static data and the heap (decision 7): the data
segment's block table has a length of its own, 16,384 blocks of 4 KB, from 0x10000000 to
0x14000000, while the stack and the kernel data keep 4 MB. Nothing it changes is per instruction,
and the address checks it moves are the comparisons the Cores already made: six rounds of the fill,
M2's Cores against M5's, measured −1.9% on MIPS and +2.0% on RISC-V, inside the noise. The table is
the only memory it adds, 16,384 empty references made at each assembly.

- **The data segment ends at 0x14000000**, so `dataSegmentLimitAddress`, sbrk's limit, the GNU
  profile's static-data check (67,043,328 bytes from 0x10010000) and the MARS and RARS dialects'
  data directives all follow. sbrk past 0x14000000 still ends the program with
  `request (...) exceeds available heap storage`.
- **`.bss` does not count towards the 16 MiB output limit** (decision 12): the total counts
  sections that emit bytes, a zeroed section may reserve up to 1 GiB before the data segment's end
  bounds it, and emitting a fragment of zeros now writes nothing at all instead of looping over its
  bytes, which memory already holds as zero. 20 MB of `.bss` assembles at once.
- **The editor:** `MARS_DATA_SEGMENT_END` in `marsDisplay.ts` feeds `<sim.h>`'s generator, whose
  `SIM_SCREEN` assertion is now `<= 67043328`; the Runtime library pages' memory paragraph and the
  sbrk service's text say 64 MB and that MARS and RARS stop at 0x10400000.
- **The `screen-too-large-*` fixtures** (six, MIPS, RISC-V and RISC-V-64 with Clang and GCC at
  -O0) hold Compiler Explorer's static-assertion failure against the old limit, and still replay as
  that. With the new header no `SIM_SCREEN` can fail it: the largest grid the display takes, 1024 by
  1024 words, is 4 MiB. Their answers recaptured at M9 would be successful compiles with a 4 MiB
  grid, and `environmentLibraryFixtures.test.ts`'s test of them, and `capture-fixtures.mjs`'s
  `SCREEN_TOO_LARGE`, have to change with them: into a check that the largest grid builds and shows,
  or out. M9 made them `screen-largest-*`, that check.

## asmOS after M7

M7 brings asmOS on MIPS and RISC-V up to the stage-2 machine (asm-examples, `feat/stage2`,
`shared/asmos/`):

- **Preemption:** a hand-written trap handler per processor, `os/platform/riscv/trap.riscv` (installed
  in `utvec`) and `os/platform/mips/trap.mips` (in `.ktext`), keeps every register of the stopped
  process in a frame on its own stack and asks the kernel, in C, which process goes on. RISC-V's
  timer is `timecmp`, set 10 ms of running time on at each tick; MIPS's is Compare, a turn's worth of
  Count on, the turn measured at boot against syscall 30 (100 ms of a load-add-store loop after
  100 ms of warming up: a first version measured 50 ms at once, and the WebAssembly build, not warm
  yet, ran a third as fast there as later, which made its turns 2 ms long). A process gives the
  processor up with `csrsi uip, 1` on RISC-V and a `teq` the handler knows by its address on MIPS.
  Any other exception ends asmOS with a line saying what, where and in which process.
- **Memory:** the back buffer, the wallpaper picture, the Video Player, Paint's five undo levels and
  the Assembly Editor's full limits are back; the process table is x86's, 32 processes of 128
  messages; each stack is a 64 KB slot of the stack segment.
- **Sound:** `os/platform/sim/sound.c` writes MIDI bytes to the MIDI port and samples, two to a word,
  to the sampled-audio output.

### How it was measured

As in M0 and M2: asmOS's harness, `sim-timing.json` and the Assembly Editor key, the units compiled
by the local Clang 21.1.0. Stage 1 is asm-examples 618f939 (the main checkout's
`packages/examples`), M7 the `feat/stage2` worktree; both run on the same editor and Cores (this
worktree after M5), one run of each, interleaved, load 0.8 to 1.5. The MIPS rows were measured again
after the calibration fix.

### asmOS, stage 1 → M7

Milliseconds; boot twice, once per script:

| Core   | Build       | Undo | Boot                      | Start menu | Notepad opens | Drag step | Drag back, 8 steps | Assembly Editor opens | Assembly Editor key |
| ------ | ----------- | ---- | ------------------------- | ---------: | ------------: | --------: | -----------------: | --------------------: | ------------------: |
| RISC-V | JavaScript  | off  | 1,865–1,895 → 2,219–2,302 |   95 → 110 |     384 → 706 | 149 → 239 |          510 → 505 |             409 → 924 |             74 → 67 |
| RISC-V | JavaScript  | on   | 2,017–2,039 → 2,539–2,544 |  130 → 129 |   529 → 1,064 | 148 → 348 |          501 → 604 |           725 → 1,663 |           103 → 109 |
| RISC-V | WebAssembly | off  | 1,732–1,736 → 1,953–1,969 |    82 → 89 |     237 → 390 | 132 → 211 |          514 → 507 |             258 → 566 |             64 → 60 |
| RISC-V | WebAssembly | on   | 1,865–1,888 → 2,179–2,231 |   99 → 110 |     389 → 644 | 156 → 260 |          504 → 506 |           404 → 1,123 |             81 → 77 |
| MIPS   | JavaScript  | off  | 1,894–2,002 → 2,452–2,492 |  112 → 112 |     417 → 799 | 147 → 307 |          508 → 503 |           467 → 1,288 |             70 → 92 |
| MIPS   | JavaScript  | on   | 2,109–2,123 → 2,728–2,817 |  102 → 108 |   538 → 1,059 | 153 → 353 |          557 → 660 |           784 → 1,919 |           103 → 105 |
| MIPS   | WebAssembly | off  | 1,753–1,829 → 2,182–2,228 |    83 → 85 |     285 → 514 | 131 → 194 |          489 → 505 |             257 → 619 |             59 → 74 |
| MIPS   | WebAssembly | on   | 1,874–1,890 → 2,480–2,561 |   88 → 111 |     386 → 786 | 145 → 248 |          506 → 502 |           455 → 1,131 |             67 → 77 |

- **Opening a window takes about twice as long as on stage 1 with the same Cores**, Notepad 1.6 to
  2 times and the Assembly Editor 2.2 to 2.8 times, because it runs about twice the instructions:
  2.7 to 3.2 million for Notepad before, 4.7 to 5.4 million now, and 3.2 to 3.8 million for the
  Assembly Editor before, 7.3 to 8.8 million now. Against M0's numbers, stage 1 on the Cores before
  stage 2, M7 is about even: Notepad in 706 ms against 802 to 837 on RISC-V's JavaScript build, 514
  against 419 on MIPS's WebAssembly.
- **Keys and the Start menu cost what they did**: a key in the Assembly Editor shows in 60 to 110 ms,
  the harness's 30 ms of pressing included; the Start menu takes 0.38 to 0.40 million instructions
  instead of 0.27 to 0.29.
- **Boot takes 0.2 to 0.6 seconds longer**, 2.2 to 2.4 million instructions before, 4.7 to 5.2
  million now, and on MIPS the 200 ms of Count's calibration.
- **The drag back is still at the harness's floor** (about 500 ms); the single drag step costs 1.5
  to 2.1 million instructions instead of 0.5 to 1.

Where the doubling comes from, measured apart on RISC-V's WebAssembly build with Undo off: the
back buffer (`-DPLATFORM_BACK_BUFFER=0`, which also drops the wallpaper picture) and the timer (a
scratch build whose `platform_timer` does nothing, so a process runs until it waits), two rounds
each, milliseconds and millions of instructions:

| M7 build                 | Boot                  | Notepad opens     | Drag step         | Assembly Editor opens |
| ------------------------ | --------------------- | ----------------- | ----------------- | --------------------- |
| as shipped               | 1,904–2,007 (4.7–5.1) | 390–432 (5.3–5.6) | 144–146 (1.5–1.6) | 614–615 (8.2–8.6)     |
| no timer                 | 1,915–1,990 (4.7–5.1) | 329–336 (4.4)     | 144–206 (1.5–2.1) | 409–458 (6.0–6.2)     |
| no timer, no back buffer | 1,727–1,760 (2.2–2.4) | 274–294 (3.8)     | 126–128 (1.0)     | 358–359 (5.1–5.3)     |
| stage 1 (from the table) | 1,732–1,736 (2.2–2.6) | 237 (3.1)         | 132 (1.0)         | 258 (3.6)             |

- **The back buffer** doubles boot (the splash and the desktop are composed, then copied) and adds a
  sixth to opening a window: what it shows is copied to the screen by `memcpy`, about three
  instructions a pixel, where x86's `rep movsb` copies a row in one. Measured on all four
  configurations with Undo off, without it Notepad opens in 332 to 600 ms instead of 389 to 753,
  the Assembly Editor in 414 to 1,033 instead of 616 to 1,190, a drag step in 125 to 156 instead of
  153 to 303.
- **The timer** adds a fifth to two fifths to opening an application: every 10 ms of the application's
  first drawing the system process takes its turn and composes what is dirty so far, so the new
  window is copied to the screen several times before it is finished. On x86 the same happens, but
  a copy there costs a few instructions a row.
- What remains against stage 1, a fifth to a half more instructions, is not apportioned: stage 1's
  own cooperative pacing, the larger process table and the kernel's other changes.

### Preemption

`sim-busy.json` sorts 30,000 lines in the Terminal, a `qsort` that never gives the processor up, and
meanwhile opens the Start menu, opens Notepad from it and drags Notepad by one step (JavaScript
build, Undo off; M7 on WebAssembly in brackets):

| Core   | Start menu while sorting | Notepad opens while sorting | Drag step while sorting |
| ------ | -----------------------: | --------------------------: | ----------------------: |
| RISC-V |          147 → 147 (151) |     not in 30 s → 915 (615) | not in 30 s → 400 (309) |
| MIPS   |          158 → 155 (154) |   not in 30 s → 1,177 (717) | not in 30 s → 510 (355) |

Stage 1 still opened the Start menu, while the Terminal was reading the file, which has yield
points; once `qsort` ran, nothing else ran until the sort ended, and Notepad did not open within 30
seconds.

### Memory, stacks and sound

- **Memory:** static data is 2,104 KB (1,460 and 1,464 on stage 1), the process table taking most of
  the difference; the back buffer is the heap's first 1.2 MB. 62 MB are left after boot, 60 MB with
  a few applications open, 58 MB with the Video Player's video read.
- **Stacks**, measured with the harness's new `stacks` action at the end of every script: the deepest
  an application's slot was written was 9 KB (the Terminal), and the system's own stack 12 KB. A
  slot of 64 KB leaves room for a trap frame at the deepest point and for paths the scripts do not
  take; DOOM's largest locals are 1 to 2 KB and its recursion shallow, to be measured in M8.
- **Sound**, counted by the harness's new `audio` action from what the Audio sends its output: the
  boot chime 20 MIDI messages and 9 notes; the Music Player about 100 messages in its first 8
  seconds of Canon in D; Blocks 127 messages and 62 notes in a few seconds of play; Pac-Man 227,000
  frames at 22,050 a second over its script; the Video Player 59,000 to 67,000 frames at 16,000 a
  second every 4 seconds, which is real time on both WebAssembly builds and RISC-V's JavaScript, and
  about 90% of it on MIPS's JavaScript build.
- **Count's calibration** says 7,214 a millisecond on MIPS's WebAssembly build and 4,017 to 4,058 on
  its JavaScript build: a turn of 72,140 and 40,580 Counts, 144,000 and 81,000 instructions.
- **The Assembly Editor** runs `code/speed.riscv` at 200 and 87 thousand RISC-V instructions a second
  on RISC-V (WebAssembly and JavaScript), and 130 and 55 thousand on MIPS. Stage 1's README gave 25
  thousand on RISC-V and 80 thousand on MIPS.

### Compiler Explorer answer sizes

The local Clang's answers for M7's units, with the earlier calibration (96 to 100 bytes a line) and
a model that writes each line as Compiler Explorer's JSON does (the text with tabs expanded, the
source with its column, and a label entry for each label an instruction names), which comes to
109 to 112 bytes a line:

| Target | Unit             | Optimization |   Lines | At 96–100 B/line, MiB | Modelled, MiB |
| ------ | ---------------- | ------------ | ------: | --------------------: | ------------: |
| RISC-V | `os/main.c`      | -O2          |  88,454 |               8.1–8.4 |           9.3 |
| RISC-V | `os/apps/apps.c` | -Os          | 124,764 |             11.4–11.9 |          13.2 |
| RISC-V | `os/ide/ide.c`   | -O2          |  65,447 |               6.0–6.2 |           7.0 |
| MIPS   | `os/main.c`      | -O2          |  90,959 |               8.3–8.7 |           9.5 |
| MIPS   | `os/apps/apps.c` | -Os          | 135,025 |             12.4–12.9 |          14.2 |
| MIPS   | `os/ide/ide.c`   | -O2          |  71,435 |               6.5–6.8 |           7.6 |

Every unit stays under 16 MiB. The closest is MIPS's `apps.c`, at 12.4 to 14.2 MiB, which the Video
Player grew by about 10,000 lines (about 1 MiB); at 120 bytes a line it would be 15.5 MiB. If M9's
real answer is over, the Video Player can be compiled apart, as the Assembly Editor is. The modelled
rate also fits stage 1's report that `apps.c` at -O2 was over the cap: 151,367 lines at 110 bytes a
line are 15.9 MiB, at the edge.

## DOOM after M8

M8 brings DOOM to asmOS on MIPS and RISC-V (asm-examples, `feat/stage2`, `shared/asmos/`):

- **DOOM's x86 assembly is left out by the preprocessor**, not stubbed. `os/doom/asmos_x86.h` sets
  `DOOM_X86` (1 on x86-64 only) and declares what x86's assembly defines; every call is under
  `#if DOOM_X86`, so a MIPS or RISC-V Build has no reference to any of it:
    - `doom_column`, `doom_column2`, `doom_span`, `doom_span2` (`r_draw.c`, `r_plane.c`,
      `asmos_segloop.c`) and the `doom_simd` switch;
    - `doom_palette_row`, `doom_palette_row2`, `doom_row_changed` (`i_asmos.c`);
    - `doom_mix_add`, `doom_mix_out` (`i_asmos_sound.c`);
    - the 17 `bench_*` loops, with the C of Benchmark CPU around them;
    - `doom_fresh`.

    No other x86 symbol turned up: the four parts linked on both Targets at the first Build.

- **The Game menu** leaves out Fast Drawing (AVX2), Profile and Benchmark CPU off x86; its checks
  are found by id rather than by place in the array.
- **One game per boot:** a second DOOM in one boot says "DOOM plays once each time asmOS starts.
  Restart asmOS to play DOOM again."
- **The packs:** `PLATFORM_DOOM` is 1 in `os/platform/sim/machine.h`; `build.mjs` no longer leaves
  `os/doom/` and `games/doom/` out of RISC-V and MIPS, whose packs already drop every `.asm`
  (`doom_simd.asm`, `asmos_bench.asm`, `asmos_fresh.asm`, the `.part.asm` wrappers).
- **MIPS's Count calibration** now takes the fastest of five 20 ms windows after the 100 ms warm-up:
  one boot in four measured 147 Counts a millisecond instead of about 3,500 (a pause of the host,
  most likely its garbage collector, inside the single 100 ms window), which made a turn 3,000
  instructions long.

### How it was measured

asmOS's harness (`MarsHarness.test.ts`, copied to `.cache/m8` with `.cache/asmos-m8.config.mts`),
`sim-doom.json` with `AUTOSTART=doom`: the title, the Game menu, Frame Times on, the first attract
demo to its end, DOOM's menu, a new game, a few steps and shots, the window closed, DOOM opened
again. Units compiled by the local Clang 21.1.0 at -O2 (`apps.c` -Os), without source annotations,
as `recompile.task.ts` compiles; Undo off; `OS_LEAVE_OUT=videos/` (see the Project size below).
One run of each configuration, one after the other, load 1.1 to 1.5. The frame rate is DOOM's own
measure of its first demo: the frames shown while it played over its length (`doom_last_tenths`,
read with the harness's new `peek` action).

### Frames a second

| Core   | Build                  | Demo 1, frames a second | Demo 1 ended, after boot | Millions of instructions a second | Instructions a frame | Demo 1: tics, sum |
| ------ | ---------------------- | ----------------------: | -----------------------: | --------------------------------: | -------------------: | ----------------- |
| RISC-V | JavaScript             |                     2.3 |                    434 s |                               5.7 |          2.5 million | 5,026, `cf6b7f4d` |
| RISC-V | WebAssembly            |                     4.9 |                    216 s |                              11.6 |          2.4 million | 5,026, `cf6b7f4d` |
| MIPS   | JavaScript             |                     1.9 |                    526 s |                               5.2 |          2.7 million | 5,026, `cf6b7f4d` |
| MIPS   | WebAssembly            |                     3.8 |                    278 s |                               9.5 |          2.5 million | 5,026, `cf6b7f4d` |
| x86    | Blink, Fast Drawing on |         22.1 (M7: 22.7) |             before 219 s |                              13.6 |                    — | 5,026, `cf6b7f4d` |

- **The demo plays tic for tic as on x86** on both Targets and both builds: Clang's RV32 and MIPS32
  code and GCC's x86-64 code give the same sum, so no difference of `long`'s size, alignment or
  `char`'s sign (unsigned on RISC-V) reaches the game's logic.
- **DOOM's world runs slow** below about 9 frames a second: its single-player loop builds at most
  three tics ahead of the last frame (`BuildNewTic`), so it ran 10 to 12 tics a second on the
  JavaScript builds and 19 to 25 on WebAssembly over demo 1 (35 is real time).
- **Where a frame goes** (Frame Times, RISC-V JavaScript, in the demo): thousands of instructions L
  293 (the logic, T 265 of it the thinkers), W 483 walls, F 373 floors; x86's are L 81, W 325 and
  F 65 with AVX2.
- **x86 is unchanged:** the x86 row is this tree on the x86 Core, compiled by the host's GCC as
  asmOS's `asm.sh` does; its screenshots match M7's pixel for pixel but for the timing-dependent
  ones (DOOM's frames, a video frame, a caret).

### Memory, stacks and sound

- **Memory:** static data 3,208 KB on RISC-V and 3,212 on MIPS (2,104 at M7: DOOM's tables and
  buffers, 0.6 MB of it the overlays' strips); the heap 1.3 MB after boot and 11.9 MB with DOOM
  playing, 10.4 MB of it DOOM's (the IWAD read whole, 4.0 MB, and its 6 MB zone); 50 MB of the 64
  are left.
- **Stacks** (`stacks` action, after playing): DOOM's slot 11 to 12 KB of its 64, the system's 9 to
  12 KB.
- **Sound** (`audio` action): from the demo's first minute to its end, 3,303 to 9,647 MIDI messages (1,481 to 4,312 notes) on
  the MIDI port, and 1.8 to 4.9 million frames on the sampled-audio output at 11,025 a second,
  93% (MIPS JavaScript) to 98% (RISC-V WebAssembly) of real time; in play, firing three shots gave
  90,000 to 138,000 frames in 12 seconds.

### Compiler Explorer answer sizes

DOOM's four parts at -O2, with source annotations as the editor's Compile sends them, in M7's model
of Compiler Explorer's JSON (108 to 115 bytes a line here); every one is under 16 MiB. Without
annotations, as `recompile.task.ts` sends them, each is 3 to 6% fewer lines.

| Target | Unit                    |  Lines | At 96–100 B/line, MiB | Modelled, MiB |
| ------ | ----------------------- | -----: | --------------------: | ------------: |
| RISC-V | `os/doom/doom_game.c`   | 52,685 |               4.8–5.0 |          5.75 |
| RISC-V | `os/doom/doom_play.c`   | 76,200 |               7.0–7.3 |          8.38 |
| RISC-V | `os/doom/doom_render.c` | 50,044 |               4.6–4.8 |          5.17 |
| RISC-V | `os/doom/doom_world.c`  | 78,418 |               7.2–7.5 |          8.16 |
| MIPS   | `os/doom/doom_game.c`   | 60,743 |               5.6–5.8 |          6.67 |
| MIPS   | `os/doom/doom_play.c`   | 86,136 |               7.9–8.2 |          9.46 |
| MIPS   | `os/doom/doom_render.c` | 54,958 |               5.0–5.2 |          5.71 |
| MIPS   | `os/doom/doom_world.c`  | 89,658 |               8.2–8.6 |          9.24 |

### Project size: over the editor's 16 MiB

A Project holds at most 16 MiB of Files (`FILE_BYTE_LIMIT`, `projectFiles.ts`), which opening or
importing a Project, the run's file system and asm-examples' packer all enforce. DOOM brings 4.0 MiB
of IWAD, 1.5 MiB of source and its Generated assembly, which Compiler Explorer writes with tabs
expanded. Estimated from the local Clang's output, tabs expanded (which reproduces the size of the
tree's Compiler Explorer Files, line for line, within about 1%), with the ports' other Files as they are:

| Port   | Compiled as                             | Generated assembly, MiB | Project, MiB | Without `videos/`, MiB |
| ------ | --------------------------------------- | ----------------------: | -----------: | ---------------------: |
| RISC-V | with annotations (the editor's Compile) |                    9.75 |         19.2 |                   16.9 |
| RISC-V | without (`recompile.task.ts`)           |                    6.40 |         15.9 |                   13.5 |
| RISC-V | without, DOOM's parts at -Os            |                    5.74 |         15.2 |                   12.8 |
| MIPS   | with annotations                        |                   11.09 |         20.6 |                   18.2 |
| MIPS   | without                                 |                    7.85 |         17.3 |                   15.0 |
| MIPS   | without, DOOM's parts at -Os            |                    7.03 |         16.5 |                   14.1 |

x86's port, for comparison, is 13.3 MiB of Files and the 1.5 MiB of its Build output, `os/main`.

DOOM's parts at -Os cost nothing measurable: 5.0 frames a second on RISC-V's WebAssembly build and
3.9 on MIPS's over demo 1 (4.9 and 3.8 at -O2), with the same sum.

So the MIPS port does not fit as compiled at M9, and the RISC-V one only just, with 0.1 MiB left
for what asmOS writes; pressing Compile in the editor, with annotations, takes either over. The
harness ran every M8 script with `OS_LEAVE_OUT=videos/` for this reason. Deciding it is the
owner's: raise the editor's limit, leave the Video Player's video out of these two ports, compile
DOOM at -Os, or a mix.

## After M9

M9's single Compiler Explorer pass, through `recompile.task.ts` without source annotations: 19
asmOS units and the six `screen-largest-*` fixtures, 25 requests. The answers' sizes, as received:

| Target | Unit                    | Optimization | Answer, MiB | Generated assembly, MiB |
| ------ | ----------------------- | -----------: | ----------: | ----------------------: |
| x86    | `os/main.c`             |          -O1 |        3.93 |                    0.39 |
| x86    | `os/apps/apps.c`        |          -O1 |        9.08 |                    0.99 |
| x86    | `os/ide/ide.c`          |          -O2 |        5.43 |                    0.55 |
| x86    | `os/doom/doom_render.c` |          -O2 |        4.00 |                    0.49 |
| x86    | `os/doom/doom_world.c`  |          -O2 |        5.64 |                    0.62 |
| RISC-V | `os/main.c`             |          -O2 |        7.66 |                    0.85 |
| RISC-V | `os/apps/apps.c`        |          -Os |       10.95 |                    1.40 |
| RISC-V | `os/ide/ide.c`          |          -O2 |        5.85 |                    0.79 |
| RISC-V | `os/doom/doom_game.c`   |          -Os |        3.15 |                    0.46 |
| RISC-V | `os/doom/doom_play.c`   |          -Os |        4.75 |                    0.61 |
| RISC-V | `os/doom/doom_render.c` |          -Os |        3.59 |                    0.76 |
| RISC-V | `os/doom/doom_world.c`  |          -Os |        5.06 |                    0.87 |
| MIPS   | `os/main.c`             |          -O2 |        8.16 |                    1.06 |
| MIPS   | `os/apps/apps.c`        |          -Os |       12.20 |                    1.72 |
| MIPS   | `os/ide/ide.c`          |          -O2 |        6.46 |                    0.95 |
| MIPS   | `os/doom/doom_game.c`   |          -Os |        4.10 |                    0.64 |
| MIPS   | `os/doom/doom_play.c`   |          -Os |        5.88 |                    0.84 |
| MIPS   | `os/doom/doom_render.c` |          -Os |        4.20 |                    0.89 |
| MIPS   | `os/doom/doom_world.c`  |          -Os |        6.05 |                    1.12 |

x86's `doom_game.c` and `doom_play.c` were not stale. The local Clang's estimate, tabs expanded,
gave the RISC-V Files byte for byte; on MIPS it was 2 to 4% short, Compiler Explorer's MIPS Clang
keeping a frame pointer.

The packed ports, against the 16 MiB of Files a Project may hold:

| Port   | Files, MiB | Left, MiB | Note                                     |
| ------ | ---------: | --------: | ---------------------------------------- |
| x86    |      14.85 |      1.15 | with its Build output `os/main`, 1.5 MiB |
| RISC-V |      15.22 |      0.78 | whole                                    |
| MIPS   |      14.33 |      1.67 | without `videos/`                        |

## Open

- **`MAX_DIRTY_RUNS`** (8) in `MarsDevices.ts`: measured in M2 and left as it is (see "Tried and not kept" there); the whole flush is a tenth of a percent of asmOS's time.
- **The asmOS times carry the harness's fixed waits** (30 ms a key, 90 ms a one-step drag) and asmOS's own pacing, so they move less than the drawing benchmark does, and each is one sample. The drag in particular needs a finer probe before M2 can measure anything there.
- **`pnpm measure` ran every measure file in the `dom` project too**, where they all fail to load (`examples.server.ts` needs a `file:` URL); the task now passes `--project node`.
- **asmOS's back buffer on MIPS and RISC-V** (M7) doubles what boot runs and adds a sixth to opening a window, a copy by `memcpy` of every pixel it shows; `-DPLATFORM_BACK_BUFFER=0` in `os/platform/sim/machine.h` tries stage 1's single buffer. Whether it stays is the owner's call.
- **DOOM's ports were over the 16 MiB a Project holds** (M8): settled provisionally at M9, DOOM's parts at -Os and MIPS without `videos/` (see "After M9").
- **Preemption mid-drawing** (M7): every 10 ms of an application's first drawing the system composes what is dirty so far, a fifth to two fifths more instructions to open an application. A compositor that composes at most every frame (16 ms or so) while applications are ready would cut it, on x86 too; not tried.
