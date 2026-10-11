Everything until now decided for itself where to go next: the program counter moved to the next
instruction, and a branch moved it somewhere else. Two things can take that decision away from the
program. It can ask for something the CPU cannot carry out, and the outside world can arrive while
the program was busy with something else.

## Three words for one piece of machinery

- An **exception** is the CPU refusing to carry out the instruction it is on. Dividing by zero,
  reading a word from an address that is not a multiple of four, decoding bits that are not an
  instruction. The program caused it, at an instruction the program chose, and the same program run
  again raises it in the same place.
- An **interrupt** comes from a device: a key was pressed, a timer ran out, a disk finished. It
  arrives between two instructions and has nothing to do with which two they were, so a program that
  is doing nothing wrong gets stopped in the middle anyway.
- A **trap** is the previous lecture, an instruction the program ran on purpose to hand control over.

You will also see **fault** and **abort** for kinds of exception, and **IRQ**, for interrupt request,
for the signal a device raises. All of them go through the same machinery, because the machinery is
the useful part: stop, remember where you were, go somewhere else, come back.

## Vectors and handlers

The somewhere else is a **handler**, a piece of code that deals with one cause, and the CPU finds it
through a **vector**, which is an address kept where the CPU knows to look. Most machines have a
whole table of them at a fixed address, one entry per cause, and it is called the **vector table**;
some machines look for a single handler at one address and let it work out the cause for itself.
Filling that table in is one of the first things an operating system does.

What happens next is the same wherever you look:

1. The CPU finishes, or abandons, the instruction it is on.
2. It saves where it was, so the handler can get back. Some machines push that address on the stack,
   others put it in a register kept for the purpose.
3. It looks the cause up and jumps to the handler, usually switching to supervisor mode on the way.
4. The handler saves any register it is about to use, deals with the cause, and puts those registers
   back.
5. It returns with an instruction made for the job, which restores the saved address and carries on
   where the program left off.

Step 4 is what makes a handler awkward to write. It runs between two instructions of a program that
knows nothing about it, so a handler that leaves a register different from how it found it is a bug
in a program that never mentions that register, appearing at a moment nobody chose.

## Why interrupts exist

Polling, from the previous lecture, works and wastes the whole CPU: the program spins reading a
status bit, and it has to keep going back to look. An interrupt turns that around. The program stops
looking and gets on with its own work, and the device says something when it has something to say.

That is how one machine keeps up with a keyboard, a timer, a disk and a network card at once, and it
is why an operating system can let your program run at all while the rest of the machine carries on.
It also explains the shape of the code: the work of dealing with a key is in the handler, and the
program that gets interrupted has no line anywhere in it that mentions the keyboard.

A CPU can also be told to ignore interrupts for a while, which is called **masking** or **disabling**
them. Short pieces of code that must not be stopped halfway run with interrupts off and turn them
back on afterwards. Many machines give each cause a **priority**, so an urgent device can interrupt
the handler of a less urgent one, and keep a few causes **non-maskable**, which no program is allowed
to ignore.

## What this editor does

A simulator is not a machine with an operating system on it, and the ones here answer a fault
differently from each other.

MIPS and RISC-V go furthest: both can run a handler you wrote, for exceptions the program causes
itself. MIPS looks for it at one fixed address and keeps the address of the faulting instruction in
a register called **EPC**, the exception program counter, which the handler has to step past before
returning, or the same instruction faults again forever.

The M68K here has no vector table you can fill in: the only trap the assembler accepts is the one the
console uses, and a fault ends the run and puts its message in the console panel instead of jumping
anywhere.

The Z80 assembles its interrupt instructions and they change nothing you can observe, because nothing
in this editor will ever interrupt it.

No device here raises an interrupt at all. The MIPS and RISC-V keyboard has an interrupt-enable bit,
and a program that sets it is stopped with a message saying that interrupt-driven input is not
supported and that it should poll the ready bit instead. The M68K's two trap tasks for turning on
keyboard and mouse interrupts are refused for the same reason. Input in this editor is polled, the
way the previous lecture polled it, and a program that wants to know whether a key is waiting has to
go and look.
