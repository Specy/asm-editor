## Making a syscall

MIPS syscalls are used to make requests to the operating system. They are not instructions that are executed by the CPU, but rather instructions that are used by the simulator to make requests to the operating system.

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

## Differences from MARS

The services follow MARS 4.5 on JDK 21, including number parsing and the shortest round-trip float and double text. These differences support browser programs and reproducible Testcases.

- Lines and character reads use the Terminal; a character read completes on one key, and Enter is 10. Scripted reads use the Testcase's input. Standard input (descriptor 0) accepts Ctrl+D or **End of input** and returns zero bytes; the reference has no end-of-input action.
- Time (30) measures milliseconds since the run started. In a Testcase it starts at zero and advances through sleep (32), whose wait completes immediately. Interactive sleeps keep the page responsive.
- Random services (40–44) use `java.util.Random` sequences as on JDK 21. A stream the program has not seeded starts from host randomness interactively and a fixed per-generator seed in a Testcase. Service 40 selects the same sequence in either mode. Undo restores a stream before a draw or reseed.
- Files live in the Project's FileSystem, with descriptors from 3; they do not reach the computer's disk. Errors return -1 where the service returns a result. Undo restores file changes. Testcases each start with their own copy of the Project Files.
- The keyboard device keeps typed keys in a queue and accepts scripted input, so a fast typist or a Testcase does not lose keys. The reference receiver holds only its latest key. The display transmitter is always ready.
- Exit (10) reports code 0, and exit2 reports its signed code in the Log, where the reference GUI ignores it. A runtime error stops the program until Undo, Stop or Build. The Terminal transcript is retained through Undo.
- GNU-profile Builds move the heap to the first 4 KiB page after static data when needed. Static data has 4,128,768 bytes from `0x10010000` to `0x10400000`, shared by constants, globals and a `SIM_SCREEN` grid. Assembly in the reference dialect keeps the reference layout.
- MIDI services 31 and 33 are unavailable until the editor has an Audio Peripheral; calling them reports an unsupported-service error.

- String literals, string services, dialogs and file paths use UTF-8 throughout. MARS stores and prints string literals one byte per character, so a UTF-8 C string can look different through print string and file write there. Print char still takes the low byte, and read char the first UTF-16 unit, as in RARS.
- File write returns the actual byte count rather than MARS 4.5's extra trailing NUL and count of length plus one. Service 62 adds RARS-style lseek; descriptors 0–2 cannot seek.
