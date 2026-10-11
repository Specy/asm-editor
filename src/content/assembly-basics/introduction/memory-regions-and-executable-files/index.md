Imagine a small program that prints a greeting and keeps a score. Its instructions, greeting and
score all need addresses. While it runs, it also needs room for temporary work. Looking at its memory
as one long table of bytes hides these different jobs.

A **memory region** is a range of addresses with a particular purpose. A **memory map** describes
which ranges are available and what each is used for. The ranges and their starting addresses depend
on the machine and the environment running the program.

## Sections group the program's contents

An assembly source file can group its contents into **sections**. A section tells the tools building
the program what kind of contents those lines contribute. You have already seen `.text` for
instructions and `.data` for stored values. Two more names are common:

| section   | contents                                                     | example in our program                                  |
| --------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `.text`   | machine instructions                                         | the code that prints the greeting and updates the score |
| `.rodata` | data intended to stay unchanged                              | the greeting text                                       |
| `.data`   | writable data with initial values stored in the program file | a score that starts at 10                               |
| `.bss`    | writable storage that starts filled with zero bytes          | a 4096-byte input buffer                                |

These names are a useful reference; you do not need to memorize them. The greeting, score and buffer
have **static storage**: their space lasts for the program's execution. Their sizes are established
when the program is built. The score can still change;
"static" describes the storage's lifetime.

The difference between `.data` and `.bss` also affects the file saved on disk. A buffer of 4096 zero
bytes in `.bss` needs 4096 bytes when the program runs. The file can record how much space to supply
without storing all 4096 zero bytes. The loading process supplies the zero-filled storage.

The spelling and behavior of section directives depend on the assembler. Some simulators put
`.rodata`, `.data` and `.bss` into one data area. Assemblers for smaller machines often use `org` to
choose an address and then place instructions and data there directly.

## Stack and heap provide working space

The program also needs storage while it runs. Two common ways to organize that storage are the
**stack** and the **heap**.

The stack holds temporary values associated with the work currently in progress, such as saved
register values. A register called the **stack pointer** tracks its current position. As work begins
and ends, the part of the stack in use changes.

The heap supplies blocks of memory requested during execution. For example, a program that learns
the size of an image from its input can request enough room to hold it. When a block is no longer
needed, the program can release it for reuse.

A fixed-size buffer can also be temporary stack storage, so size alone does not make storage static.
Static storage, the stack and the heap all provide ordinary memory that a program reads and writes
through addresses.

Stack and heap space are normally established for execution, separately from the static sections
in the executable. An environment can also give a program a fixed memory area to manage itself.

## A map of the running program

Here is one possible memory map for our example. Each letter stands for a range with a starting and
ending address. The table shows the purposes of those ranges; it does not set their sizes, address
order or the gaps between them.

| address range in this example | contents while the program runs           | how the contents are supplied            |
| ----------------------------- | ----------------------------------------- | ---------------------------------------- |
| A: code                       | instructions from `.text`                 | loaded from the executable               |
| B: unchanged data             | greeting from `.rodata`                   | loaded from the executable               |
| C: writable static data       | score from `.data` and buffer from `.bss` | score starts at 10; buffer starts zeroed |
| D: heap                       | blocks requested during execution         | provided as the program requests space   |
| E: stack                      | temporary values, such as saved registers | stack space is set up for execution      |

Notice that two sections, `.data` and `.bss`, contribute to one writable region in this map. The stack
and heap are also regions, even though their working contents are not supplied by those source
sections.

An operating system usually gives each program a **virtual address space**, its own view of memory
addresses. The operating system controls which memory those addresses reach. A simulator or a
program running directly on a machine can use a different map.

## Some addresses reach devices

A machine can assign an address range to a device. Writing a value to an address in that range
might send a character to a display; reading another might report whether a key is waiting.
This is **memory-mapped input/output**, usually shortened to **MMIO**. The program uses memory read
and write instructions to communicate with the device.

An MMIO address can have side effects. Reading a keyboard's character address can consume the
waiting character, so another read can return a different result. Ordinary memory keeps the stored
value until something writes it.

Device ranges belong to the machine's memory map. An operating system controls access to them, so
an MMIO range is available to a program only when that access has been provided. Our example map
shows ordinary storage; a simulator's map might also include a keyboard or display range.

## From source text to a running program

We have looked at the addresses used during execution. Now we can follow how the program's stored
contents reach those addresses. On a system that builds a separate executable file, the usual route
is:

```text
assembly source → assembler → object file → linker → executable file → loader → memory
```

The **assembler** converts instruction names into machine instructions and lays out declared data.
An **object file** holds that code and data plus information for combining it with other files.
It can still contain references to names whose addresses have not been settled.

For example, `main.s` might contain an instruction that needs the address of `message`, while
`greeting.s` defines `message` and its text. When assembling `main.s` alone, the assembler cannot
give that text its final address. It records where the address of `message` is needed.

The **linker** combines the object files and arranges the resulting program. It finds the definition
of `message` and supplies its address where it is needed.
The **loader** is the part of the operating system or execution environment that makes the
executable's contents available in memory and sets up execution. The **entry point** is the address
where execution begins. Startup instructions there can do preparation before `main` begins.

The editor presents this preparation as **Build**. Its simulators supply their own loading and
startup behavior; a separate executable file is not required by every simulator.

## ELF describes a program in a file

An executable needs to describe where its code and data belong. **ELF**, the **Executable and
Linkable Format**, is one file format used for this, including by Linux systems and many embedded
toolchains. ELF can describe both object files and executable files.

An ELF **header** is a record at the beginning of the file. Each piece of information in the record
is stored in a **field**. The header identifies the target processor, the byte order, the file's role
and whether it uses the 32-bit or 64-bit ELF format. For a runnable program, it also records the entry
address. An address field occupies 4 bytes in 32-bit ELF and 8 bytes in 64-bit ELF.

ELF has two useful views of the contents. **Sections** group contents for building and inspecting
the program. **Loadable segments** describe ranges the loader prepares in memory: which bytes to
take from the file, how much space to provide, and the read, write and execute permissions.

For our example, one loadable segment could contain both `.data` and `.bss`. The loader would use
it to prepare region C in the map: load the score's initial value and supply the zero-filled buffer.
Separate segments could provide the instructions in A and the greeting in B. Stack and heap space
are additional runtime regions set up by the execution environment.

Permissions are enforced by the execution environment. Naming a source section `.rodata` expresses
its purpose; the loader and machine must provide the protection that prevents a write.

A position inside a file is a **file offset**, counted in bytes from the start of that file. It is a
different coordinate from a memory address. For example, instructions at file offset `0x1000` could
be loaded at memory address `0x00400000`. In the same way, the space reserved for `.bss` appears in
memory even though the file does not hold a corresponding block of zero bytes. The segment's
description accounts for that extra space.

<details>
<summary>Other executable formats</summary>

Other systems use other containers: [PE on Windows](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)
and [Mach-O on macOS](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/CodeFootprint/Articles/MachOOverview.html)
serve similar roles. A **raw binary** is simply a sequence of bytes; its loading address and entry
point must be supplied separately.

</details>

The [ELF specification](https://gabi.xinuos.com/elf/01-intro.html) documents the file's structure if
you want to inspect the format in more detail.

## Check your understanding

1. A program has instructions, an unchanged greeting, a writable score initially set to 10, and a
   4096-byte buffer that starts zeroed. Which conventional section fits each?
2. Does reserving that buffer in `.bss` add 4096 zero bytes to the executable file? Does it need space
   when the program runs?
3. Why can reading an MMIO keyboard address twice behave differently from reading the score twice?
4. Instructions occur at file offset `0x1000`. Can you use that alone to find their address in the
   running program?
5. In our example map, region C contains the score and the buffer. Which sections contribute to it?
   Could one ELF loadable segment prepare both? Is the stack in region E another source section?

<details>
<summary>Show answers</summary>

1. `.text`, `.rodata`, `.data` and `.bss`, respectively.
2. The file records the reservation without storing the buffer's zero bytes. The running program
   still needs 4096 bytes of zero-filled storage.
3. Reading the keyboard address can consume a character from the device. Reading the score retrieves
   the stored value, which stays the same until something changes it.
4. You need the loading information too. A file offset describes a position in the file, while the
   loader determines where those instructions appear in memory.
5. `.data` contributes the score and `.bss` contributes the buffer. One loadable segment can prepare
   both as writable storage. Region E is stack space established for execution, rather than contents
   supplied by another source section.

</details>
