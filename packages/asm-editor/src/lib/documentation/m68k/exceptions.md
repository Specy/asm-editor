## Exceptions

An **exception** is the processor setting aside the program it is running to run a **handler**, a piece of code written for one cause. Some causes are mistakes, such as a division by zero or a word read at an odd address; some are requests, such as `trap #3`. The handler deals with the cause and ends with [rte](/documentation/m68k/instruction/rte), and the program carries on.

The processor finds each handler through the vector table at the bottom of memory. A program installs a handler by writing its address there. A cause whose vector holds no handler ends the program, with a message naming the vector.

## The vector table

The first 1024 bytes of memory, `$000000` to `$0003FF`, are **256 vectors** of four bytes each. A vector holds the address of one handler. The processor finds it by multiplying the cause's **vector number** by 4 and reading the long there, so division by zero, vector 5, reads its handler's address at `$14`.

| vector | address         | cause                                                                                                                                                                                                                               |
| -----: | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   0, 1 | `$000`, `$004`  | the stack pointer and the program counter a 68000 starts with                                                                                                                                                                       |
|      2 | `$008`          | bus error, an access a [`memory`](/documentation/m68k/directive#memory) range refuses, such as a write to read-only memory                                                                                                          |
|      3 | `$00C`          | address error, a word or long at an odd address, or on the 68020 only an instruction at one                                                                                                                                         |
|      4 | `$010`          | illegal instruction, such as [illegal](/documentation/m68k/instruction/illegal), or [bkpt](/documentation/m68k/instruction/bkpt) on the 68010                                                                                       |
|      5 | `$014`          | division by zero, in [divu](/documentation/m68k/instruction/divu) or [divs](/documentation/m68k/instruction/divs), or on the 68020 [divsl](/documentation/m68k/instruction/divsl) or [divul](/documentation/m68k/instruction/divul) |
|      6 | `$018`          | [chk](/documentation/m68k/instruction/chk), or on the 68020 [chk2](/documentation/m68k/instruction/chk2), with a value out of range                                                                                                 |
|      7 | `$01C`          | [trapv](/documentation/m68k/instruction/trapv) with V set, or on the 68020 [trapcc](/documentation/m68k/instruction/trapcc) with its condition true                                                                                 |
|      8 | `$020`          | privilege violation, a supervisor-only instruction in user mode                                                                                                                                                                     |
|      9 | `$024`          | trace, after every instruction while the T bit is set, or on the 68020 after each branch, jump or return while T0 is set                                                                                                            |
|     10 | `$028`          | an instruction word that starts with `$A`, "line A"                                                                                                                                                                                 |
|     11 | `$02C`          | an instruction word that starts with `$F`, "line F"                                                                                                                                                                                 |
|     14 | `$038`          | format error, on the 68010 and the 68020: a frame `rte` cannot read ([below](#68010))                                                                                                                                               |
|  25-31 | `$064` - `$07C` | interrupts at levels 1 to 7                                                                                                                                                                                                         |
|  32-46 | `$080` - `$0B8` | `trap #0` to `trap #14`                                                                                                                                                                                                             |
|     47 | `$0BC`          | `trap #15`, when its task number is not one of the simulator's                                                                                                                                                                      |

The others are reserved, or used by interrupts that devices number themselves. Nothing in this editor reads vectors 0 and 1: a program starts at its entry point, in supervisor mode.

Memory starts filled with `$FF` bytes, so every vector a program has not written reads `$FFFFFFFF`. Instructions are always at even addresses, so an odd address in a vector means there is no handler there. The memory view shows the table as its Exception vectors region, each vector named. A program for the 68010 can move the table elsewhere; see [on the 68010](#68010).

## Writing a handler {#handlers}

Install a handler by writing its address into its vector, once, before the cause can happen. End it with `rte`, which returns to the program. This one gives a division by zero an answer the program can test:

```m68k
    move.l #div_zero, $14    ; vector 5: division by zero
    moveq #0, d1
    divu d1, d0              ; d1 is 0, so div_zero runs
    tst.l d0                 ; rte comes back here, with -1 in d0
    bra done

div_zero:
    moveq #-1, d0
    rte

done:
```

A handler runs between two instructions of a program that does not expect it. It saves every register it changes, with [movem](/documentation/m68k/instruction/movem), and puts them back before its `rte`, unless changing one is its purpose, as when a `trap` service returns an answer in `d0`.

The History shows the exception in the row of the instruction that raised it, with the vector and the handler. The Call stack lists it, as `Divide by zero → div_zero`, until the handler's `rte`.

## What the processor does

The steps are the same for every cause.

1. It keeps a copy of the status register, then sets the S bit, which puts it in supervisor mode, and clears the T bit, so the handler is not traced.
2. It pushes an **exception frame** on the supervisor stack: the program counter, then that copy of the status register.
3. It reads the vector and jumps to the address there.

`rte` undoes it: it pops the status register and then the program counter. Restoring the status register restores the mode the program was in, and its flags.

## Exception frames {#frames}

Most exceptions push six bytes. After the push, the supervisor stack pointer points at the frame:

| where   | size | what                                               |
| ------- | ---- | -------------------------------------------------- |
| `(sp)`  | word | the status register as it was before the exception |
| `2(sp)` | long | the address `rte` returns to                       |

That address depends on the cause:

- After a `trap`, `trapv`, `chk` or a division by zero, and the 68020's `trap<cc>` and `chk2`, it is the next instruction's, so the program carries on after the one that raised it.
- After an illegal instruction, a line A or line F word or a privilege violation, it is the instruction's own. Returning to it runs it again, and raises the same exception again. A handler that wants to carry on steps past it first, adding the instruction's size to the saved address: `addq.l #2, 2(sp)` for `illegal`.

An address error or a bus error stops an instruction halfway, so it pushes 14 bytes: eight that describe the access, on top of the usual six, which move down to `8(sp)` and `10(sp)`:

| where    | size | what                                                                   |
| -------- | ---- | ---------------------------------------------------------------------- |
| `(sp)`   | word | how the access was made: bit 4 is set for a read and clear for a write |
| `2(sp)`  | long | the address it tried to read or write                                  |
| `6(sp)`  | word | the first word of the instruction                                      |
| `8(sp)`  | word | the status register                                                    |
| `10(sp)` | long | an address near the instruction, which `rte` would return to           |

Such an instruction cannot simply be resumed, so a handler for one usually reports what went wrong and ends the program.

## User and supervisor mode {#modes}

The S bit of the status register, bit 13, says which mode the processor is in.

- **Supervisor mode** is where a program starts: the status register is `$2000`, as in EASy68K. Every instruction runs.
- **User mode** is where an operating system would run the programs it loads. A program enters it by clearing S, with `andi #$dfff, sr`. The privileged instructions then raise a privilege violation: [move](/documentation/m68k/instruction/move) to `sr`, [andi](/documentation/m68k/instruction/andi), [ori](/documentation/m68k/instruction/ori) and [eori](/documentation/m68k/instruction/eori) to `sr`, `move` to or from `usp`, and [rte](/documentation/m68k/instruction/rte). Everything else runs as before, the flags included, and so does writing `ccr` alone. On the 68010, `move` from `sr`, [movec](/documentation/m68k/instruction/movec) and [moves](/documentation/m68k/instruction/moves) are privileged too.

Each mode has its own stack pointer, and `a7` is the one of the current mode. The supervisor stack pointer, SSP, starts at `$1000000`, and the user stack pointer, USP, at `$FF0000`. Supervisor code sets the USP before it enters user mode, with `move.l a0, usp`; `usp` is read and written only through an address register. The System register file shows the status register's system bits and both stack pointers, and in a program for the 68010 its control registers VBR, SFC and DFC. A 68020 has a second supervisor stack, and calls the SSP the ISP; see [master and interrupt stacks](#master-stack).

The only way back from user mode is an exception, which always switches to supervisor mode and pushes its frame on the supervisor stack. A `trap` is the one a program raises on purpose, so it is how user code asks supervisor code to do something for it. The handler's `rte` returns to user mode, since the status register it restores has S clear. `trap #15` works in either mode.

## Traps {#traps}

`trap #0` to `trap #14` take vectors 32 to 46, at `$80` to `$B8`, and run handlers the program installs. `trap #15` is EASy68K's: the simulator carries out the [trap task](/documentation/m68k/traps) whose number is in `d0.b`, and no vector is read. A task number the simulator does not know goes through vector 47, at `$BC`, as in EASy68K, so a program can add tasks of its own there.

## Trace

When the T bit of the status register, bit 15, is set, the processor takes a trace exception, vector 9, after every instruction. A debugger uses it to stop after each step. `ori #$8000, sr` sets T; the trace handler runs with T clear, and its `rte` restores it, so the next instruction is traced too. The 68020 has a second trace bit, T0, which stops only at the jumps; see [tracing on the 68020](#68020-trace).

## When there is no handler {#no-handler}

An exception whose vector holds an odd address ends the program, and the message names the exception, the line and the vector:

```text
Division by zero at line 3: vector 5 at $000014 holds no handler
```

A real 68000 would try to run the odd address, raise an address error, find no handler for that either, and halt. The editor ends the program at the first exception instead, so the message points at the instruction that caused it.

If taking an exception itself fails, the processor halts, and the program ends with a message saying so. That happens when the supervisor stack pointer is odd, when the frame would be pushed where a [`memory`](/documentation/m68k/directive#memory) range refuses writes, or when the vector itself is in an `invalid` range.

## Interrupts

An **interrupt** is an exception a device raises between two instructions, such as a key press or a timer. The device makes an **interrupt request**, or IRQ, at a level from 1 to 7. The three bits I2 to I0 of the status register are the interrupt mask: a request at or below its level waits, and level 7 is always taken.

When a request gets through, the processor finishes the instruction it is on and takes the request as an exception: it pushes the program counter and the status register, raises the mask to the request's level, so the same level cannot interrupt the handler, and jumps through the level's **autovector**, vector 24 + level, at `$60` + 4 × level. The handler's `rte` puts the mask back as it was. In the History an IRQ is a row of its own, and the Call stack names its frame `IRQ 2 → handler`.

In this editor a timer, a key and the mouse raise requests, which the program sets up with [trap #15 tasks 32, 60 and 62](/documentation/m68k/traps#interrupts). A program waits for one with [stop](/documentation/m68k/instruction/stop), which loads the status register and runs nothing until a request gets past the new mask:

```m68k
    move.l #tick, $68        ; level 2's autovector
    move.b #32, d0
    move.b #6, d1
    move.b #$82, d2          ; a level-2 timer
    move.l #200, d3          ; every 200 ms
    trap #15
wait:
    stop #$2000              ; the mask at 0: any level wakes it
    cmp.l #5, d6
    bne wait                 ; one second: five ticks
    simhalt

tick:
    addq.l #1, d6
    rte                      ; back to the cmp after the stop
```

[reset](/documentation/m68k/instruction/reset) does nothing here, as there are no devices for it to reset.

## Cycles {#cycles}

A 68000 works to the beat of a clock, and each beat is a **clock cycle**. Every instruction takes a whole number of them, more when it reaches memory and more when its numbers make more work: `moveq` takes 4 cycles, `add.l d0, d1` 8, a `dbra` that loops back 10, and a division over 100. At 8 MHz, the clock of an Atari ST, a 68000 has eight million cycles a second, so 8,000 cycles take a millisecond.

The editor counts the cycles a 68000 takes, instruction by instruction. The line under the registers shows the count with what the last step took, `Cycles 1,234 (+8)`, each History row shows its own, and the Log gives the count when the program ends. Undo takes a step's cycles back. Exceptions take cycles too: 34 for `trap #0` to `#14`, 38 or more for a division by zero, and 44 for an interrupt request. A `trap #15` task takes none, so printing, drawing or a delay adds nothing, and `stop` takes 4, however long it waits. A program written for the 68010 counts a 68010's cycles, which are a little different (see [on the 68010](#68010)), and one for the 68020 counts an estimate (see [cycles on the 68020](#68020-cycles)).

To time a piece of code, clear the counter with [trap #15 task 30](/documentation/m68k/traps#task-30) just before it, and read it into `d1` with [task 31](/documentation/m68k/traps#task-31) just after it:

```m68k
    moveq #30, d0
    trap #15            ; the counter starts again at 0
    move.w #99, d2      ; 8 cycles
loop:
    dbra d2, loop       ; 99 rounds back at 10 cycles, then 14 for the last
    moveq #31, d0       ; 4 cycles, counted before the read
    trap #15            ; d1 = 8 + 990 + 14 + 4 = 1016
```

The reading includes the `moveq` that asks for it, so the loop and its setup took 1016 − 4 = 1012 cycles.

## On the 68010 {#68010}

A program that starts with `opt p=68010` runs on a 68010, which takes exceptions the way a 68000 does, with these differences.

**The vector table can move.** The vector base register, VBR, holds the address where the table starts. It is 0 when the program starts, so the table is where a 68000 keeps it, until supervisor code moves it with [movec](/documentation/m68k/instruction/movec). From then on every exception, interrupts included, reads its vector at VBR + 4 × the vector number. An operating system can keep a table for each program and switch between them with one instruction.

```m68k
    opt p=68010
    move.l #div_zero, $8000+5*4  ; vector 5 of a table at $8000
    move.l #$8000, d0
    movec d0, vbr            ; vectors are read at $8000 from now on
    moveq #0, d1
    divu d1, d0              ; div_zero runs, found at $8014
    simhalt

div_zero:
    moveq #-1, d0
    rte
```

The System register file shows VBR, and the memory view's Exception vectors region moves with it.

**Every frame has a format word.** The frame is 8 bytes: the 6 a 68000 pushes, then one more word. Its top four bits are the frame's **format**, `$0` here, and the rest is 4 × the vector number, so one handler installed in several vectors can tell which one it was called for.

| where   | size | what                                                     |
| ------- | ---- | -------------------------------------------------------- |
| `(sp)`  | word | the status register as it was before the exception       |
| `2(sp)` | long | the address `rte` returns to                             |
| `6(sp)` | word | the format in bits 15 to 12, 4 × the vector number below |

A handler that takes the frame off the stack by hand takes 8 bytes, not 6.

**Bus and address errors push a 58-byte frame,** format `$8`. It starts as the short one does, with the format word `$8` and the vector's offset at `6(sp)`, then says how the access was made at `8(sp)` (bit 8 is set for a read) and the address it tried at `10(sp)`. The rest is the processor's internal state. The address at `2(sp)` is the instruction that faulted, and `rte` runs it again, so a handler either removes the cause first or does not return.

**`rte` checks the format.** It reads the format word first and pops the whole frame: 8 bytes for format `$0`, 58 for format `$8`. Any other format means the stack does not hold a frame the processor pushed, usually because the handler left something on the stack or took too much off. Rather than return to a wrong address, `rte` then raises a **format error**, vector 14, at `$38`, and with no handler there the program ends:

```text
Format error at line 9: vector 14 at $000038 holds no handler (rte found a frame of format $3, which a 68010 does not make)
```

The 68010 also has [bkpt](/documentation/m68k/instruction/bkpt), which takes vector 4 here, as `illegal` does, and makes `move` from `sr` privileged, so user code reads the flags with `move ccr, <ea>`. Its cycles differ a little: an exception takes 38 and an interrupt 46, and `rte` 24. A `dbra` that loops back over one short instruction, such as `move.w (a0)+, (a1)+`, enters **loop mode** after its first turn: the processor stops fetching the two instructions again, so each further turn takes fewer cycles. The History says when a loop enters and leaves it.

## On the 68020 {#68020}

A program that starts with `opt p=68020` runs on a 68020. It takes exceptions as the 68010 does, through the table at VBR and with a format word in every frame, and adds:

- a second supervisor stack, the [master stack](#master-stack), which the M bit of `sr` chooses, and the [throwaway frame](#throwaway-frame) an interrupt leaves when it moves off it;
- [frames of its own](#68020-frames), with the address of the instruction that raised the exception;
- a [second trace bit](#68020-trace), T0, which stops only at jumps;
- [data at odd addresses](#odd-addresses);
- cycles that are [an estimate](#68020-cycles).

`movec` also reaches `cacr` and `caar`, which control the 68020's instruction cache. This editor's 68020 has no cache. `cacr` keeps only its bits 0 (E, enable) and 1 (F, freeze), `caar` keeps what is written, and neither changes how the program runs, so code a program writes into memory always runs as written.

The System register file of a 68020 program shows T1, T0, S and M among the flags, and the USP, ISP, MSP, VBR, SFC, DFC, CACR and CAAR.

## Master and interrupt stacks {#master-stack}

The 68020's status register has one more bit, **M**, bit 12, the master bit. In supervisor mode it chooses which of two stack pointers `a7` is:

| S   | M      | `a7` is                                                                          |
| --- | ------ | -------------------------------------------------------------------------------- |
| 0   | either | the user stack pointer, USP                                                      |
| 1   | 0      | the **interrupt stack pointer**, ISP, which the 68000 and the 68010 call the SSP |
| 1   | 1      | the **master stack pointer**, MSP                                                |

A program starts with M clear, so it runs on the interrupt stack, exactly as on a 68010, until it sets M.

The two stacks keep apart what belongs to one program and what belongs to none. An operating system gives each program it runs a master stack of its own, where that program's traps and errors push their frames. Interrupts can come in the middle of any program, and they all go on the one interrupt stack.

The MSP starts at 0, so supervisor code points it at memory with [movec](/documentation/m68k/instruction/movec) before it sets M:

```m68k
    move.l #$8000, d0
    movec d0, msp            ; the master stack starts at $8000
    ori #$1000, sr           ; set M: a7 is now the MSP
```

An exception taken in user mode with M set goes to the master stack. The History says each time `a7` changes stack: "Switched to the master stack, so A7 is the MSP".

## The throwaway frame {#throwaway-frame}

An interrupt taken while M is set pushes its frame on the master stack, as any exception would. Then it clears M, so that its handler runs on the interrupt stack, and pushes a second frame there, the **throwaway frame**, format `$1`. That frame holds the same return address, and a status register with S and M set.

The handler's `rte` pops the throwaway frame first, which sets M again and makes `a7` the MSP, then pops the real frame from the master stack. The History shows both frames and each switch of stack.

Here the handler finds `a7` at `$FFFFF8`, the eight bytes of the throwaway frame under the top of the interrupt stack, and after its `rte` the program finds the MSP back at `$8000`:

```m68k
    opt p=68020
    move.l #tick, $68        ; level 2's autovector
    move.l #$8000, d0
    movec d0, msp            ; the master stack starts at $8000
    ori #$1000, sr           ; set M: a7 is now the MSP
    move.b #32, d0
    move.b #6, d1
    move.b #$82, d2          ; a level-2 timer
    move.l #10, d3           ; every 10 ms
    trap #15
    stop #$3000              ; wait, with S and M still set and the mask at 0
    move.l a7, d5            ; the MSP again: d5 = 32768, $8000
    simhalt

tick:
    move.l a7, d4            ; the ISP: d4 = 16777208, $FFFFF8
    rte                      ; pops the throwaway frame, then the real one
```

## Frames on the 68020 {#68020-frames}

Most exceptions push the 68010's eight bytes, format `$0`. After `chk`, `chk2`, `trapcc`, `trapv`, a division by zero and a trace, the program carries on with the next instruction, and the frame is twelve bytes, format `$2`. The four extra bytes are the address of the instruction that raised the exception, which a handler can report:

| where   | size | what                                                                |
| ------- | ---- | ------------------------------------------------------------------- |
| `(sp)`  | word | the status register as it was before the exception                  |
| `2(sp)` | long | the address `rte` returns to, the next instruction's                |
| `6(sp)` | word | the format, `$2`, in bits 15 to 12, and 4 × the vector number below |
| `8(sp)` | long | the address of the instruction that raised it                       |

```m68k
    opt p=68020
    move.l #out_of_range, $18 ; vector 6: chk
    moveq #9, d0
    chk.w #5, d0             ; 9 is above 5, so out_of_range runs
    simhalt

out_of_range:
    move.w 6(sp), d1         ; the format word: d1 = 8216, $2018
    move.l 8(sp), a0         ; the address of the chk
    moveq #5, d0             ; back in range: d0 = 5
    rte                      ; pops all twelve bytes
```

A bus or address error pushes a larger frame: format `$B`, 92 bytes, or for a bus error while fetching an instruction, format `$A`, 32 bytes. Like the 68010's format `$8`, it says how the access was made at `$A(sp)` and the address it tried at `$10(sp)`, and `rte` runs the instruction that faulted again.

`rte` pops each frame whole, and the [throwaway frame](#throwaway-frame) and the one under it. Any other format, the 68010's `$8` among them, is a [format error](#68010), which with no handler ends the program: "…rte found a frame of format $8, which a 68020 does not make".

## Tracing on the 68020 {#68020-trace}

The 68000's T is called T1 on the 68020, and still traces every instruction. A second bit, **T0**, bit 14, traces only an instruction that changes the flow of the program: a branch taken, `bra` and `bsr`, a jump, a return, and a write of `sr`. With T0 set, a debugger stops at each jump and skips the straight runs of code between them. The trace frame is format `$2`, with the address of the instruction traced at `8(sp)`.

## Data at odd addresses {#odd-addresses}

A 68020 reads and writes a word or a long at an odd address, where a 68000 raises an address error. Only instructions must still be at even addresses, so a jump to an odd address is an address error. On a real 68020 an odd access takes two trips to memory, so programs still keep their words and longs at even addresses when they can.

```m68k
    opt p=68020
    lea bytes, a0
    move.w 1(a0), d0         ; a word at an odd address: d0 = 8755, $2233
    simhalt

bytes:
    dc.b $11, $22, $33, $44
```

## Cycles on the 68020 {#68020-cycles}

A 68020 overlaps each instruction with the next, and keeps recent code in its cache, so how long an instruction takes depends on what runs around it. Its manual can only give each instruction's time for one case, with the instruction already in the cache. The editor counts that case, so the count is an estimate: the line under the registers reads `Cycles ≈ 1,234 (+4)`, each History row marks its own, and the Log says "about".
