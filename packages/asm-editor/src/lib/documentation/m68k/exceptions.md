## Exceptions

An **exception** transfers control from the running program to a **handler** for a particular cause. The cause can be an error, such as division by zero, or a deliberate request, such as `trap #3`. The processor saves enough state on the stack for the handler to return with [rte](/documentation/m68k/instruction/rte). Some faults need recovery before the program can continue.

Install a handler by writing its address into the cause's entry in the **vector table**. If that entry holds no handler, the editor ends the program with a message naming the exception and its vector.

The default processor is the 68000. `opt p=68010` and `opt p=68020` select processors with different exception frames and system registers. Check the [frame comparison](#frames) before reading or modifying a saved return address.

## The vector table

The vector table contains **256 vectors**, each a four-byte handler address. On the 68000 it occupies the first 1024 bytes of memory, `$000000` to `$0003FF`. The processor finds a handler at 4 × its **vector number**: division by zero is vector 5, so its handler address is the long at `$14`. The 68010 and 68020 can [relocate the table with VBR](#68010).

| vector | address | cause |
| -----: | ------- | ----- |
| 0, 1 | `$000`, `$004` | initial stack pointer and program counter on a real processor's reset |
| 2 | `$008` | bus error: an access refused by a [`memory`](/documentation/m68k/directive#memory) range, such as a write to read-only memory |
| 3 | `$00C` | address error: a word or long access at an odd address on the 68000 or 68010, or an instruction at an odd address on any processor |
| 4 | `$010` | illegal instruction, including [illegal](/documentation/m68k/instruction/illegal) and this editor's [bkpt](/documentation/m68k/instruction/bkpt) on the 68010 or 68020 |
| 5 | `$014` | division by zero in [divu](/documentation/m68k/instruction/divu) or [divs](/documentation/m68k/instruction/divs), or the 68020's [divsl](/documentation/m68k/instruction/divsl) or [divul](/documentation/m68k/instruction/divul) |
| 6 | `$018` | value out of range in [chk](/documentation/m68k/instruction/chk) or the 68020's [chk2](/documentation/m68k/instruction/chk2) |
| 7 | `$01C` | [trapv](/documentation/m68k/instruction/trapv) with V set, or the 68020's [trapcc](/documentation/m68k/instruction/trapcc) with its condition true |
| 8 | `$020` | privilege violation: a supervisor-only instruction executed in user mode |
| 9 | `$024` | [trace](#trace): after each instruction with T set, or a selected change of control flow with the 68020's [T0](#68020-trace) set |
| 10 | `$028` | instruction word starting with `$A`, called line A |
| 11 | `$02C` | instruction word starting with `$F`, called line F |
| 14 | `$038` | [format error](#format-error) on the 68010 or 68020: an exception frame `rte` cannot restore |
| 25–31 | `$064`–`$07C` | interrupts at levels 1 to 7 |
| 32–46 | `$080`–`$0B8` | `trap #0` to `trap #14` |
| 47 | `$0BC` | `trap #15` with a task number the simulator does not handle |

Other vectors are reserved or available for device-supplied interrupt vectors. This editor does not read vectors 0 and 1: execution starts at the program's entry point, in supervisor mode.

Memory initially contains `$FF` bytes, so an unwritten vector holds `$FFFFFFFF`. Handler addresses must be even. The editor treats any odd address in a vector as a missing handler. The memory view's **Exception vectors** region names the entries and follows VBR when the table moves.

## Writing a handler {#handlers}

Write the handler's address into its vector before the exception can occur. Return with `rte`, which restores the saved status register and program counter. This example installs a division-by-zero handler that returns an error value in `d0`:

```m68k
    move.l #div_zero, $14    ; vector 5: division by zero
    moveq #0, d1
    divu d1, d0             ; d1 is 0, so div_zero runs
    tst.l d0                ; rte returns here, with -1 in d0
    bra done

div_zero:
    moveq #-1, d0
    rte

done:
    simhalt
```

The exception frame saves SR and PC, not the data and address registers. Preserve every register the handler changes unless returning a new value in it is part of the handler's interface. Use [movem](/documentation/m68k/instruction/movem) to save registers on entry and restore them before `rte`. Remove everything the handler pushed so the stack pointer points at the exception frame again.

The **History** records a synchronous exception in the row of the instruction that raised it, with its vector and handler. The **Call stack** shows an entry such as `Divide by zero → div_zero` until the handler returns.

## What the processor does

On exception entry, the processor saves the old status register, sets S to enter supervisor mode, and clears tracing while the handler runs. It pushes an exception frame on the selected supervisor stack, reads the handler address from the vector table, and jumps there. Interrupts also [raise the interrupt mask](#interrupts).

For an ordinary 68000 exception, the frame contains the saved PC and SR, with SR at the top of the stack. `rte` pops SR and then PC. Restoring SR restores the interrupted program's flags and mode.

The frame's size and contents depend on both the processor and the exception. Bus and address errors use larger frames. The [68010](#68010) adds a format word, and the [68020](#68020-frames) adds more formats and [a second supervisor stack](#master-stack). Use the layouts below when a handler inspects or changes its frame.

## Exception frames {#frames}

Choose the layout for the processor selected by `opt p=`:

| processor | ordinary exceptions | bus and address errors | other frames |
| --------- | ------------------- | ---------------------- | ------------ |
| 68000 | 6 bytes, no format word | 14 bytes, no format word | — |
| [68010](#68010) | 8 bytes, format `$0` | 58 bytes, format `$8` | — |
| [68020](#68020-frames) | 8 bytes, format `$0` | 32 bytes, format `$A`, for a bus error fetching an instruction; otherwise 92 bytes, format `$B` | 12 bytes, format `$2`, for the exceptions listed [below](#68020-frames); 8-byte [throwaway frame](#throwaway-frame), format `$1` |

An ordinary **68000** frame has this layout at handler entry:

| where | size | what |
| ----- | ---- | ---- |
| `(sp)` | word | status register before the exception |
| `2(sp)` | long | return address restored by `rte` |

The saved return address depends on the cause. These rules also apply to the corresponding PC field in 68010 and 68020 frames:

- `trap`, `trapv`, `chk`, division by zero, and the 68020's `trap<cc>` and `chk2` save the address after the instruction. Returning continues after the instruction that raised the exception.
- An illegal instruction, a line A or line F word, or a privilege violation saves the address of the offending instruction. Returning without correcting the cause raises the exception again. To skip it, advance the saved PC by the instruction's size. For `illegal`, which is two bytes, use `addq.l #2, 2(sp)`.
- An interrupt saves the next instruction to execute. Trace saves the address at which execution would continue after the traced instruction, including the destination of a taken branch.

A **68000 bus or address error** pushes 14 bytes. Eight bytes describing the failed access precede the saved SR and PC:

| where | size | what |
| ----- | ---- | ---- |
| `(sp)` | word | access status: bit 4 is set for a read and clear for a write |
| `2(sp)` | long | address of the failed access |
| `6(sp)` | word | first word of the instruction |
| `8(sp)` | word | saved status register |
| `10(sp)` | long | saved PC, near the instruction that faulted |

A 68000 cannot resume a partially completed instruction from this frame. Its `rte` always reads the first six bytes as SR and PC, so using `rte` directly on an unchanged fault frame reads access information instead of the saved registers. A handler normally reports the fault and ends the program. The 68010 and 68020 use [different fault frames](#68010), which this editor can return from by retrying the instruction.

## User and supervisor mode {#modes}

Bit 13 of `sr`, **S**, selects the privilege mode:

- In **supervisor mode**, S is set and supervisor-only instructions are permitted. A program starts in this mode with `sr = $2000`, as in EASy68K.
- In **user mode**, S is clear. Execute `andi #$dfff, sr` in supervisor mode to enter it. A supervisor-only instruction executed in user mode raises a privilege violation, vector 8.

The privileged instructions supported by this editor are:

| processor | supervisor-only instructions |
| --------- | ---------------------------- |
| all three | `move` to `sr`; `andi`, `ori` and `eori` to `sr`; `move` to or from `usp`; [rte](/documentation/m68k/instruction/rte); [stop](/documentation/m68k/instruction/stop); [reset](/documentation/m68k/instruction/reset) |
| 68010 and 68020 | also `move` from `sr`, [movec](/documentation/m68k/instruction/movec) and [moves](/documentation/m68k/instruction/moves) |

Instructions that access only `ccr` remain available in user mode. On the 68010 and 68020, use `move ccr, <ea>` to read the flags without reading `sr`. In particular, user code cannot execute `stop` to wait for a timer: it must ask a supervisor handler to do that work.

Each mode has its own stack pointer, and `a7` names the active one. The supervisor stack pointer, SSP, starts at `$1000000`; the user stack pointer, USP, starts at `$FF0000`. Supervisor code can set USP before entering user mode with `move.l a0, usp`. Transfers to or from `usp` must use an address register. The **System** register file shows both stack pointers and the system bits of SR. On the 68010 it also shows VBR, SFC and DFC. The 68020 calls SSP the ISP and adds [a master stack](#master-stack).

User code returns to supervisor mode through an exception. A `trap` provides a deliberate entry into a supervisor handler, which can perform a service and use `rte` to restore the user's SR, including S clear. Supported `trap #15` tasks work in either mode.

## Traps {#traps}

`trap #0` to `trap #14` use vectors 32 to 46, at `$80` to `$B8` when VBR is zero. Install their handlers in the vector table.

`trap #15` calls an EASy68K-compatible [simulator task](/documentation/m68k/traps): put its number in `d0.b` and its arguments in the documented registers. A supported task runs without reading a vector or pushing an exception frame. An unknown task number uses vector 47, at `$BC` when VBR is zero, so a program can install its own handler for additional task numbers.

## Trace

Bit 15 of `sr`, **T**, enables a trace exception, vector 9, after each instruction. For example, `ori #$8000, sr` enables tracing. The trace handler runs with T clear; returning with `rte` restores the saved T, so tracing continues. A debugger can use this to regain control after each instruction.

On the 68020 the same bit is named T1. A second trace bit, T0, traces selected changes of control flow. See [tracing on the 68020](#68020-trace) for the instructions it traces and the frame it saves.

## When there is no handler {#no-handler}

An odd address in an exception vector ends the program. The message identifies the exception, source line and vector:

```text
Division by zero at line 3: vector 5 at $000014 holds no handler
```

A real 68000 would try to fetch an instruction at that odd address, raise an address error and halt if it cannot enter that handler either. The editor stops at the original exception so the message points to its cause.

The processor also halts if exception entry itself fails. Examples include an odd supervisor stack pointer, a frame pushed into a [`memory`](/documentation/m68k/directive#memory) range that refuses writes, or a vector read from an `invalid` range. The program ends with a message describing the failure.

## Interrupts

An **interrupt request**, or **IRQ**, asks the processor to run a handler between instructions. Timers, keyboard events and mouse events can raise requests at levels 1 to 7. Bits I2–I0 of `sr` form the **interrupt mask**, also a number from 0 to 7. A request must be above the mask to be taken, except that level 7 is always taken. If several levels are ready, the highest runs first.

Each level has one pending request. Further requests at that level merge with it, including requests from different sources. A masked timer therefore does not build up a count of every missed interval. Disabling a source prevents future requests but leaves any request already pending.

When it takes an IRQ, the processor saves the return address and old SR in the [appropriate exception frame](#frames), raises the mask to the request's level and jumps through its **autovector**, vector 24 + level. The vector is at `$60` + 4 × level, plus VBR on the 68010 or 68020. `rte` restores the previous mask. The **History** gives each IRQ its own row, and the **Call stack** shows an entry such as `IRQ 2 → handler`.

Configure these sources with [trap #15 tasks 32, 60 and 62](/documentation/m68k/traps#interrupts). Install the handler first. Supervisor code can wait with [stop](/documentation/m68k/instruction/stop), which loads a new SR and suspends instruction execution until an eligible IRQ arrives. This example counts five timer requests:

```m68k
    move.l #tick, $68        ; level 2's autovector
    clr.l d6                ; number of handled timer requests
    move.b #32, d0
    move.b #6, d1
    move.b #$82, d2          ; enable the level-2 timer
    move.l #200, d3          ; every 200 ms
    trap #15
wait:
    stop #$2000             ; supervisor mode, mask 0: any level can wake it
    cmp.l #5, d6
    blo wait                ; wait until at least five requests were handled
    simhalt

tick:
    addq.l #1, d6
    rte                     ; return to the cmp after stop
```

Five 200 ms intervals take one second if each request is handled before the next arrives. The counter records handled requests, so it cannot measure intervals whose requests merged. See [task 32](/documentation/m68k/traps#task-32) for timer behavior during Run, Pause, Step and testcases.

[reset](/documentation/m68k/instruction/reset) is privileged. In supervisor mode it has no device effect here, because there are no devices connected to its reset signal; it still adds its instruction cycles.

## Cycles {#cycles}

A **clock cycle** is one beat of the processor's clock. An instruction takes several cycles, depending on its operation, operands and processor. On a 68000, `moveq` takes 4 cycles, `add.l d0, d1` takes 8, a `dbra` that branches back takes 10, and division can take more than 100. At 8 MHz, as in an Atari ST, eight million cycles take one second, so 8,000 cycles take one millisecond.

The cycle counter follows the processor selected by `opt p=`: 68000 counts by default, [68010 counts](#68010) for `opt p=68010`, and [estimated 68020 counts](#68020-cycles) for `opt p=68020`. Bit-field instructions enabled by `opt bit` also use estimates. The displayed count is not elapsed browser time and does not pace execution.

The cycle line shows the total and the last step's cost, such as `Cycles 1,234 (+8)`. Each **History** row shows its cost, the **Log** reports the total when the program ends, and Undo subtracts the cycles of the step it reverses. On a 68000, `trap #0` to `#14` takes 34 cycles, division by zero takes at least 38, and taking an IRQ takes 44. A supported `trap #15` task adds no cycles, including time spent printing, drawing or waiting. A 68000 `stop` takes 4 cycles regardless of how long it waits.

Use [task 30](/documentation/m68k/traps#task-30) to clear the counter immediately before the code to measure, then [task 31](/documentation/m68k/traps#task-31) to read it into `d1`. This example uses the default 68000:

```m68k
    moveq #30, d0
    trap #15            ; reset the counter to 0
    move.w #99, d2      ; 8 cycles
loop:
    dbra d2, loop       ; 99 taken branches at 10 cycles, then 14 to finish
    moveq #31, d0       ; 4 cycles, included in the reading
    trap #15            ; d1 = 1016 (8 + 990 + 14 + 4)
```

The instruction selecting task 31 runs before the counter is read. Subtract its 4 cycles here to measure only the loop and its setup: 1016 − 4 = 1012 cycles.

## On the 68010 {#68010}

Select the 68010 with `opt p=68010`. It uses the same vector numbers and privilege modes as the 68000, with the following differences. The 68020 also has VBR and the format-word structure, but uses [its own frame formats](#68020-frames).

**VBR relocates the vector table.** The vector base register starts at zero. Supervisor code can change it with [movec](/documentation/m68k/instruction/movec); subsequent exceptions and IRQs read the handler address at VBR + 4 × vector number. This lets an operating system select a different table without rewriting every vector.

```m68k
    opt p=68010
    move.l #div_zero, $8000+5*4  ; install vector 5 in the table at $8000
    move.l #$8000, d0
    movec d0, vbr               ; use that vector table
    moveq #0, d1
    divu d1, d0                 ; find div_zero through $8014
    simhalt

div_zero:
    moveq #-1, d0
    rte
```

The **System** register file shows VBR, and the memory view's **Exception vectors** region moves with it. On real hardware, reset reads vectors 0 and 1 from address zero regardless of VBR. In a relocated table the view therefore labels those entries **Vector 0** and **Vector 1**; this editor does not read them.

**Ordinary frames have eight bytes and format `$0`.** They contain the saved SR and PC followed by a **format/vector-offset word**. Bits 15–12 hold the format number; bits 11–0 hold 4 × the vector number. A handler shared by several vectors can use that offset to identify the cause.

| where | size | what |
| ----- | ---- | ---- |
| `(sp)` | word | status register before the exception |
| `2(sp)` | long | return address restored by `rte` |
| `6(sp)` | word | format `$0` in bits 15–12; vector offset in bits 11–0 |

A handler that removes an ordinary frame manually must remove eight bytes, rather than the 68000's six.

**Bus and address errors use 58 bytes, format `$8`.** The saved SR and PC remain at `(sp)` and `2(sp)`. At `6(sp)`, the format/vector-offset word has `$8` in bits 15–12 and the vector offset in bits 11–0: `$8008` for a bus error or `$800C` for an address error. The access status is at `8(sp)`, with bit 8 set for a read, and the failed address is at `10(sp)`. The remaining space holds internal state and reserved fields. The saved PC is the instruction that faulted. In this editor `rte` retries it from the start, so remove the cause before returning or the fault will recur.

**`rte` uses the format to determine the frame size.** It removes eight bytes for format `$0` and 58 for format `$8`. An unsupported format, or an incompatible version in the fault frame, raises a [format error](#format-error).

**More instructions require supervisor mode.** `move` from `sr`, `movec` and [moves](/documentation/m68k/instruction/moves) are privileged on both the 68010 and 68020. User code can read the flags with `move ccr, <ea>`. The [bkpt](/documentation/m68k/instruction/bkpt) instruction uses vector 4 in this editor, as `illegal` does.

**Cycle costs differ.** On the 68010, `trap #0` to `#14` takes 38 cycles, taking an IRQ takes 46, and `rte` takes 24. Trace entry also takes 38 cycles in addition to the traced instruction. Other exceptions have their own costs; division by zero, for example, takes at least 42.

A `dbra` that branches back over one eligible short instruction, such as `move.w (a0)+, (a1)+`, enters **loop mode** after its first iteration. The processor reuses those two instructions without fetching them again, reducing the cost of subsequent iterations. The **History** shows when execution enters or leaves loop mode.

## Format errors {#format-error}

On the 68010 and 68020, `rte` checks the format/vector-offset word at `6(sp)` to determine how many bytes to remove. An unsupported format raises a **format error**, vector 14, at `$38` plus VBR. A common cause is an unbalanced handler stack: `sp` no longer points at the exception frame. An incompatible version field in a fault frame also causes a format error.

Without a handler for vector 14, the program ends with a message such as:

```text
Format error at line 9: vector 14 at $000038 holds no handler (RTE found an exception frame with format $3, which the 68010 does not support)
```

The 68010 accepts formats `$0` and `$8`. The 68020 accepts [formats `$0`, `$1`, `$2`, `$A` and `$B`](#68020-frames). A 68000 has no format word and does not raise format errors.

## On the 68020 {#68020}

Select the 68020 with `opt p=68020`. Like the 68010, it reads vectors relative to VBR and includes a format word in every exception frame. It adds:

- a [master stack](#master-stack), selected by the M bit, and a [throwaway frame](#throwaway-frame) when an interrupt switches stacks;
- [additional frame formats](#68020-frames), including a saved instruction address for some exceptions;
- a [second trace bit](#68020-trace), T0, for selected changes of control flow;
- [word and long data access at odd addresses](#odd-addresses);
- [estimated cycle counts](#68020-cycles).

`movec` can also access CACR and CAAR, the instruction-cache control registers. This editor does not simulate a cache: CACR retains only bit 0, E (enable), and bit 1, F (freeze); CAAR retains the value written to it. Neither changes execution. Code written into memory executes using its new bytes.

The **System** register file shows T1, T0, S and M, together with USP, ISP, MSP, VBR, SFC, DFC, CACR and CAAR.

## Master and interrupt stacks {#master-stack}

On the 68020, bit 12 of `sr`, **M**, selects which supervisor stack `a7` uses. In user mode, `a7` always uses USP:

| S | M | `a7` names |
| - | - | ---------- |
| 0 | either | user stack pointer, USP |
| 1 | 0 | **interrupt stack pointer**, ISP, corresponding to SSP on the 68000 and 68010 |
| 1 | 1 | **master stack pointer**, MSP |

A program starts with M clear and uses the interrupt stack. An operating system can give each program its own master stack for traps and other program exceptions, while using a shared interrupt stack for IRQ handlers.

MSP starts at zero. Initialize it to an even address in writable memory with [movec](/documentation/m68k/instruction/movec) before setting M:

```m68k
    opt p=68020
    move.l #$8000, d0
    movec d0, msp            ; set the top of the master stack
    ori #$1000, sr           ; set M: a7 now names MSP
```

M can remain set in user mode. An exception from that mode uses the master stack when it enters supervisor mode. The **History** records stack switches, for example, `Switched to the master stack, so A7 is the MSP`.

## The throwaway frame {#throwaway-frame}

An IRQ taken with M set first pushes the interrupted program's frame on the master stack. It then clears M, switches to the interrupt stack and pushes an eight-byte **throwaway frame**, format `$1`. The IRQ handler runs on the interrupt stack. The throwaway frame contains the same return address and a saved SR with S and M set.

The handler's `rte` removes the throwaway frame and restores its SR, switching `a7` back to MSP. It then restores the program's frame from the master stack. The **History** shows both frames and the stack switches.

This example starts ISP at its default `$1000000` and sets MSP to `$8000`. At handler entry, ISP is `$FFFFF8` because the throwaway frame occupies eight bytes. After `rte`, MSP is back at `$8000`:

```m68k
    opt p=68020
    move.l #tick, $68        ; level 2's autovector
    move.l #$8000, d0
    movec d0, msp
    ori #$1000, sr           ; set M: a7 now names MSP
    move.b #32, d0
    move.b #6, d1
    move.b #$82, d2          ; enable the level-2 timer
    move.l #10, d3           ; every 10 ms
    trap #15
    stop #$3000             ; wait with S and M set, interrupt mask 0
    move.l a7, d5            ; MSP: d5 = 32768, $8000
    simhalt

tick:
    move.l a7, d4            ; ISP: d4 = 16777208, $FFFFF8
    rte                     ; remove the throwaway frame, then the real frame
```

## Frames on the 68020 {#68020-frames}

The 68020 uses eight-byte format `$0` frames for most exceptions, with the same SR, PC and format/vector-offset positions as the [68010](#68010). For `chk`, `chk2`, `trapcc`, `trapv`, division by zero and trace, it uses a twelve-byte **format `$2`** frame. The extra long records the address of the instruction that raised the exception:

| where | size | what |
| ----- | ---- | ---- |
| `(sp)` | word | status register before the exception |
| `2(sp)` | long | address at which execution continues after the instruction |
| `6(sp)` | word | format `$2` in bits 15–12; vector offset in bits 11–0 |
| `8(sp)` | long | address of the instruction that raised the exception |

For trace, the return address can be the destination of the traced branch or jump. The instruction address at `8(sp)` lets a handler identify the instruction independently of that return address.

```m68k
    opt p=68020
    move.l #out_of_range, $18 ; vector 6: chk
    moveq #9, d0
    chk.w #5, d0             ; 9 is above 5, so out_of_range runs
    simhalt

out_of_range:
    move.w 6(sp), d1         ; format/vector-offset word: d1 = 8216, $2018
    move.l 8(sp), a0         ; address of the chk instruction
    moveq #5, d0
    rte                     ; remove all twelve bytes and continue after chk
```

Bus and address errors use larger frames:

| format | size | cause |
| ------ | ---- | ----- |
| `$A` | 32 bytes | bus error while fetching an instruction |
| `$B` | 92 bytes | other bus errors and address errors |

Both start with saved SR at `(sp)`, the faulting instruction's address at `2(sp)`, and the format/vector-offset word at `6(sp)`. The access status is at `$A(sp)` and the failed address at `$10(sp)`. In this editor, `rte` removes the entire frame and retries the instruction from its start. Correct the cause before returning.

The 68020 accepts formats `$0`, `$1`, `$2`, `$A` and `$B`. `rte` also handles a [throwaway frame](#throwaway-frame) followed by the program's frame on the master stack. Other formats, including the 68010's `$8`, raise a [format error](#format-error). Without its handler, the program ends with a message such as `rte found a frame of format $8, which a 68020 does not make`.

## Tracing on the 68020 {#68020-trace}

**T1**, bit 15, is the 68000's T bit and traces every instruction. **T0**, bit 14, traces selected changes of control flow: a taken conditional branch, `bra`, `bsr`, a jump, a return, a write to `sr`, and `andi`, `ori` or `eori` to `ccr`. `move` to `ccr` does not trigger T0 tracing.

With T0 set, a debugger can regain control at these changes and let straight runs of instructions execute between them. Trace uses format `$2`, with the traced instruction's address at `8(sp)`.

## Data at odd addresses {#odd-addresses}

The 68020 permits word and long data accesses at odd addresses. The 68000 and 68010 raise an address error for those accesses. Instruction addresses must still be even on all three processors, so a jump to an odd address raises an address error.

On real 68020 hardware, an unaligned access can require extra memory transfers. Keep words and longs aligned when possible, even though the processor permits unaligned data.

```m68k
    opt p=68020
    lea bytes, a0
    move.w 1(a0), d0         ; odd-address word: d0 = 8755, $2233
    simhalt

bytes:
    dc.b $11, $22, $33, $44
```

## Cycles on the 68020 {#68020-cycles}

A real 68020 overlaps work on successive instructions and has an instruction cache. Timing therefore depends on the surrounding instructions and memory accesses. The editor uses the manual's cache-case timings, which assume the instruction is already in the cache, as an estimate. These timing values do not mean the editor simulates a cache.

The cycle line marks estimates with `≈`, as in `Cycles ≈ 1,234 (+4)`. Each **History** row also marks its estimate, and the **Log** reports the total as approximate. [Task 31](/documentation/m68k/traps#task-31) returns this estimated count when the selected processor is the 68020.
