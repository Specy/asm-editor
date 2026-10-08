## Asking the simulator for a service

`syscall` asks this simulator to perform one of its services; it does not call an operating system in the simulated machine. Put the service number in `$v0`, then put its arguments in the registers listed in that service's entry. For example, service 1 prints the integer in `$a0`:

```mips
# Load the integer 42 into register $a0, which is
# the register that will be printed by the syscall
li $a0, 42
# Set the syscall code for printing an integer
li $v0, 1
syscall
```

A C or C++ program reaches the same services through `<sim.h>`. Each entry names its function in **From C**; `sim_print_int(42);` performs the same service.

## Simulator services and behavior

The services are part of this simulator environment. Their behavior can depend on the Terminal, Project Files, Testcase, or other editor panels, so programs that use them are not limited to the instructions built into the MIPS processor.

- Input services read from the Terminal. Number and string input uses a line; service 12 reads one key and completes immediately, with Enter represented by 10. A Testcase supplies scripted input instead. Standard input (descriptor 0) ends when you press Ctrl+D or use **End of input**; a read then reports end of input.
- Service 30 measures milliseconds since the run started. It starts at zero in a Testcase. Service 32 pauses an interactive run while keeping the page responsive; in a Testcase, the wait completes immediately and advances the program's clock.
- Random services (40–44) use a separate stream for each generator. A stream that has not been seeded starts from host randomness during an interactive run and from a fixed seed in a Testcase. Service 40 sets the seed, and Undo restores a stream to its earlier state before a draw or reseed.
- Files live in the Project's **Files**, not on the computer's disk, and open files receive descriptors starting at 3. File errors return -1 where the service returns a result. Undo restores file changes, and each Testcase starts with its own copy of the Project Files.
- The keyboard device queues typed keys and accepts scripted input, so a fast typist or a Testcase does not lose keys. The display transmitter is always ready.
- Exit (10) reports code 0. Exit2 reports its signed code in the Log. A runtime error stops execution; Undo can reverse the last step, and Stop or Build ends that run. Undo also restores program state while keeping the Terminal transcript visible.
- Compiled C and C++ programs place the heap after static data when it needs to move. Static data occupies 4,128,768 bytes starting at `0x10010000`; its last byte is `0x103FFFFF` and the exclusive end is `0x10400000`. Constants, globals, and a `SIM_SCREEN` grid share this range. Assembly programs use the assembler's memory layout.
- MIDI services 31 and 33 are unavailable; calling either stops the program with an unsupported-service error.
- Strings, dialogs, and file paths use UTF-8. Print-character service 11 prints the low byte of `$a0`; read-character service 12 returns one UTF-16 code unit (a 16-bit value, which may be half of a supplementary Unicode character). File-write service 15 returns the number of bytes written. Service 62 seeks within files; descriptors 0–2 cannot be used with it.

Open supports read-write extensions: flag 2 opens an existing File (`r+`), 3 creates or truncates (`w+`), and 10 creates and appends writes (`a+`). All three allow reading and writing with one shared position. Original flags 0, 1 and 9 retain their reference behavior. Runtime-only service 1100 returns -1 for heap exhaustion; service 9 still stops with a runtime error.
