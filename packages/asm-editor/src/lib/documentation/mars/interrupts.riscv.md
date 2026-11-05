## Interrupts and the timer

An **interrupt** makes the processor run a **handler** between two program instructions. The handler deals with a request, such as a typed character or a timer reaching its target. It then returns so the next program instruction can run.

Four things can interrupt a RISC-V program here:

| Source             | Turned on by                                            | `uie` bit | `ucause` (RV32) | `utval` |
| ------------------ | ------------------------------------------------------- | --------- | --------------- | ------- |
| The timer          | writing `timecmp`, at `0xffff0020`                      | 4         | `0x80000004`    | `0x10`  |
| The keyboard       | bit 1 of the receiver control register, `0xffff0000`    | 8         | `0x80000008`    | `0x40`  |
| The display        | bit 1 of the transmitter control register, `0xffff0008` | 8         | `0x80000008`    | `0x80`  |
| The program itself | `csrsi uip, 1`                                          | 0         | `0x80000000`    | 0       |

The keyboard and display are both **external** interrupts. `utval` tells them apart. The table shows RV32 `ucause` values. On RV64, the interrupt flag is bit 63: the timer gives `0x8000000000000004` and an external interrupt gives `0x8000000000000008`.

## The handler {#handler}

The processor runs the handler and records what happened in the control and status registers (see [Registers](/documentation/risc-v/registers#csr)). All enabled interrupt sources and exceptions share one handler. The examples below each handle one cause. A program using several must inspect `ucause` and, for external interrupts, `utval`.

Write the handler's address to `utvec`, enable the required sources in `uie`, then set bit 0 of `ustatus`, **UIE**:

```riscv
        la      t0, handler
        csrw    t0, utvec       # where interrupts go
        li      t0, 0x10        # uie bit 4: the timer
        csrs    t0, uie
        csrsi   ustatus, 1      # interrupts on
```

These examples use RARS operand order: `csrw t0, utvec` and `csrs t0, uie`. In assembly linked to C, use GNU order: `csrw utvec, t0` and `csrs uie, t0`. The immediate form `csrsi ustatus, 1` has the same order in both.

When an interrupt is taken, the processor:

1. puts the address of the instruction it stopped at in `uepc`; that instruction has not run yet;
2. writes `ucause` and `utval` from the table above;
3. copies UIE into UPIE, bit 4 of `ustatus`, and clears UIE, which holds every other interrupt back while the handler runs;
4. jumps to the address in `utvec`.

End the handler with `uret`. It restores UIE from UPIE and returns to `uepc`. **Leave `uepc` unchanged after an interrupt:** it points to the next instruction, which has not run.

The handler must restore every register the interrupted program uses. These examples reserve a few registers for their handlers. In a larger program, save the registers the handler needs in memory or on a separate handler stack. `uscratch` can hold a spare value while doing so.

## The timer {#timer}

RARS's Timer Tool registers are built in: `time` at `0xffff0018` and `timecmp` at `0xffff0020`. Each is 64 bits, with its low word at the lower address.

- Memory-mapped `time` measures elapsed run time in milliseconds from 0. It stops while paused, at a Breakpoint and between Steps. It includes time spent waiting during a Run, such as in `wfi` or service 32.
- Writing `timecmp` arms the timer. When `time` reaches it, the timer requests **one** interrupt. Write `timecmp` again, usually in the handler, to request another.

The **`time` CSR is a different clock**. Like service 30, it returns calendar milliseconds since 1970-01-01 UTC. In an interactive run that clock continues while paused. Use memory-mapped `time`, or `sim_timer_now()` in C, to choose a `timecmp` target.

This program asks for an interrupt every 100 milliseconds, counts five of them in its handler, and prints 5. Between interrupts it waits with `wfi`:

{timerExample}

The main program leaves `t1`, `s0` and `s1` to the handler. The handler sets the next `timecmp` 100 milliseconds after the last one, rather than after the time it happens to read, so the ticks do not drift.

## Waiting with wfi {#wfi}

`wfi`, wait for interrupt, waits for an enabled source: the timer with `uie` bit 4 set, or a typed character with `uie` bit 8 and receiver interrupts enabled. If a request is already pending, it returns immediately. `wfi` does not enter the handler itself. With UIE set, the processor takes the interrupt after `wfi`. With UIE clear, execution continues after it.

The status line beside the Terminal shows whether `wfi` is waiting for a timer interrupt, a keyboard interrupt or either. If no enabled source can end it, the status line says so and the Log explains what to enable. Pause or Stop also ends the wait, during Step or Run. Resuming after Pause continues after `wfi`.

Waiting in `wfi` uses no additional instructions. Polling memory-mapped `time` continuously uses instructions and can reach the instruction limit.

## Keyboard interrupts {#keyboard}

Set bit 1 of receiver control to request interrupts while typed characters are waiting. This includes characters queued before interrupts were enabled. Reading receiver data takes one character. The request clears only when no characters remain. A handler that reads one character per interrupt therefore runs once per queued character. Keys that type no character do not reach this receiver.

This program echoes every key it is given, without polling, and ends at Enter. Click the Screen panel and type, or type in the Terminal, or run it as a Testcase whose input is a line of text:

{keyboardExample}

For display interrupts, set bit 1 of transmitter control. The display requests one interrupt after accepting each character, as in RARS. `utval` is `0x80`. This console accepts characters immediately. Enabling the bit alone requests nothing: the main program prints the first character, then the handler can print the next one. When the handler stops printing, the interrupts stop. Clearing the enable bit withdraws any request still pending.

## Exceptions {#exceptions}

With a handler installed and UIE set, **exceptions** also enter the handler. These include a misaligned `lw` or an illegal instruction. Without UIE, the simulator stops the program with an error, as in RARS. For an exception, the top bit of `ucause` is clear, the remaining bits hold its code, and `uepc` points to the failed instruction. This handler prints code 4, a misaligned load, then ends the program:

{exceptionExample}

After repairing the cause, leave `uepc` unchanged to retry the instruction with `uret`. To deliberately skip the failed instruction, add 4 to `uepc` before returning. Returning unchanged without repairing the cause usually repeats the same exception. After an interrupt, leave `uepc` unchanged so the pending program instruction runs.

`ebreak` stops the debugger like a Breakpoint and does not enter this handler.

## Debugging a handler {#debugging}

- **Step** runs one instruction, and when an interrupt is waiting that instruction is the handler's first: the Step lands on the handler. The Log says which interrupt it took, for example "Timer interrupt at 0x00400038 → handler at 0x00400054 (handler)" in the timer program above, and the History lists the interrupt as a row of its own, above the handler's first instruction.
- When **Step** executes a waiting `wfi`, the Run button becomes **Pause**. An enabled interrupt or Pause ends the wait. After Pause, the Step completes after `wfi`.
- **Breakpoints** and **Run to cursor** work inside the handler as anywhere else.
- **Undo** steps back out of the handler to the instruction it interrupted, with `uepc`, `ucause`, `utval`, `ustatus` and `uip` as they were.
- Memory-mapped `time` does not advance between Steps, so a timer set for 10 milliseconds does not interrupt at every Step. The calendar clock read by the `time` CSR continues to advance in interactive use.
- In a **Testcase**, memory-mapped `time` starts at 0 and advances through virtual waits. With the timer enabled and armed, `wfi` advances it to `timecmp`, so the timer example finishes immediately. [Service 32](/documentation/risc-v/syscall#service-32) also advances it. The `time` CSR reads 2000-01-01 UTC plus those elapsed milliseconds. A `wfi` with no timer armed returns immediately in a Testcase, whose input is already supplied. A loop that only reads either clock never advances virtual time and can reach the instruction limit.

To step through the main program without landing in the handler, turn the source off while debugging, as developers do on real machines.

## From C {#from-c}

`<sim.h>` provides `sim_timer_now()` to read elapsed run time and `sim_timer_set(when)` to arm the timer. It names the memory registers `SIM_TIME_LOW`, `SIM_TIME_HIGH`, `SIM_TIMECMP_LOW` and `SIM_TIMECMP_HIGH`.

Write the handler and a setup function in a `.s` File. Linked assembly uses **GNU** CSR order, as explained above. To install a timer handler from C:

1. Define the handler in `.text`, ending with `uret`. It must save and restore the registers the interrupted C code may use. The registers reserved by these small assembly examples are not reserved in compiled C.
2. In the same File, define a global setup function with `.globl install_handler` and the label `install_handler:`. Have it execute `la t0, handler`, `csrw utvec, t0`, `li t0, 0x10`, `csrs uie, t0`, `csrsi ustatus, 1`, then `ret`. This installs the address and enables the timer source and interrupts.
3. In C, declare `void install_handler(void);`. In `main`, call `sim_timer_set(sim_timer_now() + 100)` to arm the timer, then `install_handler()` to enable delivery. The reference to `install_handler` makes Build link its File (see [Linking assembly Files](/documentation/risc-v/using-c#linking-project-files)).

The handler must schedule each later tick with a new `timecmp` value. Keyboard and display interrupts use the same handler, so dispatch on `ucause` and `utval` if you enable them too.

## Compared with RARS {#compatibility}

- The Timer Tool's registers are always there; in RARS the tool has to be opened and connected first. A bitmap display based at `0xffff0000` that covers them turns the timer off, since their words are pixels then.
- `time` counts only while the program runs. The Timer Tool counts real time from when it is connected, paused only by its own button.
- The keyboard asks for as long as a character waits. RARS raises one interrupt per key, and a key typed while interrupts were off is never delivered there.
- The display asks once per character it takes, as in RARS, but at once, since this console is never busy. A request that comes while the handler runs, or while interrupts are off, waits until it can be taken, where RARS drops it.
- `wfi` waits for the timer or a key that `uie` lets through, and Pause ends the wait. RARS's waits for ever.
