## Interrupts and the timer

An **interrupt** makes the processor run a **handler** between two program instructions. The handler deals with a request, such as a typed character or a timer reaching its target. It then returns so the next program instruction can run.

Three things can interrupt a MIPS program here:

| Source       | Turned on by                                            | Cause bit |
| ------------ | ------------------------------------------------------- | --------- |
| The timer    | writing Compare (`$11`)                                 | 15        |
| The keyboard | bit 1 of the receiver control register, `0xffff0000`    | 8         |
| The display  | bit 1 of the transmitter control register, `0xffff0008` | 9         |

A program that enables none of these sources receives no interrupts.

## The handler {#handler}

The processor runs the handler and records what happened in coprocessor 0's registers (see [Registers](/documentation/mips/registers#cp0)). Place the handler at `0x80000180` with `.ktext 0x80000180`. All interrupt sources and exceptions share this address. The examples below each handle one cause. A program using several must inspect Cause and branch to the appropriate code.

When an interrupt is taken, the processor:

1. puts the address of the instruction it stopped at in **EPC** (`$14`); that instruction has not run yet;
2. writes **Cause** (`$13`): exception code 0, which means "an interrupt", in bits 2 to 6, and the sources asking in bits 8 to 15;
3. sets the exception level bit, **EXL**, bit 1 of **Status** (`$12`), which holds every other interrupt back while the handler runs;
4. jumps to `0x80000180`.

End the handler with `eret`. It clears EXL and returns to EPC. **Leave EPC unchanged after an interrupt:** it points to the next instruction, which has not run. [Exceptions](#exceptions), such as a misaligned `lw`, a `break` or a `teq` trap, also enter this handler but save the instruction that failed.

The handler must restore every register the interrupted program uses. MIPS reserves `$k0` and `$k1` for handlers. These examples use only those. Avoid pseudo-instructions that use `$at`, such as `lw $k0, label`. An interrupt can arrive between the instructions of a main-program pseudo-instruction, while its temporary value is still in `$at`.

## When an interrupt is taken {#enabling}

A source that is asking sets its bit in Cause. The processor takes the interrupt before the next instruction when Status lets it through:

- bit 0, **IE**, interrupts enabled;
- bit 1, **EXL**, clear: no handler is running;
- the source's bit in bits 8 to 15, the **mask**, set.

Status starts at `0x0000FF11`, which enables every source, so a program only has to turn its source on. To keep one source quiet, clear its mask bit with `mtc0`.

## The timer {#timer}

**Count** (`$9`) increases by one every two instructions. Set **Compare** (`$11`) ahead of Count, for example to Count + 1000. When Count reaches Compare, the timer sets Cause bit 15 to request an interrupt. Writing Compare clears the request, so the handler schedules the next interrupt by writing a new future value.

Do not rely on setting Compare equal to the current Count for an immediate request. The match point is at the end of an even-numbered instruction, when Count advances. If that point has passed, the request waits until Count wraps around.

The timer stays off until the program first writes Compare, so a program that does not use it is never interrupted by it.

Count measures instructions rather than seconds. With the same instruction sequence, it reaches each value at the same place on every run. This program requests an interrupt every 1,000 Count ticks, or 2,000 instructions. Its handler counts five interrupts, then the main program prints 5:

{timerExample}

The main program spins until the handler has counted five ticks. The handler uses `lui $k1, 0x9000` to reach `ticks`, the first word of `.kdata` at `0x90000000`, without `$at`.

To estimate elapsed time from Count, compare changes in Count and [service 30](/documentation/mips/syscall#service-30). Read both before and after a run interval, then divide elapsed milliseconds by Count ticks. The result depends on the simulator's execution speed.

## Keyboard interrupts {#keyboard}

Set bit 1 of receiver control to request interrupts while typed characters are waiting. This includes characters queued before interrupts were enabled. Reading receiver data takes one character. The request clears only when no characters remain. A handler that reads one character per interrupt therefore runs once per queued character. Keys that type no character do not reach this receiver.

This program echoes every key it is given, without polling, and ends at Enter. Click the Screen panel and type, or type in the Terminal, or run it as a Testcase whose input is a line of text:

{keyboardExample}

For display interrupts, set bit 1 of transmitter control. The display requests one interrupt after accepting each character, as in MARS. This console accepts characters immediately. Enabling the bit alone requests nothing: the main program prints the first character, then the handler can print the next one. When the handler stops printing, the interrupts stop. Clearing the enable bit withdraws any request still pending.

## Exceptions {#exceptions}

With a handler at `0x80000180`, exceptions enter it instead of stopping the program. These include address errors, `add` overflow, `break` and `teq` traps. Compiled C uses `teq` to check division by zero. Cause holds the exception code and EPC points to the failed instruction. This handler prints code 4, an address error on a load, then ends the program:

{exceptionExample}

After repairing the cause, leave EPC unchanged to retry the instruction with `eret`. To deliberately skip the failed instruction, add 4 to EPC before returning. Returning unchanged without repairing the cause usually repeats the same exception. After an interrupt, leave EPC unchanged so the pending program instruction runs.

A `syscall` runs its service directly here and does not enter the exception handler.

## Debugging a handler {#debugging}

- **Step** runs one instruction, and when an interrupt is waiting that instruction is the handler's first: the Step lands on `0x80000180`. The Log says which interrupt it took, for example "Timer interrupt at 0x00400010 → handler at 0x80000180" in the timer program above, and the History lists the interrupt as a row of its own, above the handler's first instruction.
- **Breakpoints** and **Run to cursor** work inside the handler as anywhere else.
- **Undo** steps back out of the handler to the instruction it interrupted, with EPC, Cause and Status as they were. Since the timer counts instructions, stepping forward again takes the interrupt at the same place.
- **Testcases** run the same instructions, so they see the timer interrupts at the same places.

To step through the main program without landing in the handler, turn the source off while debugging, as developers do on real machines.

## From C {#from-c}

`<sim.h>` provides `sim_cp0_count()`, `sim_cp0_set_count()`, `sim_cp0_compare()` and `sim_cp0_set_compare()` for the timer. Write the handler in an assembly `.s` file at `.ktext 0x80000180`. Linked assembly uses GNU syntax, which supports this address too.

The processor enters the handler directly, so C never calls it. Build links only assembly Files whose globals the program uses (see [Linking assembly Files](/documentation/mips/using-c#linking-project-files)). Declare the handler with `.globl`, then use `SIM_LINK` once outside any C function to include its File:

```c
#include <sim.h>

SIM_LINK(handler);
```

```mips
# handler.s
        .ktext  0x80000180
        .globl  handler
handler:
        # what the handler does, as in the timer program above
        eret
```

A program has one handler location. Two linked Files holding `.ktext` fail the Build. The handler must dispatch all enabled sources and exceptions, and preserve the interrupted C code's registers.

To call a separate routine in `.ktext` from user code at `0x00400000`, load its address and use `jalr`. A `j` or `jal` cannot cross into that 256 MB region. The processor's interrupt entry does not need such a call.

## Compared with MARS {#compatibility}

- Count and Compare are MIPS32's: MARS 4.5 does not have them.
- The timer is off until the program first writes Compare. On a real MIPS32 it is always on, and with Status as MARS starts programs, Count meeting Compare's 0 would interrupt a program that never asked for a timer.
- The keyboard asks for as long as a character waits. MARS raises one interrupt per key, and a key typed while interrupts were off is never delivered there.
- The display asks once per character it takes, as in MARS, but at once, since this console is never busy. A request that comes while the handler runs, or while interrupts are off, waits until it can be taken, where MARS drops it.
- `wait` returns at once. Count keeps counting while a program loops around it, so the timer still arrives.
