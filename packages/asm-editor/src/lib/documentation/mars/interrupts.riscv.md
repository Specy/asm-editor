## Interrupts and the timer

An **interrupt** makes the processor stop what the program is doing, between two instructions, and run a **handler** instead: a piece of code that deals with something that happened outside the program's own flow, such as a key being typed or a timer running out. When the handler is done, the program carries on from the instruction it was stopped at, as if nothing had happened.

Four things can interrupt a RISC-V program here:

| Source             | Turned on by                                            | `uie` bit | `ucause`     | `utval` |
| ------------------ | ------------------------------------------------------- | --------- | ------------ | ------- |
| The timer          | writing `timecmp`, at `0xffff0020`                      | 4         | `0x80000004` | `0x10`  |
| The keyboard       | bit 1 of the receiver control register, `0xffff0000`    | 8         | `0x80000008` | `0x40`  |
| The display        | bit 1 of the transmitter control register, `0xffff0008` | 8         | `0x80000008` | `0x80`  |
| The program itself | `csrsi uip, 1`                                          | 0         | `0x80000000` | 0       |

The keyboard and the display are both **external** interrupts; `utval` tells them apart.

## The handler {#handler}

The control and status registers run the handler (see [Registers](/documentation/risc-v/registers#csr)). The program writes its handler's address into `utvec`, turns on the sources it wants in `uie`, and then turns interrupts on with bit 0 of `ustatus`, **UIE**:

```riscv
        la      t0, handler
        csrw    t0, utvec       # where interrupts go
        li      t0, 0x10        # uie bit 4: the timer
        csrs    t0, uie
        csrsi   ustatus, 1      # interrupts on
```

When an interrupt is taken, the processor:

1. puts the address of the instruction it stopped at in `uepc`; that instruction has not run yet;
2. writes `ucause` and `utval` from the table above;
3. copies UIE into UPIE, bit 4 of `ustatus`, and clears UIE, which holds every other interrupt back while the handler runs;
4. jumps to the address in `utvec`.

The handler ends with `uret`, which turns UIE back on and jumps to the address in `uepc`, so the stopped instruction runs next.

An interrupt can arrive between any two instructions, so the handler must leave every register the program uses as it found it. In the small examples here, the main program leaves a few registers to the handler; a bigger handler saves the registers it uses, for example in memory it keeps for that, with `uscratch` holding a spare.

## The timer {#timer}

RARS's Timer Tool registers are built in: `time` at `0xffff0018` and `timecmp` at `0xffff0020`, 64 bits each, the low word first.

- `time` is the milliseconds the program has run. It starts at 0 when the program starts, and it does not count while the program is stopped: at a Breakpoint, after Pause, or between two Steps.
- Writing `timecmp` arms the timer. Once `time` reaches `timecmp`, the timer asks for **one** interrupt; to get another, write `timecmp` again, usually from the handler.

This program asks for an interrupt every 100 milliseconds, counts five of them in its handler, and prints 5. Between interrupts it waits with `wfi`:

{timerExample}

The main program leaves `t1`, `s0` and `s1` to the handler. The handler sets the next `timecmp` 100 milliseconds after the last one, rather than after the time it happens to read, so the ticks do not drift.

## Waiting with wfi {#wfi}

`wfi`, wait for interrupt, waits until an interrupt that `uie` enables is asking: the timer reaching `timecmp`, with `uie` bit 4 set, or a key, with `uie` bit 8 set and the receiver's interrupt turned on. It returns at once when one is asking already. It does not take the interrupt itself: with UIE set, the interrupt is taken right after `wfi`; with UIE clear, the program just carries on after it.

While it waits, the status line beside the Terminal says what can end the wait: "wfi waits for the timer", "for a key" or both. When nothing the program turned on can end it, the status line says so and the Log says what to turn on. Pause or Stop ends any wait, during a Step as during a Run, and after a Pause the program carries on after `wfi`.

A program that waits for the timer with `wfi` costs nothing while it waits. A loop that keeps reading `time` instead runs millions of instructions for the same wait.

## Keyboard interrupts {#keyboard}

Setting bit 1 of the receiver control register makes the keyboard ask for an interrupt whenever a typed character is waiting. The request stays for as long as a character waits, so the handler runs once for every key, including keys typed before the program turned the interrupt on. Reading the receiver data register takes the character and withdraws the request, if no other key is waiting.

This program echoes every key it is given, without polling, and ends at Enter. Click the Screen panel and type, or type in the Terminal, or run it as a Testcase whose input is a line of text:

{keyboardExample}

The display's interrupt works another way, as in RARS. With bit 1 of the transmitter control register set, the display asks for one interrupt each time it has taken a character and is ready for the next, which on this console is at once; `utval` is `0x80`. Setting the bit asks for nothing by itself: the program prints the first character, and the handler prints each next one. Once the handler prints nothing more, no more interrupts come, so the bit can stay set. Clearing it withdraws a request the handler has not taken yet.

## Exceptions {#exceptions}

The same handler receives the program's **exceptions**, such as a misaligned `lw` or an instruction that does not exist, as long as UIE is set; without it, an exception stops the program, as in RARS. Then the top bit of `ucause` is clear, the rest is the exception's code, and `uepc` is the instruction that failed. This handler reports the code and ends the program, and prints 4, a misaligned load:

{exceptionExample}

A handler that lets the program go on instead adds 4 to `uepc` before `uret`, or the failing instruction would run, and fail, again. `ebreak` is not one of these exceptions: it stops the debugger, as a breakpoint does.

## Debugging a handler {#debugging}

- **Step** runs one instruction, and when an interrupt is waiting that instruction is the handler's first: the Step lands on the handler. The Log says which interrupt it took, for example "Timer interrupt at 0x00400038 → handler at 0x00400054 (handler)" in the timer program above, and the History lists the interrupt as a row of its own, above the handler's first instruction.
- A Step on a `wfi` that waits waits as a Run does, until the timer or a key, and the Run button becomes Pause meanwhile: Pause ends the wait, and the Step ends after `wfi`.
- **Breakpoints** and **Run to cursor** work inside the handler as anywhere else.
- **Undo** steps back out of the handler to the instruction it interrupted, with `uepc`, `ucause`, `utval`, `ustatus` and `uip` as they were.
- `time` does not move between Steps, so stepping through a program whose timer is set for 10 milliseconds does not land in the handler at every Step.
- In a **Testcase** there is no real time: `time` moves only when the program waits, with `wfi` or [service 32](/documentation/risc-v/syscall#service-32), and a `wfi` moves it straight to `timecmp`, so the timer example above finishes at once. A `wfi` with no timer armed returns at once there, since the Testcase's input is all typed already. A program that loops reading `time` without ever waiting never sees it move, and runs into the instruction limit.

To step through the main program without landing in the handler, turn the source off while debugging, as developers do on real machines.

## From C {#from-c}

`<sim.h>` reads the timer with `sim_timer_now()` and arms it with `sim_timer_set(when)`, and names its registers `SIM_TIME_LOW`, `SIM_TIME_HIGH`, `SIM_TIMECMP_LOW` and `SIM_TIMECMP_HIGH`. The handler itself is assembly: put it in a `.s` file and store its address in `utvec` at run time. That file is GNU syntax, the syntax C compiles to, which names the CSR first: `csrw utvec, t0`, where RARS's own syntax above writes `csrw t0, utvec`.

## Compared with RARS {#compatibility}

- The Timer Tool's registers are always there; in RARS the tool has to be opened and connected first. A bitmap display based at `0xffff0000` that covers them turns the timer off, since their words are pixels then.
- `time` counts only while the program runs. The Timer Tool counts real time from when it is connected, paused only by its own button.
- The keyboard asks for as long as a character waits. RARS raises one interrupt per key, and a key typed while interrupts were off is never delivered there.
- The display asks once per character it takes, as in RARS, but at once, since this console is never busy. A request that comes while the handler runs, or while interrupts are off, waits until it can be taken, where RARS drops it.
- `wfi` waits for the timer or a key that `uie` lets through, and Pause ends the wait. RARS's waits for ever.
