A Z80 program's instructions and data share the same `0x0000`–`0xFFFF` address space. You can still
organize those bytes by their jobs: instructions to execute, values to read or change, and room for
working data.

A **memory region** is a range of addresses with a particular purpose. A **memory map** describes
those ranges. It helps you find the score, check the buffer's size and identify addresses to leave
alone. The map depends on the machine and program.

## Map a small program

Here is a program with code at `0x8000` and data at `0x9000`. It stores a greeting, reads a score and
keeps the addresses of the greeting and a buffer in register pairs.

```z80|playground|memory
    .org 0x8000
    ld hl, greeting    ; address of the greeting
    ld de, buffer      ; address of the working space
    ld a, (score)      ; read the score's value
    halt

    .org 0x9000
greeting: .db "Hi", 0
score:    .db 10
buffer:   .ds 16
```

Build and Run. `hl` holds `9000`, `de` holds `9004`, and `a` holds `0A`, which is 10 in decimal. Enter
`9000` in the memory panel: the first four bytes are `48 69 00 0A`. The greeting is stored here;
these instructions do not display it.

| Addresses, including both ends | Purpose                       | What supplies the bytes                            |
| ------------------------------ | ----------------------------- | -------------------------------------------------- |
| `0x8000`–`0x8009`              | Code: the four instructions   | The assembler produces ten instruction bytes       |
| `0x9000`–`0x9002`              | Greeting: `H`, `i`, then zero | `.db "Hi", 0` writes three bytes                   |
| `0x9003`                       | Score                         | `.db 10` writes one byte                           |
| `0x9004`–`0x9013`              | Buffer: room for 16 bytes     | `.ds 16` reserves addresses without writing values |

This table lists our program's ranges, rather than all 64 KB. The gap between code and data has no
assigned purpose here. `.org` chooses the next address; it does not create a barrier around a region.

Calling a region “code” or “unchanged data” describes our intention. In the editor's ordinary RAM,
those names provide no write protection. A mistaken write can damage instructions or the greeting,
just as it can change the score. A buffer's label does not stop a write past its last byte either.

## Reserved space and storage lifetime

The greeting, score and buffer have **static storage**: their space lasts throughout this program's
execution. “Static” describes that lifetime. The score can change, and the buffer can hold temporary
results, without changing the lifetime of their storage.

On a fresh build, the buffer appears as sixteen `00` bytes because fresh simulated memory starts
cleared. `.ds 16` itself writes nothing. It does not guarantee initial zeroes on another machine or
when memory already contains values. If the program needs a known starting value, arrange to write
it. For example, changing the declaration to `.ds 16, 0` explicitly fills all sixteen bytes with
zeroes during assembly.

The **stack** holds temporary values for work currently in progress, such as saved register
contents. Its occupied space changes as work begins and ends. A **heap** supplies blocks requested
while a program runs; a program can release a block when it no longer needs it.

The **stack pointer** is the register that tracks the stack's current position. The editor initially
sets it to `0xFFFF`. This is a starting position, not a
protected boundary around a stack region. The editor provides no heap allocator or dedicated heap region.
Our example needs neither kind of working storage: its fixed buffer is enough.

## Which addresses reach devices?

Some machines assign memory addresses to devices. A write might change a display; a read might
report a key. This is **memory-mapped input/output**, or **MMIO**. The address reaches device behavior
rather than an ordinary stored byte, so a read or write can have additional effects.

The editor's default Z80 peripheral interface uses **ports**, a separate way to address devices.
The ranges in our example are ordinary memory. An optional TRS-80 screen mode adds a memory-mapped
keyboard at `0x3800`–`0x3BFF` and display at `0x3C00`–`0x3FFF`. Those device ranges apply only when
that mode is enabled. Its keyboard reports held keys; reading it does not consume a character.
The Z80's address range alone does not tell you which addresses reach RAM or devices.

## Sections in other toolchains

Some assemblers group a program's contents into **sections** before choosing their final addresses.
These conventional names describe the kinds of contents contributed by the source:

| Section   | Usual purpose                                                                   |
| --------- | ------------------------------------------------------------------------------- |
| `.text`   | Machine instructions                                                            |
| `.rodata` | Data intended to remain unchanged                                               |
| `.data`   | Writable data with stored initial values                                        |
| `.bss`    | Writable storage described by its size rather than a block of stored data bytes |

Our instructions, greeting, score and buffer have those respective roles. In this editor's Z80
programs, use `.org`, `.db`, `.dw` and `.ds` to place them. Section names are background for other
toolchains. In particular, `.bss` and `.ds` are not interchangeable promises about initialization.

## From source to memory

Here, **Build** assembles the Z80 source directly into the simulator's 64 KB memory map. This workflow
does not build or import an ELF executable. Other environments commonly use more steps:

```text
source → assembler → object files → linker → executable file → loader → memory
```

An **object file** holds assembled code and data plus information needed to combine it with other
files. A **linker** combines those files, chooses the layout and resolves references between them.
For example, code in one file may use a greeting defined in another. The linker supplies the
greeting's final address.

An **executable file** packages a program for loading. The **loader** places its contents in memory
and prepares execution. The **entry point** is the address where execution begins.

A **file offset** is a byte's position counted from the start of a file. It is a different coordinate
from a memory address. Suppose a file's bytes are loaded consecutively starting at `0x8000`.
The byte at file offset `0x0010` then reaches memory address `0x8010`. Without the loading address
or other layout information, the offset alone cannot tell you the memory address.

<details>
<summary>Optional: executable formats and ELF</summary>

**ELF**, the Executable and Linkable Format, can describe object files and executables.

ELF sections group contents for building the program. **Loadable segments** describe ranges for the
loader to prepare in memory. A segment can group several sections: one writable segment might
contain both the score from `.data` and space for a buffer from `.bss`.

In this ELF loading environment, `.bss` space is supplied filled with zeroes, without storing all
those zero bytes in the file. That loading rule explains its initialization; reserving addresses
with our Z80 `.ds 16` does not invoke it.

PE and Mach-O serve similar roles on Windows and macOS. A **raw binary** holds just a sequence of
bytes; the loading address and entry point must be supplied separately.

</details>

## Check your understanding

1. At which addresses do the score and buffer begin? What is the buffer's last address?
2. Why does `ld de, buffer` give `de` the value `9004`, while `ld a, (score)` gives `a` the value `0A`?
3. Does `.ds 16` write sixteen zeroes? How can you request that explicitly?
4. Does calling the greeting unchanged data prevent a Z80 instruction from writing over it here?
5. A byte is at file offset `0x0010`. What else do you need to find its address in memory?

<details>
<summary>Show answers</summary>

1. The score begins at `0x9003`; the buffer begins at `0x9004` and ends at `0x9013`, including both
   ends.
2. Without parentheses, `buffer` supplies its address. With parentheses, `(score)` reads the byte at
   the score's address. That byte is 10 in decimal, or `0A` in hexadecimal.
3. No. Fresh simulator memory happens to start cleared. Use `.ds 16, 0` to fill the reserved space
   explicitly with zeroes.
4. No. The name describes its intended use; it does not protect this ordinary RAM from writes.
5. You need the loading layout. For consecutive bytes loaded starting at `0x8000`, that offset maps
   to `0x8010`. A different loading address or layout can give a different result.

</details>
