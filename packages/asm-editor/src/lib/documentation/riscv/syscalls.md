## Making a syscall

An `ecall` asks the simulator to provide a service such as printing text, reading input, reading calendar time, or working with a project file. These services are part of this simulator environment; they are not a RISC-V operating-system interface, and another RISC-V system may use different service numbers or conventions.

The same service numbers and register conventions work in RV32 and RV64. Each syscall has a unique code that is used to identify it. You must put the syscall code inside the `a7` register before calling the `ecall` instruction. As an example:

```riscv
# Load the integer 42 into register a0, which is
# the register that will be printed by the syscall
li a0, 42
# Set the syscall code for printing an integer
li a7, 1
ecall
```

A C or C++ program reaches the same services through `<sim.h>`. Each entry names its function in **From C**; `sim_print_int(42);` performs the same service.

## Files and folders {#folders}

A program reads and writes the **Project Files**, the files you see in the editor, never your computer’s disk. A path names a file from the Project’s top folder: `data/scores.txt` is the file `scores.txt` in the folder `data`. Open, read, write and close work on files (services 1024, 63, 64 and 57). Six more services work with folders, and with files by name:

| Service       | What it does                                                  |
| ------------- | ------------------------------------------------------------- |
| 1026 unlink   | Deletes a file.                                               |
| 1030 mkdir    | Makes a folder.                                               |
| 1031 rmdir    | Deletes an empty folder.                                      |
| 1034 rename   | Renames a file, or moves it into another folder.              |
| 1038 stat     | Says whether a path is a file or a folder, and a file’s size. |
| 1065 getdents | Lists the entries of a folder opened with service 1024.       |

These six report a failure differently from the older file services. Instead of -1, `a0` holds minus an **error number** that says what went wrong, the way Linux reports it, so a program can react to each reason. A check for `a0 < 0` works for both kinds of service.

| Result | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| -2     | Nothing is at the path, or a folder on the way to it is missing.    |
| -17    | mkdir found something at the path already.                          |
| -20    | The path names a file where a folder was expected.                  |
| -21    | The path names a folder where a file was expected.                  |
| -39    | The folder still holds a file or a folder, so it cannot be deleted. |

Folders behave as they do in this editor’s Project:

- **A folder that mkdir makes lasts until the program ends.** It stays in the Project only once a file is written inside it, so a program that wants to keep an empty folder writes a small hidden file such as `.keep` into it. A program run again may find its folder already there: treat -17 from mkdir as success.
- **rmdir deletes only an empty folder.** Delete its files first with unlink.
- **rename moves files, not folders:** renaming a folder, or a file onto a folder, fails with -21, and a folder onto a file with -20. Renaming a file onto another file replaces that file, as Linux does, and Undo brings both back.
- **A listing starts with `.` and `..`**, the folder itself and the folder that holds it, then names its files and folders in name order. Each entry has an **inode number**, a number that identifies it and stays the same for the whole run.

Undo takes back every one of these services, and each Testcase runs on its own copy of the Project Files, so nothing it makes, deletes or renames reaches the Project.

### Listing a folder from assembly

To list a folder, open it with service 1024 and flag 0, as if reading a file, then call getdents (1065) with a buffer. It fills the buffer with one **record** per entry and returns how many bytes it stored; call it again until it returns 0. Each record starts with the entry’s inode number and the position of the next entry, 4 bytes each in RV32 and 8 bytes each in RV64. Then come the record’s length as a halfword and the name, ending with a NUL; the record’s last byte says what the entry is: 4 for a folder, 8 for a file.

| Field                   | RV32 offset | RV64 offset |
| ----------------------- | ----------- | ----------- |
| Record length (2 bytes) | 8           | 16          |
| Name                    | 10          | 18          |
| Type (last byte)        | length - 1  | length - 1  |

```riscv
# Lists the Project's top folder, one name per line, with a / after each folder.
        .data
here:   .asciz "."
slash:  .asciz "/"
newline: .asciz "\n"
        .align 3
buffer: .space 512
        .text
main:
        li   a7, 1024         # open "." for reading (flag 0); it is a folder
        la   a0, here
        li   a1, 0
        li   a2, 0
        ecall
        bltz a0, done         # -1: it could not be opened
        mv   s0, a0           # s0 = the folder's descriptor
fill:
        li   a7, 1065         # getdents: fill the buffer with records
        mv   a0, s0
        la   a1, buffer
        li   a2, 512
        ecall
        blez a0, close        # 0: every entry listed; negative: an error
        la   s1, buffer       # s1 = the record being read
        add  s2, s1, a0       # s2 = just past the last record stored
record:
        addi a0, s1, 10       # the name starts at offset 10 (18 in RV64)
        li   a7, 4
        ecall
        lhu  t0, 8(s1)        # the record's length, at offset 8 (16 in RV64)
        add  t1, s1, t0
        lbu  t2, -1(t1)       # its last byte: 4 for a folder, 8 for a file
        li   t3, 4
        bne  t2, t3, line
        la   a0, slash
        li   a7, 4
        ecall
line:
        la   a0, newline
        li   a7, 4
        ecall
        add  s1, s1, t0       # on to the next record
        bltu s1, s2, record
        j    fill             # ask for the next records
close:
        li   a7, 57           # close the folder
        mv   a0, s0
        ecall
done:
        li   a7, 10
        ecall
```

### Folders from C

C programs use the same services through the C library: `mkdir` and `stat` in `<sys/stat.h>`, `unlink` and `rmdir` in `<unistd.h>`, `rename` and `remove` in `<stdio.h>`, and `opendir`, `readdir` and `closedir` in `<dirent.h>`. On a failure they return -1 and set `errno` to the error number, such as `EEXIST` or `ENOTEMPTY`. This program makes a folder the first time it runs, and lists it every time:

```c
#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <sys/stat.h>

int main(void) {
    /* The second time the program runs, the folder is there already: not a failure. */
    if (mkdir("notes", 0777) != 0 && errno != EEXIST) {
        perror("mkdir notes");
        return 1;
    }
    /* A folder stays in the Project only while a file is inside it. */
    FILE *keep = fopen("notes/.keep", "w");
    if (keep) fclose(keep);

    DIR *dir = opendir("notes");
    if (!dir) {
        perror("opendir notes");
        return 1;
    }
    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL)
        printf("%s%s\n", entry->d_name, entry->d_type == DT_DIR ? "/" : "");
    closedir(dir);
    return 0;
}
```

The `<sim.h>` functions `sim_mkdir`, `sim_getdents` and the rest make the raw services instead and return the negative error number. See the [Runtime library](/documentation/risc-v/runtime-library#folders) for what each C function does.

## Sound {#sound}

Services 31 and 33 play a note with a pitch, instrument, volume, and duration in milliseconds. Service 31 starts the note and continues immediately, so notes started close together can overlap to make a chord. Service 33 waits for the requested duration before the next instruction, which lets a sequence of notes keep time as a melody. Notes finish their duration even if the program exits; **Stop** or a new Build stops them.

For programmable waveforms and sample playback, this editor adds the [Synth](/documentation/risc-v/synth), a sound chip whose registers are memory at `0xffff0100`. RARS does not have it.

Pitch numbers run from 0 to 127. Each increase of 1 moves up a semitone: one piano-key step, counting both white and black keys. For example, 60 is middle C, 62 is D, 64 is E, 67 is G, and 72 is the C one octave above middle C.

General MIDI is a standard list of instrument sounds. These services number instruments from **0** to 127: 0 is acoustic grand piano, 40 is violin, 56 is trumpet, and 73 is flute. No MIDI file or external instrument is needed. Volume runs from 0 (silent) to 127 (loudest).

The editor supplies a General MIDI sound bank, a collection of instrument sounds. The browser loads it automatically when the editor page first plays a note or MIDI file, so that first request waits for loading. The bank is shared across program runs and projects until the page is reloaded.

After a program requests sound, the **Sound** button appears in the execution dock as a mute/unmute control. It sets **Play sound** in **Preferences**, where **Sound volume** is also available. Both settings apply across projects. Muting leaves program-visible timing and results unchanged.

This editor differs from RARS in two ways:

- At most 64 notes sound at once, where RARS has no limit. Starting another stops the oldest.
- Testcases are silent. Service 33 still waits for the requested duration on the testcase's virtual clock, so the wait completes immediately and advances that clock.

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
