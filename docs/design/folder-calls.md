# Folder calls

Status: decided with the owner on 2026-11-03; implemented the same day, uncommitted, on branch `feat/asmos-stage1` (worktree `.cache/wt/stage1`: the editor, with the Runtime library) and on the Cores' `feat/stage1` (`.cache/wt/stage1-{mips,risc-v}`, and `.cache/wt/stage1-x86` for decision 6), together with the [Input controller](./input-controller.md) and the linking of several units. The model is [ADR 0072](../adr/0072-mips-and-risc-v-folder-calls-continue-rars-s-linux-numbering.md). This is decision 8 of [asmOS portability](./asmos-portability.md): MIPS and RISC-V programs can list, make, delete and rename folders and files, so that asmOS's Files app and Terminal work fully there. MARS and RARS have no such calls. Their file syscalls stop at open, read, write, close and lseek.

## Decisions

1. **Numbers: the rest of the block RARS's Open came from, on both MIPS and RISC-V.**

    RARS's file syscalls are Linux's generic numbers: getcwd 17, close 57, lseek 62, read 63, write 64, exit 93. Its Open is 1024, the `open` of the deprecated block that Linux's `asm-generic/unistd.h` carried until about 4.x. The new calls continue that block, at the numbers Linux 3.10's header gives (`include/uapi/asm-generic/unistd.h`):

    | Call     | Number |
    | -------- | ------ |
    | unlink   | 1026   |
    | mkdir    | 1030   |
    | rmdir    | 1031   |
    | rename   | 1034   |
    | getdents | 1065   |

    MIPS takes the same numbers, as the editor's MARS already took RARS's lseek at 62, which stock MARS never had. C programs never see the numbers; `<sim.h>` names them.

    Rejected:
    - **Today's Linux generic numbers** (`mkdirat` 34, `unlinkat` 35, `getdents64` 61, `renameat2` 276): 34 and 35 are RARS's PrintIntHex and PrintIntBinary.
    - **A new block of the editor's own** beside RuntimeSbrk's 1100: free, but numbers nobody else uses.
    - **MIPS Linux's own o32 numbers on MIPS** (unlink 4010, mkdir 4039, …): MARS has never used Linux's numbers for anything, and it would mean two tables.

2. **Linux-shaped calls, and POSIX functions in the Runtime library.**
    - **By path:** `unlink(path)`, `mkdir(path)`, `rmdir(path)` and `rename(from, to)`.
    - **Listing** follows Linux's pattern: Open a folder for reading, then `getdents(fd, buffer, size)` fills `linux_dirent` records (inode, offset, record length, name, and the type in the record's last byte). It returns the bytes written, or 0 at the end.
    - **The MIPS/RISC-V Runtime library gains** `<dirent.h>` (`opendir`, `readdir`, `closedir`), plus `unlink`, `rmdir`, `mkdir`, `rename` and `remove` in their usual headers. asmOS's file code then compiles unchanged on all three Targets, and C programs written against POSIX run as they are.
    - **`<sim.h>`** wraps the raw calls (`sim_unlink`, `sim_getdents`, …) for programs that want them.
    - **The Documentation** shows assembly walking the records.
    - **Folder changes are undoable** as file writes already are on these Targets: the FileSystem session journals them on the instruction serial.

    Rejected: simplified calls of the editor's own, such as "read entry _n_ of this folder". Easier from assembly, but an invented interface that C would still have to wrap to look like POSIX.

3. **Failure returns minus the error number**, Linux's way, for the new calls only: -2 not found, -17 already exists, -20 not a folder, -21 is a folder, -39 folder not empty. A program can tell the reasons apart, and the Runtime library sets `errno` from the result. RARS's own Open, Read and Write keep returning -1, and the Documentation says which convention each call follows; a `result < 0` check works for both. The new error numbers go in per Target, as x86's were added, because a change to the shared `errno.h` would resend every Runtime library member to Compiler Explorer. The new Runtime members themselves are compiled there once.

    Rejected: -1 for every failure, as RARS's file calls do. One convention, but `errno` could only ever be a generic error.

4. **A folder is what x86's project mount makes it**, on every Target alike:
    - **A folder `mkdir` makes lasts for the run.** It stays in the Project only if a File ends up inside it, which is why asmOS writes a hidden `.keep`.
    - **`rmdir` removes only an empty folder.**
    - **Renaming a folder fails** with -21; renaming Files works.
    - **Listings include `.` and `..`**, as Linux's do. Inode numbers are made up but stable for the run.

    The Documentation presents this as how folders behave today, not as a promise that they vanish, because a later change may keep them.

    Rejected for now:
    - **Folder rename** that moves every File under the folder;
    - **Real, persistent empty folders in the Project.**

    Both stay possible later without touching this contract: numbers, calls and errors stay as they are. The Project record gains folders additively, through the existing upgrade path, and x86's mount takes its folders from the Project in the same change. The only difference a program could see is that a folder made in one run still exists in the next, so the Documentation's example handles "already exists", as a program on Linux must.

5. **stat at 1038**, the same block's `stat`. On MIPS and RV32 it is `stat64` with Linux's `struct stat64`; on RV64 it is `newstat` with `struct stat`. Only the type, size, inode and link count mean anything; times and owners read 0. The Runtime library gains `stat()` and `<sys/stat.h>`'s `S_ISDIR` and friends, so asmOS's file code, stat included, is shared by every Target.

    Rejected:
    - **No stat**, with sizes from Open plus lseek and kinds from getdents: asmOS would need a MIPS/RISC-V file platform, and POSIX programs that call `stat` would not build.
    - **`lstat` and `fstat` as well:** the Project has no links, and nothing asks for `fstat` yet.

6. **A rename onto an existing File replaces it, on every Target, as Linux's rename(2) does** (the owner, 2026-11-03, after the first implementation refused it with -17 as x86's mount then did). It holds for MIPS and RISC-V's rename (1034), for x86's `rename`, `renameat` and `renameat2` without flags under `/project`, and for the Runtime library's `rename()` on all three, because each goes through the FileSystem session's `rename`.
    - **The File at the new path is replaced in the same operation**, journaled on the instruction serial, so Undo puts back both the moved File and the replaced one. On x86 a File call is an Undo barrier, as every File call there already is.
    - **A descriptor open on the replaced File keeps it**, as one open on a deleted File already does: it reads and writes the bytes the File had, which no path names any more, and they never reach the Project. x86 reports its link count as 0.
    - **Onto a folder** fails with -21, **into a folder that does not exist** with -2, and **a folder still cannot be renamed** (-21, decision 4), except that **a folder onto a File** is -20, as Linux and x86 give it.
    - **Onto itself** it does nothing and returns 0, for a File and, as on Linux and x86, for a folder.
    - **The running program's own File**, x86's Build output, can still be neither renamed nor replaced (-16, EBUSY), unlike Linux, which guards a running program's File only from writes ([ADR 0056](../adr/0056-a-build-saves-the-program-it-links-as-a-file.md)).
    - **x86's `RENAME_NOREPLACE`** still refuses an existing destination with -17.

    Rejected: keeping -17. A program written for Linux that saves a File by writing a temporary one and renaming it over the old one would fail, and the Runtime library's `rename()` would differ from every C library's.

## What follows without a decision

- **The Core owns the semantics, the editor the transport** ([ADR 0035](../adr/0035-environments-match-their-reference.md)). Each call is a new syscall in the MARS and RARS Cores, which ask the editor's FileSystem session through the JavaScript API, as Open, Read and Write already do.
- **Paths** resolve against the Project root by the rule the existing file calls use.
- **An Open of a folder for reading** gives a descriptor that getdents reads. Read on it fails, with -1 as RARS's Read does. Opening a folder for writing fails.
- **The rest follows Linux:** renaming onto an existing File replaces it (decision 6; the first implementation refused it with -17, as x86's mount did, until the owner decided), and the destination's folder must exist (-2). unlink of a folder gives -21, rmdir of a File -20, mkdir of an existing path -17.
- **`linux_dirent`'s fields are `unsigned long`**, so 4 bytes on MIPS and RV32 and 8 on RV64, as Linux lays them out. `d_type` uses Linux's values (4 folder, 8 File).
- **Testcases** treat these calls as they treat file writes today.
- **What it touches:**
    - the MARS and RARS Cores (new syscall classes and the JavaScript API);
    - the adapters' handlers (`marsHandlers.ts`) and the FileSystem session;
    - the Runtime library: `<dirent.h>`, `<sys/stat.h>`, the `<unistd.h>` and `<stdio.h>` additions, per-Target error numbers;
    - `<sim.h>`, the syscall Documentation tables, and the coding agent's prompt.

## Implementation notes (2026-11-03)

- **Both Cores need a major release**, because the six handlers are required in the JavaScript API. stat and getdents answer `[result, bytes]`. An IO error is -5. A negative getdents size is -22, answered without asking the host, and the host is asked for at most 65,536 bytes.
- **The FileSystem session** gains `mkdir`, `rmdir`, `unlink`, `move`, `inspect`, `openDirectory` and `readDirectory`:
    - **Folder descriptors** share numbering with file descriptors.
    - **Inodes:** a File's follows it across renames, a folder's follows its path, and the root is 1.
    - **Listings** are taken when the folder is opened. lseek on a folder takes SEEK_SET and SEEK_CUR, counted in entries.
    - **Made folders** are capped at 4,096 (-28).
    - **Paths:** an empty path is -2, `//` collapses, and a trailing slash means "must be a folder".
- **stat** gives the type bits with 0777 and a link count of 1. Every other field is 0, where x86 gives dev 1 and blksize 4096.
- **The Runtime library's POSIX members** live in `packages/runtime/posix/`. They are built for MIPS and RISC-V only, and Compiles upload their headers first. `build.mjs` now reuses every member whose inputs are unchanged since the committed library, so the change sent only the 27 new requests (9 members × 3 Targets) to Compiler Explorer.
- **Settled in a second Runtime library rebuild** (2026-11-03), which sent 17 requests:
    - The POSIX functions are ABI-pinned: exported on MIPS and RISC-V, with signatures, and `abi/posix-layout.c` pins `struct dirent`, `struct stat`, the `DT_` and `S_IF` values and `ENOTEMPTY`. `functions.json` lists them with the Targets they exist on, so they are in each Target's function reference and nowhere else.
    - `strerror(39)` is "Directory not empty", and `strerror(18)` (x86's EXDEV) "Invalid cross-device link". Every other error the folder calls return already had its message.
    - `build.mjs` reuses a member whenever its source and the headers it includes read the same as in the committed assets, so this rebuild compiled only `strerror`, `rename` and `remove`, plus the probes.
    - The posix `<stdio.h>` says that rename replaces a file.
- **The corpus** uploads only the headers each program includes, so a header change asks again only about the programs that read it. Its answers from before were moved to the new requests where a program's headers are unchanged. The GCC run passes 526 of 614 from the cache; the other 88, the 11 programs that include `<errno.h>` or `<new>` (both changed on 2026-10-21 and 2026-10-31, after the cache was last filled), need Compiler Explorer. With Clang 201 of 462 pass from the cache; the 261 others are those 11 programs and every `-O0` compile, whose Clang flags changed on 2026-10-21.
