## Making a syscall

An `ecall` asks the simulator to provide a service such as printing text, reading input, checking elapsed time, or working with a project file. These services are part of this simulator environment; they are not a RISC-V operating-system interface, and another RISC-V system may use different service numbers or conventions.

Each syscall has a unique code that is used to identify it. You must put the syscall code inside the `a7` register before calling the `ecall` instruction. As an example:

```riscv
# Load the integer 42 into register a0, which is
# the register that will be printed by the syscall
li a0, 42
# Set the syscall code for printing an integer
li a7, 1
ecall
```

A C or C++ program reaches the same services through `<sim.h>`: each service below names its function in its **From C** field, and `sim_print_int(42);` does what the lines above do. The function is compiled into the program itself, so the same instructions appear in its Generated assembly.

## How services behave in this simulator

The same service numbers and register conventions work in RV32 and RV64. Interactive runs connect to the editor's Terminal and Project FileSystem. Testcases use scripted input, an isolated copy of project files, and a virtual clock so the same program can be run reproducibly.

- Line-based reads wait for Enter; a character read completes on one key, and Enter has value 10. In a Testcase, reads take characters from the testcase's input. Standard input (descriptor 0) also accepts Ctrl+D or **End of input** and returns zero bytes.
- Time (30) measures milliseconds since the run started. In a Testcase it starts at zero and advances through sleep (32), whose wait completes immediately. Interactive sleeps keep the page responsive. The `time` and RV32 `timeh` CSRs use the same program clock, and Undo restores the previous reading.
- Random services (40–44) use Java-compatible pseudorandom sequences. An unseeded stream starts from host randomness interactively and a fixed per-generator seed in a Testcase. Service 40 selects the same sequence in either mode. Undo restores a stream before a draw or reseed.
- Files live in the Project's FileSystem, with descriptors from 3; they do not reach the computer's disk. Open flags are 0 (read), 1 (write with create), or 9 (write with create and append); the mode argument is ignored. Errors return -1 where the service returns a result. Undo restores file changes. Each Testcase starts with its own copy of the Project Files.
- The memory-mapped keyboard device queues typed keys, so fast typing and scripted input do not lose keys. The display transmitter is always ready. Device interrupt-enable bits are unsupported: this editor polls the device and stops the program with an error if an interrupt is requested.
- Exit (10) reports code 0; exit2 reports its signed code in the Log. A runtime error stops the program until Undo, Stop, or Build. The Terminal transcript is retained through Undo.
- With GNU-profile Builds, the heap moves to the first 4 KiB page after static data when needed. Static data spans 4,128,768 bytes from `0x10010000` to `0x10400000`, shared by constants, globals, and a `SIM_SCREEN` grid. Assembly-profile Builds use the assembler's standard layout.
- MIDI services 31 and 33 are unavailable because this environment has no Audio Peripheral; calling them reports an unsupported-service error.

- GetCWD (17) writes `/`, the Project root, rather than a host working directory. It needs at least two bytes including the terminating NUL; failure returns -1.
- Input dialog double (53) reads its message from `a0` and returns the value in `fa0`.
