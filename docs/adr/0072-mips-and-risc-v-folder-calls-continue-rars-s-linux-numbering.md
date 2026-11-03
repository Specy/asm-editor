---
status: accepted
date: 2026-11-03
---

# MIPS and RISC-V folder calls continue RARS's Linux numbering

MARS's and RARS's file syscalls stop at open, read, write, close and lseek. asmOS's Files app and Terminal, and any C program written against POSIX, also need to list, make, delete and rename. MIPS and RISC-V programs therefore get six more calls ([folder-calls.md](../design/folder-calls.md)):

| Call     | Number |
| -------- | ------ |
| unlink   | 1026   |
| stat     | 1038   |
| mkdir    | 1030   |
| rmdir    | 1031   |
| rename   | 1034   |
| getdents | 1065   |

**These are Linux's numbers.** RARS's own file calls already are Linux's generic numbers (getcwd 17, close 57, lseek 62, read 63, write 64, exit 93), and its Open, 1024, is the `open` of the deprecated block that Linux's generic table carried until the 4.x series. The new calls take that block's numbers for the same calls, as Linux 3.10's `include/uapi/asm-generic/unistd.h` gives them. MIPS takes the same numbers, as the editor's MARS already took RARS's lseek at 62.

**They behave as Linux's:**

- they take paths;
- a folder is listed by opening it and reading `linux_dirent` records with getdents;
- stat fills Linux's `struct stat64` on 32-bit machines and `struct stat` on RV64;
- failure returns minus the error number.

The Runtime library builds `<dirent.h>`, `stat()`, `unlink`, `rmdir`, `mkdir`, `rename` and `remove` on them.

## Considered options

- **Today's Linux generic numbers** (`mkdirat` 34, `unlinkat` 35, `getdents64` 61, `renameat2` 276): truest to current Linux, but 34 and 35 are RARS's PrintIntHex and PrintIntBinary.
- **A block of the editor's own**, after RuntimeSbrk's 1100: free, but numbers no other system uses.
- **MIPS Linux's o32 numbers on MIPS** (4000 and up): MARS has never used Linux's numbers, and it would mean two tables.
- **Simplified calls**, such as "read entry _n_ of this folder": easier from assembly, but an invented interface that C would have to wrap to look like POSIX.
- **-1 for every failure**, as RARS's Open, Read and Write return it: one convention, but no way to tell "not empty" from "not found".

## Consequences

- **Two error conventions sit side by side.** RARS's Open, Read and Write keep -1; the new calls return minus the error number. The Documentation says which is which, and `result < 0` works for both.
- **Folders follow the rules of x86's project mount**: a made folder lasts for the run unless a File ends up inside, `rmdir` takes only empty folders, and a folder cannot be renamed. Persistent folders and folder rename can come later without changing these numbers, calls or errors. The Documentation describes today's behaviour without promising it.
- **The Core owns the semantics** and asks the editor's FileSystem for the transport ([ADR 0035](./0035-environments-match-their-reference.md)), so both Cores need a release.
- **The new Runtime library members are compiled on Compiler Explorer once.** The new error numbers are added per Target, so the shared `errno.h`, and with it every other member, stays as it is.
- **The numbers are now a contract.** Programs will call them directly.
