Normally the CPU follows the program's instructions, including branches and subroutine calls. Some
other events also transfer control to code called a **handler**:

- An **exception** is raised by an instruction or a condition encountered while executing it. For
  example, a machine may raise one when it cannot decode an instruction or when a memory address is
  not aligned as required. A four-byte word, for example, may need an address divisible by four.
- An **interrupt** is a request from outside the running instruction, such as a timer or keyboard
  signalling that it needs attention. It can arrive while the program is doing unrelated work.
- A **trap** can be an instruction used deliberately to transfer control, for example to request a
  numbered system service. Machines also use the word for other kinds of exception, so its exact
  meaning depends on the machine.

## Following an interrupt

Suppose a program is adding up numbers when a timer requests attention:

```text
program adds numbers → timer requests interrupt → CPU enters handler
                                                → handler deals with timer
program continues     ← return from handler     ← handler restores its registers
```

The CPU saves a return location and any other state required by that machine. It may enter
**supervisor mode**, where privileged operations are allowed. The handler deals with the event and
uses a special return instruction. Depending on the machine, this restores state such as the earlier
mode as well as the instruction address. The CPU and handler may save state on a stack, in special
registers, or both.

The handler must preserve ordinary registers it uses. Imagine the interrupted program has a running
total of 12 in a register and will add the next number to it. If the handler changes that register
to 0 and leaves it there, the program continues with the wrong total. Saving 12 before using the
register and restoring it before returning prevents that error.

## Finding a handler

A machine needs a known place to find handler code. Some use a **vector table**, a list of handler
addresses. For example, an M68K division-by-zero exception selects vector 5. With the table at
address zero, entry 5 is at address 5 × 4 = 20: the four-byte value stored there is the handler's address.
The CPU reads that value and transfers control to the handler. Other causes select other entries.

Another design transfers every exception to one fixed handler. That handler can read information
about the cause and decide what to do. In either design, the handler must be installed before the
event occurs. This means placing handler code at the required address and, when a vector table is
used, writing its address into the appropriate entry. Otherwise the machine or simulator may stop
the program.

## Where does execution return?

The saved address is not always the same kind of address. For an interrupt it generally identifies
where execution can continue; for an exception it may identify the instruction that caused the
exception or a later instruction. The machine and the cause determine what was saved. Some events
cannot safely be resumed at all.

If the saved address points to a failed instruction, a handler might fix the cause and return to
retry it. If it deliberately skips the instruction, it must adjust the saved address when the
machine permits that. Skipping means the instruction's intended result may be missing, so the
program needs a sensible way to continue. Returning without fixing the cause or changing the address
can cause the same exception again.

For example, in this editor's MIPS simulator, an exception saves the faulting instruction address
in **EPC**. If a handler decides to skip an instruction at `0x1000`, it changes EPC to `0x1004`,
because these instructions are four bytes long. `eret` then returns to `0x1004`. Leaving EPC at
`0x1000` retries the instruction; it will fault again if the cause remains. This is an example of a
choice for that simulator, not a rule for every exception on every machine.

## Interrupts and polling

With **polling**, a program reads a device's status to check whether it is ready. It can check in a
busy loop or return to the check between other work. With an interrupt, the device requests
attention when needed, so the program need not keep checking. For example, a timer can request an
interrupt while the program continues its calculations; its handler deals with the timer, then the
calculations continue.

A program can temporarily **mask** some interrupts, holding them back while it performs work that
must not be interrupted. Machines may assign interrupt requests different priority levels and allow
some urgent requests even when others are masked. Exact rules depend on the machine.

## In this editor

The simulators do not all provide the same events or handler mechanism:

- MIPS uses a fixed exception handler address. EPC holds the faulting address and `eret` returns to
  the address in EPC. No device interrupts are delivered.
- RISC-V can use a handler whose address the program places in `utvec`; the simulator also requires
  the user interrupt-enable bit to be set for handler entry. It saves the interrupted instruction
  address in `uepc`, and `uret` returns to it. Device input is not interrupt-driven here.
- M68K uses a vector table for exceptions and supports timer, keyboard and mouse interrupts. An
  installed handler returns with `rte`. A missing handler stops the run with a message. See the
  [M68K exception reference](/documentation/m68k/exceptions) for the vector entries, interrupt
  levels, masks and waiting instruction.
- Z80 interrupt instructions assemble, but no device in this editor raises an interrupt for them.

For MIPS and RISC-V keyboard input, poll the ready bit. Setting the device's interrupt-enable bit
instead stops the program with a message that interrupt-driven input is unsupported.

## Check your understanding

1. A timer interrupts a program while a register holds a running total. What must the handler do if
   it needs that register?
2. A MIPS exception saves `0x1000` in EPC. What will `eret` do if the handler leaves it unchanged?
   What happens if the handler changes it to `0x1004`?
3. A program checks a keyboard's ready bit once between calculations. Is it polling even though it
   is not waiting in a busy loop?

<details>
<summary>Show answers</summary>

The handler must save and restore the register. `eret` returns to `0x1000` in the first case and
`0x1004` in the second; retrying may raise the exception again. The keyboard check is polling.

</details>
