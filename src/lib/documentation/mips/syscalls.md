## Asking the simulator for a service

`syscall` is a MIPS instruction. On a computer, it asks the operating system to provide a service. In this Playground, the simulator handles the instruction and performs one of the services it provides; there is no separate operating system running inside the simulated computer. Put the service number in `$v0` before `syscall`, and put any arguments in the registers listed for that service.

Each syscall has a unique code that is used to identify it. You must put the syscall code inside the `$v0` register before calling the `syscall` instruction. As an example:

```mips
# Load the integer 42 into register $a0, which is
# the register that will be printed by the syscall
li $a0, 42
# Set the syscall code for printing an integer
li $v0, 1
syscall
```

A C or C++ program reaches the same services through `<sim.h>`: each service below names its function in its **From C** field, and `sim_print_int(42);` does what the lines above do. The function is compiled into the program itself, so the same instructions appear in its Generated assembly.

## Simulator services and behavior

The services are part of this simulator environment. Their behavior can depend on the Terminal, Project Files, Testcase, or other editor panels, so programs that use them are not limited to the instructions built into the MIPS processor.

- Input services read from the Terminal. Number and string input uses a line; service 12 reads one key and completes immediately, with Enter represented by 10. A Testcase supplies scripted input instead. Standard input (descriptor 0) ends when you press Ctrl+D or use **End of input**; a read then reports end of input.
- Service 30 measures milliseconds since the run started. It starts at zero in a Testcase. Service 32 pauses an interactive run while keeping the page responsive; in a Testcase, the wait completes immediately and advances the program's clock.
- Random services (40–44) use a separate stream for each generator. A stream that has not been seeded starts from host randomness during an interactive run and from a fixed seed in a Testcase. Service 40 sets the seed, and Undo restores a stream to its earlier state before a draw or reseed.
- Files live in the Project's **Files**, not on the computer's disk, and open files receive descriptors starting at 3. File errors return -1 where the service returns a result. Undo restores file changes, and each Testcase starts with its own copy of the Project Files.
- The keyboard device queues typed keys and accepts scripted input, so a fast typist or a Testcase does not lose keys. The display transmitter is always ready.
- Exit (10) reports code 0. Exit2 reports its signed code in the Log. A runtime error stops execution; Undo can reverse the last step, and Stop or Build ends that run. Undo also restores program state while keeping the Terminal transcript visible.
- A GNU-profile Build places the heap after static data when it needs to move it. The static-data region spans `0x10010000` through `0x103FFFFF` and is shared by constants, globals, and a `SIM_SCREEN` grid. The assembly profile uses its own memory layout.
- MIDI services 31 and 33 require an Audio Peripheral. Without one, calling them reports an unsupported-service error.
- Strings, dialogs, and file paths use UTF-8. Print-character service 11 prints the low byte of `$a0`; read-character service 12 returns one UTF-16 code unit. File-write service 15 returns the number of bytes written. Service 62 seeks within files; descriptors 0–2 cannot be used with it.
