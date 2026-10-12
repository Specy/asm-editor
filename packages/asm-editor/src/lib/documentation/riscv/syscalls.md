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

Enter **Arguments** on the Terminal's first line, the **Command line**, or in the project's **Settings** panel. They take effect at the next Build; during a Debug session, the line shows what the current run started with. Stop the Debug session to edit the Command line. Arguments are startup strings, separate from text the program reads later through Terminal input.

A Testcase can supply its own **Arguments**. An empty or whitespace-only field inherits the project's Arguments, so it cannot request an empty argument list while project Arguments are set.

### Entering argument strings

The field uses these quoting rules:

- Whitespace separates arguments unless quoted or escaped.
- Single quotes (`'two words'`) and double quotes (`"two words"`) keep text in one argument. The quote marks are removed; `''` and `""` each create an empty argument.
- Outside quotes, a backslash takes the next character literally: `two\ words` is one argument. A trailing backslash stays a backslash.
- Inside single quotes, every character is literal, including a backslash. Inside double quotes, a backslash escapes only a double quote, backslash, dollar sign, or backtick; before other characters it remains a backslash.
- Adjacent quoted and unquoted parts form one argument: `pre"two words"` becomes `pretwo words`.
- Nothing expands and no command runs. Characters such as `$`, `*`, `~`, `#`, `|`, `>`, `;`, and `&` are ordinary text.

An unfinished quote stops Build with an **Arguments** problem naming the column where that quote opened.

For a program named `./main`, entering `hello "two words" '' a\ b` produces `argc = 5`:

| Index     | String          |
| --------- | --------------- |
| `argv[0]` | `./main`        |
| `argv[1]` | `hello`         |
| `argv[2]` | `two words`     |
| `argv[3]` | An empty string |
| `argv[4]` | `a b`           |

### Access from assembly and C/C++

The program starts with `a0` = `argc`, the count of all strings, and `a1` = `argv`, the address of an array of pointers to them. Each string is UTF-8 with a terminating NUL; `argv[argc]` is a null pointer ending the array. `argv[0]` is the program name: `./` plus the Entry path without its final extension (`./main` for `main.s`), or the C or C++ source path without its final extension for a compiled program (`./main` for `main.c`). User Arguments begin at `argv[1]`, so `argc` is at least 1.

Pointers are 4 bytes in RV32 and 8 bytes in RV64. To print the first user argument with the print-string service, perform these operations in order:

| Operation                                       | RV32                                        | RV64                                        |
| ----------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Skip the load if `argc < 2`                     | `li t0, 2`, then `bltu a0, t0, no_argument` | `li t0, 2`, then `bltu a0, t0, no_argument` |
| Load the pointer in `argv[1]`                   | `lw a0, 4(a1)`                              | `ld a0, 8(a1)`                              |
| Print the NUL-terminated string at that pointer | `li a7, 4`, then `ecall`                    | `li a7, 4`, then `ecall`                    |

`no_argument` is a label you supply for the case with no user argument. Loading the pointer into `a0` replaces the count, so save `argc` and `argv` first if you need them after this service call.

For C or C++, declare `int main(int argc, char *argv[])`. Check `argc > 1` before using `argv[1]`; for example, `if (argc > 1) printf("%s\n", argv[1]);` prints the first user argument when `<stdio.h>` is included. See the [Runtime library](/documentation/risc-v/runtime-library#compiled-programs) for startup and function support.

### Memory layout and limits

The strings and pointer array occupy the **Arguments** memory region above the stack, below `0x7FFFFFFC`. `sp` keeps its initial value, `0x7FFFEFFC`. The memory view labels the array `argv` and the strings `argv[0]`, `argv[1]`, … . With the program name `./main` and Arguments `hello "two words"`, `argc` is 3:

| Item                           | RV32         | RV64         |
| ------------------------------ | ------------ | ------------ |
| `a0` (`argc`)                  | `3`          | `3`          |
| `a1` (address of `argv`)       | `0x7FFFFFD4` | `0x7FFFFFC0` |
| `argv[1]` (address of `hello`) | `0x7FFFFFEC` | `0x7FFFFFEC` |

Undo back to the start keeps these initial arguments. A Testcase's starting registers are applied afterwards, so overriding the argument registers replaces the supplied count or array address.

The Arguments field may contain at most 1,024 arguments, excluding `argv[0]`. The entire stored block may use at most 4,080 bytes. That total includes the program name and argument strings as UTF-8 bytes, one terminating NUL byte per string, one pointer per string, the final null pointer, and padding to align the pointer array. Pointers use 4 bytes in RV32 and 8 bytes in RV64; alignment padding uses 0–3 bytes or 0–7 bytes respectively. A string cannot contain a NUL character. Build stops with an Arguments problem if the count or storage limit is exceeded.

When porting code from **RARS**, another RISC-V simulator, account for its different argument layout: RARS omits the program name, starts `argv` with the first user argument, and places `argc` and the pointers below the stack, lowering `sp`. It also uses 4-byte pointers in RV64. In this editor, keep the program-name slot and use the pointer width for your selected architecture.
