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

A C or C++ program reaches the same services through `<sim.h>`. Each entry names its function in **From C**; `sim_print_int(42);` performs the same service.

## How services behave in this simulator

The same service numbers and register conventions work in RV32 and RV64. Interactive runs connect to the editor's Terminal and Project FileSystem. Testcases use scripted input, an isolated copy of project files, and a virtual clock so the same program can be run reproducibly.

- Line-based reads wait for Enter; a character read completes on one key, and Enter has value 10. In a Testcase, reads take characters from the testcase's input. Standard input (descriptor 0) also accepts Ctrl+D or **End of input** and returns zero bytes.
- Time (30) reports Unix epoch milliseconds. In a Testcase it starts at 2000-01-01 UTC and advances through sleep (32), whose wait completes immediately. Interactive sleeps keep the page responsive. The `time` and RV32 `timeh` CSRs use the same program clock, and Undo restores the previous reading.
- Random services (40–44) use Java-compatible pseudorandom sequences. An unseeded stream starts from host randomness interactively and a fixed per-generator seed in a Testcase. Service 40 selects the same sequence in either mode. Undo restores a stream before a draw or reseed.
- Files live in the Project's FileSystem, with descriptors from 3; they do not reach the computer's disk. Open flags are 0 (read), 1 (write with create), or 9 (write with create and append); the mode argument is ignored. Errors return -1 where the service returns a result. Undo restores file changes. Each Testcase starts with its own copy of the Project Files.
- The memory-mapped keyboard device queues typed keys, so fast typing and scripted input do not lose keys. The display transmitter is always ready. Device interrupt-enable bits are unsupported: this editor polls the device and stops the program with an error if an interrupt is requested.
- Exit (10) reports code 0; exit2 reports its signed code in the Log. A runtime error stops the program until Undo, Stop, or Build. The Terminal transcript is retained through Undo.
- Compiled C and C++ programs place the heap at the first 4 KiB page after static data when it needs to move. Static data occupies 4,128,768 bytes starting at `0x10010000`; its last byte is `0x103FFFFF` and the exclusive end is `0x10400000`. Constants, globals, and a `SIM_SCREEN` grid share this range. Assembly programs use the assembler's memory layout.
- MIDI services 31 and 33 are unavailable; calling either stops the program with an unsupported-service error.

- GetCWD (17) writes `/`, the Project root, rather than a host working directory. It needs at least two bytes including the terminating NUL; failure returns -1.
- Input dialog double (53) reads its message from `a0` and returns the value in `fa0`.

Open supports read-write extensions: flag 2 opens an existing File (`r+`), 3 creates or truncates (`w+`), and 10 creates and appends writes (`a+`). All three allow reading and writing with one shared position. Original flags 0, 1 and 9 retain their reference behavior. Runtime-only service 1100 returns -1 for heap exhaustion; service 9 still stops with a runtime error.

## Program arguments {#arguments}

The Terminal's first line is the **Command line**, `$ ./main` followed by the program's **Arguments**, typed as in a shell: spaces separate words, quotes keep them together (`"two words"`) and a backslash escapes the next character. Nothing is expanded and no command runs. The Arguments are a Setting of the project, also in the **Settings** panel, and take effect at the next Build; during a Debug session the line shows what that run started with. A Testcase can bring its own in its **Arguments** field; one whose field is empty runs with the project's.

The program starts with `a0` = `argc`, the number of words, and `a1` = `argv`, the address of an array of pointers to them that ends with a null pointer. Pointers are 4 bytes in RV32 and 8 in RV64. `argv[0]` is the program's name, the Entry path without its extension (`./main` for `main.s`; for a compiled program its C or C++ File's, `./main` for `main.c`), so `argc` is at least 1, and the Arguments follow it. The strings and the array sit above the stack, between `sp` and `0x7FFFFFFC`, and `sp` starts at `0x7FFFEFFC` as always. With the Arguments `hello "two words"`, `a0` is 3, `a1` is `0x7FFFFFD4` (`0x7FFFFFC0` in RV64), and `argv[1]` points to `hello` at `0x7FFFFFEC`. Undo back to the start keeps them, and a Testcase's starting registers are set after them. The memory view shows them as the **Arguments** region, above the stack, and names their parts: `argv` for the array and `argv[0]`, `argv[1]`, … for the strings.

The program name, the Arguments and the array take at most 4,080 bytes together: each word takes its UTF-8 bytes and a terminating NUL, plus a pointer. A Build whose Arguments do not fit, or have more than 1,024 words, stops with an Arguments problem. This departs from RARS, whose program arguments start `argv` at the first argument, with no program name, put `argc` and the pointers below the stack, lowering `sp`, and use 4-byte pointers in RV64 too.
