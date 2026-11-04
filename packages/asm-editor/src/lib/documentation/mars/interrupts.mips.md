## Interrupts and the timer

An **interrupt** makes the processor stop what the program is doing, between two instructions, and run a **handler** instead: a piece of code that deals with something that happened outside the program's own flow, such as a key being typed or a timer running out. When the handler is done, the program carries on from the instruction it was stopped at, as if nothing had happened.

Three things can interrupt a MIPS program here:

| Source       | Turned on by                                            | Cause bit |
| ------------ | ------------------------------------------------------- | --------- |
| The timer    | writing Compare (`$11`)                                 | 15        |
| The keyboard | bit 1 of the receiver control register, `0xffff0000`    | 8         |
| The display  | bit 1 of the transmitter control register, `0xffff0008` | 9         |

A program that turns none of them on is never interrupted, so everything else on this page only matters once it does.

## The handler {#handler}

Coprocessor 0 runs the handler, and its registers say what happened (see [Registers](/documentation/mips/registers#cp0)). The handler is the code at address `0x80000180`, which a program places there with `.ktext 0x80000180`. When an interrupt is taken, the processor:

1. puts the address of the instruction it stopped at in **EPC** (`$14`); that instruction has not run yet;
2. writes **Cause** (`$13`): exception code 0, which means "an interrupt", in bits 2 to 6, and the sources asking in bits 8 to 15;
3. sets the exception level bit, **EXL**, bit 1 of **Status** (`$12`), which holds every other interrupt back while the handler runs;
4. jumps to `0x80000180`.

The handler ends with `eret`, which clears EXL and jumps back to the address in EPC, so the stopped instruction runs next. The same handler also receives the program's **exceptions**, such as a misaligned `lw`, a `break` or a `teq` trap, as [Exceptions](#exceptions) below shows.

An interrupt can arrive between any two instructions, so the handler must leave every register the program uses as it found it. MIPS keeps `$k0` and `$k1` for the handler, and the examples here use only those. Do not use a pseudo-instruction such as `lw $k0, label` there: it is two instructions joined through `$at`, and the program could have been stopped between two instructions that use `$at` themselves.

## When an interrupt is taken {#enabling}

A source that is asking sets its bit in Cause. The processor takes the interrupt before the next instruction when Status lets it through:

- bit 0, **IE**, interrupts enabled;
- bit 1, **EXL**, clear: no handler is running;
- the source's bit in bits 8 to 15, the **mask**, set.

Status starts at `0x0000FF11`, which enables every source, so a program only has to turn its source on. To keep one source quiet, clear its mask bit with `mtc0`.

## The timer {#timer}

**Count** (`$9`) goes up by one every two instructions the program runs. When Count becomes equal to **Compare** (`$11`), the timer asks for an interrupt: Cause bit 15. Writing Compare clears the request, so a handler acknowledges the timer by setting Compare to the next moment it wants an interrupt. Set it ahead of Count, as Count plus a number of ticks: a write that makes Count equal Compare at once asks for the interrupt only on every other instruction of the run, since Count moves on every second one.

The timer stays off until the program first writes Compare, so a program that does not use it is never interrupted by it.

Count counts instructions, not seconds: a program reaches the same Count at the same instruction on every run, and a timer interrupt lands on the same instruction every time. This program asks for an interrupt every 1,000 Counts, which is every 2,000 instructions, counts five of them in its handler, and prints 5:

{timerExample}

The main program spins until the handler has counted five ticks. The handler uses `lui $k1, 0x9000` to reach `ticks`, the first word of `.kdata` at `0x90000000`, without `$at`.

To turn Count into time, measure it against [service 30](/documentation/mips/syscall#service-30): read both, let the program run for a moment, read both again, and divide.

## Keyboard interrupts {#keyboard}

Setting bit 1 of the receiver control register makes the keyboard ask for an interrupt whenever a typed character is waiting. The request stays for as long as a character waits, so the handler runs once for every key, including keys typed before the program turned the interrupt on. Reading the receiver data register takes the character and withdraws the request, if no other key is waiting.

This program echoes every key it is given, without polling, and ends at Enter. Click the Screen panel and type, or type in the Terminal, or run it as a Testcase whose input is a line of text:

{keyboardExample}

The display's interrupt works another way, as in MARS. With bit 1 of the transmitter control register set, the display asks for one interrupt each time it has taken a character and is ready for the next, which on this console is at once. Setting the bit asks for nothing by itself: the program prints the first character, and the handler prints each next one. Once the handler prints nothing more, no more interrupts come, so the bit can stay set. Clearing it withdraws a request the handler has not taken yet.

## Exceptions {#exceptions}

Once a handler is assembled at `0x80000180`, every exception the program causes goes to it instead of stopping the program: an address error, an overflow on `add`, a `break`, or a `teq` trap, which is how compiled C checks for a division by zero. The exception code in Cause says which; EPC is the instruction that failed. This handler reports the code and ends the program, and prints 4, an address error on a load:

{exceptionExample}

A handler that lets the program go on instead adds 4 to EPC before `eret`, or the failing instruction would run, and fail, again. A `syscall` is not an exception here: the service runs, and the handler is not entered.

## Debugging a handler {#debugging}

- **Step** runs one instruction, and when an interrupt is waiting that instruction is the handler's first: the Step lands on `0x80000180`. The Log says which interrupt it took, for example "Timer interrupt at 0x00400010 → handler at 0x80000180" in the timer program above, and the History lists the interrupt as a row of its own, above the handler's first instruction.
- **Breakpoints** and **Run to cursor** work inside the handler as anywhere else.
- **Undo** steps back out of the handler to the instruction it interrupted, with EPC, Cause and Status as they were. Since the timer counts instructions, stepping forward again takes the interrupt at the same place.
- **Testcases** run the same instructions, so they see the timer interrupts at the same places.

To step through the main program without landing in the handler, turn the source off while debugging, as developers do on real machines.

## From C {#from-c}

`<sim.h>` reads and writes the timer with `sim_cp0_count()`, `sim_cp0_set_count()`, `sim_cp0_compare()` and `sim_cp0_set_compare()`. The handler itself is assembly: put it in a `.s` file in `.ktext`, which the GNU syntax places at `0x80000180` too. Nothing in the C program calls the handler, since the processor enters it by its address, and Build links only the assembly Files the program uses (see [Linking assembly Files](/documentation/mips/using-c#linking-project-files)). So give the handler a name with `.globl`, and name it once in the C program, outside any function, with `<sim.h>`'s `SIM_LINK`:

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

A program has room for one handler, so two linked Files holding `.ktext` fail the Build. A `j` or `jal` cannot reach from user code at `0x00400000` into `.ktext`, which is in another 256 MB region: load the address into a register and use `jalr` instead.

## Compared with MARS {#compatibility}

- Count and Compare are MIPS32's: MARS 4.5 does not have them.
- The timer is off until the program first writes Compare. On a real MIPS32 it is always on, and with Status as MARS starts programs, Count meeting Compare's 0 would interrupt a program that never asked for a timer.
- The keyboard asks for as long as a character waits. MARS raises one interrupt per key, and a key typed while interrupts were off is never delivered there.
- The display asks once per character it takes, as in MARS, but at once, since this console is never busy. A request that comes while the handler runs, or while interrupts are off, waits until it can be taken, where MARS drops it.
- `wait` returns at once. Count keeps counting while a program loops around it, so the timer still arrives.
