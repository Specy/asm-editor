The Runtime library provides C functions for RISC-V C and C++ programs compiled in the editor, and for assembly programs that explicitly link it. Its functions are declared in `<assert.h>`, `<ctype.h>`, `<inttypes.h>`, `<math.h>`, `<stdio.h>`, `<stdlib.h>`, `<string.h>` and `<time.h>`, and the folder functions in `<dirent.h>`, `<sys/stat.h>` and `<unistd.h>`. For example, `printf` and `scanf` use the Terminal, file functions read and write files, and allocation functions manage program memory. The function reference entries below this overview list the supported functions with their declarations and headers. C++ also gets the support needed for global constructors, `new` and `delete`; the full C++ standard library is not included. The Build links only functions the program uses and their dependencies.

## Compiled programs {#compiled-programs}

Compiling a C or C++ file links the Runtime library automatically. Startup runs global constructors, calls `main`, and passes its result to `exit`. By default, Build completes Runtime startup before execution begins in your code: the first instruction is in `main`, or in a C++ global constructor that runs before `main`. Undo can reverse steps from that point onward; it does not reverse startup. Streams are unbuffered by default, so stepping over `printf` shows its text at once. Requested output buffering delays output until a flush, a full buffer, or a newline for line buffering.

### Program arguments

Use `int main(int argc, char *argv[])` to receive startup arguments in C or C++. `argc` counts the strings, including the program name. `argv` is an array of pointers to NUL-terminated strings, with a null pointer at `argv[argc]`. `argv[0]` is `./` plus the source file's path without its final extension: `main.c` gives `./main`. The **Arguments** follow it. For Arguments `hello "two words"`:

| Value     | Contents       |
| --------- | -------------- |
| `argc`    | `3`            |
| `argv[0]` | `./main`       |
| `argv[1]` | `hello`        |
| `argv[2]` | `two words`    |
| `argv[3]` | A null pointer |

Check `argc > 1` before using `argv[1]`. For example, `if (argc > 1) printf("%s\n", argv[1]);` prints the first user argument when `<stdio.h>` is included. With no Arguments, `argc` is 1. Enter Arguments on the Terminal's **Command line** or in **Settings**, then Build again to apply them. These strings are separate from input read later by `scanf` or `fgets`. See [Program arguments](/documentation/risc-v/syscall#arguments) for quoting, limits, Testcase inheritance, and assembly access.

Programs have no environment variables; `getenv` always returns NULL.

### Memory and allocation

Static data and the heap share 64 MB, from `0x10000000` up to `0x14000000`, which `<sim.h>` names `SIM_DATA_SEGMENT_END`. RARS has 4 MB, up to `0x10400000`, so a program that needs more than that runs here but runs out of memory in RARS.

Compiled C and C++ programs have the 67,043,328 bytes from `0x10010000` for static data. Constants, globals, and a `SIM_SCREEN` grid share this range with the heap. The heap moves to the first 4 KiB page after static data when needed. Assembly programs retain the assembler’s memory layout, with the heap from `0x10040000`.

The Runtime library’s allocation service 1100 returns -1 when the heap would pass `0x14000000`; the assembly service 9 stops execution with a runtime error. See [`malloc`](#malloc) for allocation results and alignment.

## From hand-written assembly {#from-assembly}

Hand-written assembly can call the library too. In the Workbench's **Settings** panel, open **Project Settings** and set **Link Runtime library** to **Runtime ABI v1**. For ordinary fixed-argument calls, integer and pointer arguments use `a0` to `a7`, and floating-point arguments use `fa0` to `fa7`; each register sequence is assigned independently. Arguments that do not fit in registers go on the stack. Variadic arguments (the arguments represented by `...`, as in `printf`) use the integer argument registers and then the stack, including floating-point values. Integer or pointer results return in `a0`; floating-point results return in `fa0`. Follow the RISC-V psABI for aggregate arguments and other special cases. The setting is off by default, so an unresolved call can still report an undefined symbol; the diagnostic identifies names supplied by the library.

```riscv
.data
format: .string "%d + %d = %d\n"
.text
main:
    la a0, format
    li a1, 2
    li a2, 3
    li a3, 5
    call printf
    li a7, 10
    ecall
```

A program that calls the library this way keeps its own start and its own addresses: the library's code and data come after the program's. The library needs no initialization, so every function works without the startup code.

## Files and folders {#folders}

Alongside the file streams in `<stdio.h>`, the library provides functions for folders and for files named by a path. They use the same files as the [file and folder services](/documentation/risc-v/syscall#folders), including their path rules, folder lifetime, Undo support and isolated Testcase copies.

| Function                                       | Header         | What it does                                                                                                                        |
| ---------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `int mkdir(const char *path, mode_t mode)`     | `<sys/stat.h>` | Creates a folder. `mode` is ignored. All files and folders have read, write and execute permissions.                                |
| `int stat(const char *path, struct stat *buf)` | `<sys/stat.h>` | Fills `buf`. `S_ISDIR(buf->st_mode)` tests for a folder, `S_ISREG(buf->st_mode)` for a file. `st_size` is the file size in bytes.   |
| `int unlink(const char *path)`                 | `<unistd.h>`   | Deletes a file.                                                                                                                     |
| `int rmdir(const char *path)`                  | `<unistd.h>`   | Deletes an empty folder.                                                                                                            |
| `int rename(const char *from, const char *to)` | `<stdio.h>`    | Renames a file or moves it into an existing folder, replacing a destination file if present.                                        |
| `int remove(const char *path)`                 | `<stdio.h>`    | Deletes a file or an empty folder.                                                                                                  |
| `DIR *opendir(const char *path)`               | `<dirent.h>`   | Opens a folder for listing and returns a pointer used by readdir and closedir.                                                      |
| `struct dirent *readdir(DIR *dir)`             | `<dirent.h>`   | Returns the next entry, starting with `.` and `..`. `d_name` is its name. `d_type` is `DT_DIR` for a folder or `DT_REG` for a file. |
| `int closedir(DIR *dir)`                       | `<dirent.h>`   | Closes a folder opened by opendir and frees its listing state.                                                                      |

`mkdir`, `stat`, `unlink`, `rmdir`, `rename` and `remove` return 0 on success or -1 on failure, setting `errno` to the error number. `opendir` returns NULL on failure and sets `errno`. `closedir` returns 0 for a valid open folder.

`readdir` returns NULL both at the end of a listing and on failure. At the end it leaves `errno` unchanged. On failure it sets `errno`. To tell the two apart, set `errno = 0` immediately before each call, then inspect it if the call returns NULL. The returned entry belongs to the open folder's listing state and is overwritten by the next readdir call on that folder.

Common errors are `ENOENT` for a missing path, `EEXIST` when mkdir finds a file or folder at the path, `ENOTDIR` when a file is used as a folder, `EISDIR` when a folder is used as a file, and `ENOTEMPTY` when rmdir finds files or subfolders inside. After `EEXIST`, use stat and `S_ISDIR` to check that the existing path is a folder.

A folder created by mkdir remains after the run only if a file still exists inside it, directly or in a subfolder. An empty `.keep` file is sufficient. Folders cannot be moved, and renaming a file onto an existing file replaces that file. The [folder services](/documentation/risc-v/syscall#folders) give an example and the full persistence rules.

## Standard input {#standard-input}

Reading standard input (`scanf`, `fgets`, `getchar`) waits for a line typed in the console and keeps what the program did not read for the next call, as a terminal does. Pressing Ctrl+D, or the console's _End of input_ button, on an empty line ends standard input: the read returns end of file. In a Testcase, standard input ends when its scripted answers run out.

## Reading the library {#reading-the-library}

The **Explorer** is the file list for the current Build. It includes linked library functions as read-only files. From a call such as `call printf`, choose **Go to Definition** to open the function's assembly; choose **Show C source** to open its C implementation with matching source lines.

## Stepping {#stepping}

A runtime error stops execution. Undo reverses recorded program state, what the program printed included; Stop or Build ends the run.

By default, **Step** over `call printf` runs the whole library call, and one **Undo** reverses that call. A library function that calls back into your program, such as `qsort` calling its comparison function, stops in your code. To inspect library instructions one at a time, turn on **Step into library code** in **Preferences**. For programs compiled in the editor, enabling this Preference begins execution in Runtime startup at `_start`, so you can step through startup too.
