Everything until now decided for itself where to go next: the program counter moved to the next
instruction and a branch moved it somewhere else. Two things can take that decision away. The program can ask for something the CPU
cannot do, and the outside world can arrive while the program was busy with something else.

## Three words for one piece of machinery

- An **exception** is the CPU refusing to carry out the instruction it is on. Dividing by zero, loading a word from an address that is not a multiple of four, decoding bits that are not an instruction. The program caused it, at an instruction the program chose, and the same program run twice raises it in the same place.
- An **interrupt** comes from a device: a key was pressed, a timer ran out, a disk finished. It arrives between two instructions and has nothing to do with which two they were, so a program that does nothing wrong is stopped in the middle anyway.
- A **trap** is the previous lecture: an instruction the program executed on purpose to hand control over.

All three go through the same machinery, because the machinery is the useful part: stop, remember
where you were, go somewhere else, come back.

## Vectors and handlers

The somewhere else is a **handler**, a piece of code that deals with one cause, and the CPU finds it
through a **vector**: an address kept at a place the CPU knows, so that the CPU can look up where to
go without being told. Most machines have a whole table of them, one entry per cause, at a fixed
address. MIPS keeps it simple and looks for one handler at `0x80000180` for everything, with
coprocessor 0 holding the registers that say where the fault was. Filling in those addresses is what
an operating system does before it runs anything else.

The steps are the same wherever you look:

1. The CPU finishes or abandons the instruction it is on.
2. It saves where it was, so that the handler can go back. Some machines push that address on the stack; MIPS puts it in a register called **EPC**, for exception program counter, and RISC-V calls its own `uepc`.
3. It looks the cause up in the table and jumps to the handler.
4. The handler saves any register it is about to use, because the program it interrupted was in the middle of something, deals with the cause, and puts the registers back.
5. It returns with an instruction made for the job, `eret` on MIPS and `uret` on RISC-V, which restores the saved address and carries on where the program left off.

Step 4 is what makes writing one awkward. A handler runs between two instructions of a program that
knows nothing about it, so a handler that leaves `d3` different from how it found it is a bug in a
program that never mentions `d3`.

## What this editor does

A simulator is not a machine with an operating system on it, and the four here answer a fault
differently. This is what each one does.

MIPS runs a real handler. `.ktext 0x80000180` is a section directive that puts what follows at the
address MIPS looks for, `mfc0` and `mtc0` read and write the coprocessor 0 registers where EPC lives,
and `eret` goes back. This program loads a word from an address one byte off, which is an exception,
and the handler steps EPC past the bad instruction and returns:

```mips|playground|console
.data
b:   .byte 1, 2, 3, 4
msg: .asciiz "the handler ran, and the program carried on\n"

.text
main:
    la $t0, b
    addi $t0, $t0, 1    # one byte past a word boundary
    lw $t1, 0($t0)      # a word load at an address that is not a multiple of 4
    li $v0, 4
    la $a0, msg
    syscall
    li $v0, 10
    syscall

.ktext 0x80000180       # where MIPS looks for the handler
    mfc0 $k0, $14       # $14 is EPC, the address of the instruction that faulted
    addi $k0, $k0, 4    # step past it, or it faults again forever
    mtc0 $k0, $14
    eret                # back to the program
```

`$k0` and `$k1` are the two MIPS registers reserved for handlers: a handler may overwrite them at any
moment, so no program is allowed to rely on them, which is what makes them safe to use here. Take
the `addi $k0, $k0, 4` out and the handler returns to the very instruction that faulted, which faults
again, so the program never gets past that line: the fault and the handler take turns until the run
reaches its instruction limit, and the message is never printed.

RISC-V does the same with different names: `csrrw zero, utvec, t0` points `utvec` at your handler,
`csrrsi zero, ustatus, 1` turns the enable bit on, `uepc` is the saved address, and `uret` returns.
Both of those are only exceptions, though, the kind the program causes itself.

The M68K here has no handler at all. There is no vector table you can fill in: `trap #15` is the only
trap the assembler accepts, and any other number fails the Build with "Only implemented TRAP is 15
for IO". A fault ends the run and puts its message in the console panel, ahead of anything the
program had printed: `Error at line 2: Division by zero`, or `Error at line 2: Address error: Tried
to read/write to an odd memory address`. The code is not in the memory you can see either, which is
why a branch to a label with no instruction after it ends the program quietly instead of decoding
whatever bytes are there.

The Z80 assembles `di`, `ei` and `im 1` and they change nothing you can observe, because nothing here
will ever interrupt it. `halt`, which on a real Z80 stops the CPU until an interrupt wakes it, ends
the program.

And no device in this editor raises an interrupt at all. The MARS keyboard has an interrupt enable
bit, bit 1 of its control register, and a program that sets it is
stopped with `Interrupt-driven I/O is not supported: ... Poll the Ready bit (bit 0) instead`.
EASy68K's tasks 60 and 62, which turn on the mouse and keyboard interrupts, are refused with the same
reason. Input here is polled, the way we polled it in the previous lecture, and a program that wants
to know whether a key is waiting has to go and look.
