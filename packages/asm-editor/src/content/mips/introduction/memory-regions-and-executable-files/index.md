A greeting, a score and a buffer can all live in your MIPS program's `.data` area. Its instructions
live in `.text`. Those areas are part of a larger **memory map**: a description of which address
ranges are available and what each is used for. A range with a particular purpose is a **memory
region**.

## Sections group the program's contents

A **section** groups source contents for the assembler. You already use `.text` for instructions
and `.data` for declared data. Keep using those directives here:

```mips|playground|memory
.data
greeting: .asciiz "Hi"
          .align 2
score:    .word 10
buffer:   .space 16

.text
main:
    la $t0, greeting
    la $t1, score
    la $t2, buffer
    li $v0, 10
    syscall
```

`.asciiz` places the two characters and a final zero byte. `.align 2` moves the next declaration to
a multiple of four, and `.word` places the four-byte score. `.space 16` reserves sixteen bytes,
which initially read as zero here. Each label names its declaration's first address.

Build the example and inspect memory at `0x10010000`. Then Run it to see the addresses in registers:

| contents   | first address | size     | register after Run |
| ---------- | ------------- | -------- | ------------------ |
| `greeting` | `0x10010000`  | 3 bytes  | `$t0`              |
| padding    | `0x10010003`  | 1 byte   |                    |
| `score`    | `0x10010004`  | 4 bytes  | `$t1`              |
| `buffer`   | `0x10010008`  | 16 bytes | `$t2`              |

`la` puts a label's address into a register; it does not read the data there. `li` puts a number
into a register. The final `li $v0, 10` and `syscall` are the familiar finish sequence. This program
shows addresses without printing the greeting or changing the score.

The declarations have **static storage**: their space lasts for the program's execution, and their
sizes are established at Build. The score can still change; static describes storage's lifetime.

File-producing toolchains commonly distinguish four sections:

| section   | purpose                                       | example               |
| --------- | --------------------------------------------- | --------------------- |
| `.text`   | machine instructions                          | the `la` instructions |
| `.rodata` | data intended to stay unchanged               | the greeting          |
| `.data`   | writable data with stored initial values      | the score             |
| `.bss`    | writable storage that starts filled with zero | the buffer            |

You do not need to move your greeting or buffer out of `.data` in this Playground. Here,
`.section .rodata` selects the named section, and `.bss` selects zero-filled storage, but both join
the same writable data area as `.data`. The simulator also accepts `.rdata` for the read-only-data
name. Naming a section `.rodata` does not provide write protection here.

## Stack and heap provide working space

Programs also need storage whose use changes while they run. The **stack** holds temporary values
associated with work in progress, such as saved register values. The **stack pointer**, the MIPS
register `$sp`, tracks its current position. The simulator sets its initial value before execution.

The **heap** supplies space requested during execution, for example when an input determines an
image's size. This simulator's heap service moves the **heap break**, the boundary of the space
supplied so far, towards higher addresses. It does not provide a general operation to free an
individual block for reuse.

The stack and heap are runtime regions. Their working contents do not come from this example's
declarations. Our fixed buffer remains static storage even if we use it for temporary work.

## A map of this Playground

Ordinary MIPS assembly programs here use these default locations. The table gives starting points
and one initial register value, rather than the full extent of each region:

| location     | role                           | connection to the example               |
| ------------ | ------------------------------ | --------------------------------------- |
| `0x00400000` | start of `.text`               | the first assembled instruction         |
| `0x10010000` | start of declared data         | greeting, score and buffer              |
| `0x10040000` | start of heap space            | available for requests during execution |
| `0x7FFFEFFC` | initial value of `$sp`         | stack pointer set up by the simulator   |
| `0xFFFF0000` | start of keyboard/console MMIO | device registers                        |

The instructions and data occupy separate regions, so the processor does not execute the
greeting's bytes as instructions. Several source sections can contribute to one region: here,
`.data`, `.section .rodata` and `.bss` all use the data area.

These addresses describe this simulator's layout. A MIPS program under an operating system can
have a different map, often in a **virtual address space**: the program's own view of addresses,
with the operating system controlling which memory they reach.

## Some addresses reach devices

**Memory-mapped input/output**, or **MMIO**, gives devices addresses that programs access through
memory instructions. This Playground's keyboard and console output registers begin at `0xFFFF0000`.
Reading the keyboard's character register can consume the waiting character. A subsequent read
may therefore see another character. Reading the score retrieves its stored value until something
writes a new one.

The bitmap display has another arrangement: its pixel values occupy a configured range of ordinary
simulator memory, called a **framebuffer**. The Screen shows those values as a picture. That range
can overlap declared data or heap, so its location matters when arranging storage. A picture does
not automatically have a separate, protected memory region.

## What Build does, and what an executable changes

For the assembly example above, **Build assembles directly into the simulator**. It resolves labels,
places declared data and supplies machine instructions for execution. It does not produce
intermediate object files or import an ELF executable.

The **entry point** is the address where execution starts. Here `main` labels the first instruction
in `.text`, so execution begins at `0x00400000`. As you have seen, `.globl main` selects a global
`main` as the starting point when it occurs later in `.text`. Otherwise an ordinary program starts
at the beginning of its text area. No startup instructions are inserted before this example.

A toolchain that creates a separate executable often follows this route:

```text
assembly source → assembler → object file → linker → executable file → loader → memory
```

The **assembler** converts instructions and lays out data. Its **object file** can still hold
unresolved references: one file may use `greeting` while another defines it. The **linker** combines
object files, arranges their contents and settles those addresses. The **loader** prepares memory
from the executable and starts execution at its entry point. In that environment, startup code can
run before `main`; that is separate from the Playground behavior above.

## ELF describes a program in a file

**ELF**, the **Executable and Linkable Format**, can hold object files and executables. Its header
identifies the target and file format; an executable also records its entry address. ELF provides
two views: sections group contents for building and inspecting, while **loadable segments** tell
the loader which file bytes to use, where to put them, how much memory to supply and which
permissions to request. See the [ELF format overview](https://gabi.xinuos.com/elf/01-intro.html).

Imagine our greeting, score and buffer built by such a toolchain. The greeting could be in
`.rodata`, the score in `.data` and the buffer in `.bss`. One writable loadable segment could
prepare both the score and buffer. Other segments could supply the instructions and greeting.
The stack and heap would still be additional runtime regions.

A sixteen-byte `.bss` buffer needs sixteen bytes of memory, but no corresponding block of sixteen
zero bytes in the file. Its size is recorded; the loading process supplies the zero-filled space.
An ELF segment can have a larger memory size than file size to account for this. The same principle
applies to a 4096-byte buffer. The [ELF sections specification](https://gabi.xinuos.com/elf/03-sheader.html)
describes storage that occupies no file bytes.

A **file offset** is a position counted in bytes from the file's beginning. It differs from a memory
address: instructions at file offset `0x1000` might be loaded at memory address `0x00400000`. The
segment describes that relationship; the offset alone does not determine the address. The
[ELF loading specification](https://gabi.xinuos.com/elf/07-pheader.html) describes these mappings
and the permissions that the execution environment must enforce.

## Check your understanding

1. After running our Playground example, what addresses are in `$t0`, `$t1` and `$t2`? Are the score
   and buffer in different memory regions?
2. Does Build import an ELF for this example? How can a global `main` later in `.text` become the
   Playground's entry point?
3. In a separate ELF executable, could one loadable segment prepare a score from `.data` and a
   buffer from `.bss`? Does a 4096-byte `.bss` buffer need 4096 zero bytes in the file?
4. Can file offset `0x1000` alone tell you the instruction's memory address?
5. Why can two reads of a keyboard character register behave differently from two reads of `score`?

<details>
<summary>Show answers</summary>

1. `$t0` contains `0x10010000`, `$t1` contains `0x10010004` and `$t2` contains `0x10010008`. The
   score and buffer share the data region.
2. Build assembles directly into simulator memory. `.globl main` selects the global `main` as the
   entry point; this example already has `main` at the beginning of `.text`.
3. Yes. The segment can supply the score's stored bytes and additional zero-filled memory for the
   buffer. The buffer needs 4096 bytes when running, without a 4096-byte block of zeroes in the file.
4. No. You also need the mapping from file contents to memory addresses.
5. Reading the keyboard character register can consume a waiting character. Reading `score` leaves
   its stored value in place.

</details>
