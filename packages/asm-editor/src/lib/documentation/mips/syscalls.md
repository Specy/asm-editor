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

The program starts with `$a0` = `argc`, the count of all strings, and `$a1` = `argv`, the address of an array of pointers to them. Each string is UTF-8 with a terminating NUL; `argv[argc]` is a null pointer ending the array. `argv[0]` is the program name: `./` plus the Entry path without its final extension (`./main` for `main.asm`), or the C or C++ source path without its final extension for a compiled program (`./main` for `main.c`). User Arguments begin at `argv[1]`, so `argc` is at least 1.

Pointers are 4 bytes. To print the first user argument with the print-string service, perform these operations in order:

| Operation                                       | Instructions                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| Skip the load if `argc < 2`                     | `sltiu $t0, $a0, 2`, then `bne $t0, $zero, no_argument`, then `nop` |
| Load the pointer in `argv[1]`                   | `lw $a0, 4($a1)`                                                    |
| Print the NUL-terminated string at that pointer | `li $v0, 4`, then `syscall`                                         |

`no_argument` is a label you supply for the case with no user argument. Loading the pointer into `$a0` replaces the count, so save `argc` and `argv` first if you need them after this service call.

For C or C++, declare `int main(int argc, char *argv[])`. Check `argc > 1` before using `argv[1]`; for example, `if (argc > 1) printf("%s\n", argv[1]);` prints the first user argument when `<stdio.h>` is included. See the [Runtime library](/documentation/mips/runtime-library#compiled-programs) for startup and function support.

### Memory layout and limits

The strings and pointer array occupy the **Arguments** memory region above the stack, below `0x7FFFFFFC`. `$sp` keeps its initial value, `0x7FFFEFFC`. The memory view labels the array `argv` and the strings `argv[0]`, `argv[1]`, … . With the program name `./main` and Arguments `hello "two words"`, `argc` is 3:

| Item                           | Value        |
| ------------------------------ | ------------ |
| `$a0` (`argc`)                 | `3`          |
| `$a1` (address of `argv`)      | `0x7FFFFFD4` |
| `argv[1]` (address of `hello`) | `0x7FFFFFEC` |

Undo back to the start keeps these initial arguments. A Testcase's starting registers are applied afterwards, so overriding the argument registers replaces the supplied count or array address.

The Arguments field may contain at most 1,024 arguments, excluding `argv[0]`. The entire stored block may use at most 4,080 bytes. That total includes the program name and argument strings as UTF-8 bytes, one terminating NUL byte per string, one pointer per string, the final null pointer, and padding to align the pointer array. Pointers use 4 bytes and alignment padding uses 0–3 bytes. A string cannot contain a NUL character. Build stops with an Arguments problem if the count or storage limit is exceeded.

When porting code from **MARS**, another MIPS simulator, account for its different argument layout: MARS omits the program name, starts `argv` with the first user argument, and places `argc` and the pointers below the stack, lowering `$sp`. In this editor, keep the program-name slot and use the starting `$a0` and `$a1` described above.
