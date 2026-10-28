## Exceptions

An **exception** is the processor setting aside the program it is running to run a **handler**, a piece of code written for one cause. Some causes are mistakes, such as a division by zero or a word read at an odd address; some are requests, such as `trap #3`. The handler deals with the cause and ends with [rte](/documentation/m68k/instruction/rte), and the program carries on.

The processor finds each handler through the vector table at the bottom of memory. A program installs a handler by writing its address there. A cause whose vector holds no handler ends the program, with a message naming the vector.

## The vector table

The first 1024 bytes of memory, `$000000` to `$0003FF`, are **256 vectors** of four bytes each. A vector holds the address of one handler. The processor finds it by multiplying the cause's **vector number** by 4 and reading the long there, so division by zero, vector 5, reads its handler's address at `$14`.

| vector | address         | cause                                                                                                                      |
| -----: | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
|   0, 1 | `$000`, `$004`  | the stack pointer and the program counter a 68000 starts with                                                              |
|      2 | `$008`          | bus error, an access a [`memory`](/documentation/m68k/directive#memory) range refuses, such as a write to read-only memory |
|      3 | `$00C`          | address error, a word or long at an odd address                                                                            |
|      4 | `$010`          | illegal instruction, such as [illegal](/documentation/m68k/instruction/illegal)                                            |
|      5 | `$014`          | division by zero, in [divu](/documentation/m68k/instruction/divu) or [divs](/documentation/m68k/instruction/divs)          |
|      6 | `$018`          | [chk](/documentation/m68k/instruction/chk) with a value out of range                                                       |
|      7 | `$01C`          | [trapv](/documentation/m68k/instruction/trapv) with V set                                                                  |
|      8 | `$020`          | privilege violation, a supervisor-only instruction in user mode                                                            |
|      9 | `$024`          | trace, after every instruction while the T bit is set                                                                      |
|     10 | `$028`          | an instruction word that starts with `$A`, "line A"                                                                        |
|     11 | `$02C`          | an instruction word that starts with `$F`, "line F"                                                                        |
|  25-31 | `$064` - `$07C` | interrupts at levels 1 to 7                                                                                                |
|  32-46 | `$080` - `$0B8` | `trap #0` to `trap #14`                                                                                                    |
|     47 | `$0BC`          | `trap #15`, when its task number is not one of the simulator's                                                             |

The others are reserved, or used by interrupts that devices number themselves. Nothing in this editor reads vectors 0 and 1: a program starts at its entry point, in supervisor mode.

Memory starts filled with `$FF` bytes, so every vector a program has not written reads `$FFFFFFFF`. Instructions are always at even addresses, so an odd address in a vector means there is no handler there. The memory view shows the table as its Exception vectors region, each vector named.

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

- After a `trap`, `trapv`, `chk` or a division by zero, it is the next instruction's, so the program carries on after the one that raised it.
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
- **User mode** is where an operating system would run the programs it loads. A program enters it by clearing S, with `andi #$dfff, sr`. The privileged instructions then raise a privilege violation: [move](/documentation/m68k/instruction/move) to `sr`, [andi](/documentation/m68k/instruction/andi), [ori](/documentation/m68k/instruction/ori) and [eori](/documentation/m68k/instruction/eori) to `sr`, `move` to or from `usp`, and [rte](/documentation/m68k/instruction/rte). Everything else runs as before, the flags included, and so does writing `ccr` alone.

Each mode has its own stack pointer, and `a7` is the one of the current mode. The supervisor stack pointer, SSP, starts at `$1000000`, and the user stack pointer, USP, at `$FF0000`. Supervisor code sets the USP before it enters user mode, with `move.l a0, usp`; `usp` is read and written only through an address register. The System register file shows the status register's system bits and both stack pointers.

The only way back from user mode is an exception, which always switches to supervisor mode and pushes its frame on the supervisor stack. A `trap` is the one a program raises on purpose, so it is how user code asks supervisor code to do something for it. The handler's `rte` returns to user mode, since the status register it restores has S clear. `trap #15` works in either mode.

## Traps {#traps}

`trap #0` to `trap #14` take vectors 32 to 46, at `$80` to `$B8`, and run handlers the program installs. `trap #15` is EASy68K's: the simulator carries out the [trap task](/documentation/m68k/traps) whose number is in `d0.b`, and no vector is read. A task number the simulator does not know goes through vector 47, at `$BC`, as in EASy68K, so a program can add tasks of its own there.

## Trace

When the T bit of the status register, bit 15, is set, the processor takes a trace exception, vector 9, after every instruction. A debugger uses it to stop after each step. `ori #$8000, sr` sets T; the trace handler runs with T clear, and its `rte` restores it, so the next instruction is traced too.

## When there is no handler {#no-handler}

An exception whose vector holds an odd address ends the program, and the message names the exception, the line and the vector:

```text
Division by zero at line 3: vector 5 at $000014 holds no handler
```

A real 68000 would try to run the odd address, raise an address error, find no handler for that either, and halt. The editor ends the program at the first exception instead, so the message points at the instruction that caused it.

If taking an exception itself fails, the processor halts, and the program ends with a message saying so. That happens when the supervisor stack pointer is odd, when the frame would be pushed where a [`memory`](/documentation/m68k/directive#memory) range refuses writes, or when the vector itself is in an `invalid` range.

## Interrupts

An **interrupt** is an exception a device raises between two instructions, such as a key press or a timer. The 68000 has seven levels, taken through vectors 25 to 31, and the three bits I2 to I0 of the status register are the interrupt mask: a request at or below its level waits, and level 7 is always taken. No device in this editor raises one for now, and `stop`, which waits for an interrupt, and `reset` are refused by the assembler. A program polls its devices instead, as the [trap tasks](/documentation/m68k/traps#input) for the keyboard and the mouse do.
