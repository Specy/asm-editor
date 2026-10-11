A program's instructions, greeting and score all occupy bytes with different jobs. Instructions
need to be executable. The greeting can stay unchanged, while the score needs writable storage.
A buffer needs room before it holds any input.

A **memory region** is a range of addresses with a particular purpose. A **memory map** describes
the available ranges and their uses. For a running x86 program, the map includes both contents from
the executable file and working space supplied for execution.

## Sections describe the program's contents

In NASM source, sections group instructions and data for the tools that build the program:

| section   | contents                          | example                      |
| --------- | --------------------------------- | ---------------------------- |
| `.text`   | machine instructions              | the instructions at `_start` |
| `.rodata` | data intended to stay unchanged   | a greeting                   |
| `.data`   | writable data with initial values | a score starting at 10       |
| `.bss`    | writable, zero-filled storage     | a 16-byte buffer             |

Build and run this program, then inspect the three data addresses it keeps in registers:

```x86|playground|memory|no-flags
default rel
global _start

section .rodata
greeting: db "Hi", 0

section .data
score:    dq 10

section .bss
buffer:   resb 16

section .text
_start:
    lea r12, [rel greeting]
    lea r13, [rel score]
    lea r14, [rel buffer]
    mov r15, [score]

    mov rax, 60
    mov rdi, 0
    syscall
```

The `lea` instructions calculate addresses without reading the stored bytes. `r12` holds the address
of `greeting`, `r13` the address of `score`, and `r14` the address of `buffer`. The `mov` reads eight
bytes at `score`, so `r15` holds 10. The exit template leaves these registers available for inspection.

Use the address in each register to locate its bytes in the memory panel:

| address held in | bytes at increasing addresses | meaning                         |
| --------------- | ----------------------------- | ------------------------------- |
| `r12`           | `48 69 00`                    | `H`, `i`, and a zero terminator |
| `r13`           | `0A 00 00 00 00 00 00 00`     | the qword value 10              |
| `r14`           | sixteen `00` bytes            | the reserved buffer             |

The score's lowest byte comes first because x86 is little endian. Use these register-held addresses
for inspection: changing the sections or their sizes can change where the linker places them.

The greeting, score and buffer have **static storage**. Their space lasts for the program's
execution, and their sizes are established when it is built. The score can change; “static”
describes the storage's lifetime.

The executable stores the greeting's bytes and the score's initial bytes. For `.bss`, it records how
much space to supply without carrying a payload of zero bytes. The loader supplies the buffer's
sixteen zero-filled bytes in memory.

## Working space and the running memory map

The **stack** holds temporary values, such as saved registers. The stack pointer, `rsp` on x86-64,
tracks its current position as work begins and ends.

The **heap** provides storage requested during execution. A program can request room for an image
whose size it learns from input, then release the storage when finished. Storage size alone does not
decide its category: a fixed-size buffer can also occupy the stack.

Here is a possible map of a running program. The letters name ranges, not specific addresses; the
table does not prescribe their order, sizes or gaps.

| range                      | contents                             | supplied by                         |
| -------------------------- | ------------------------------------ | ----------------------------------- |
| A: code                    | instructions from `.text`            | the executable                      |
| B: unchanged data          | greeting from `.rodata`              | the executable                      |
| C: writable static storage | score and buffer                     | initial bytes and zero-filled space |
| D: heap                    | storage requested while running      | the execution environment           |
| E: stack                   | temporary values and saved registers | the execution environment           |

Two source sections, `.data` and `.bss`, contribute to region C. Stack and heap are runtime regions,
even though their working contents do not come from those source sections.

The Linux environment used for this course gives the program a **virtual address space**: its own
view of memory addresses. The execution environment controls which storage those addresses reach
and whether a range may be read, written or executed.

## Some addresses reach devices

A machine can assign an address range to a device. A write might send a character to a display;
a read might report a waiting key. This is **memory-mapped input/output**, or **MMIO**: memory
instructions communicate with a device through its assigned addresses.

Device reads can have side effects. Reading a keyboard's character address might consume the
waiting character, so a second read could produce a different result. Reading ordinary storage,
such as `score`, leaves its value in place.

The operating system controls access to device ranges. This x86 playground runs a Linux user
program without a keyboard or display MMIO range.

## Build turns source into an executable

For x86, the editor's **Build** action follows this route:

```text
assembly source → assembler → object file → linker → executable file → loader → memory
```

NASM, the **assembler**, converts instructions into machine-code bytes and records declared data and
reservations in an **object file**. It also records labels and references that still need final addresses.

The **linker** arranges the program's sections and resolves those references. For example, the
instructions that address `score` must refer to wherever the linker places its bytes. The linker
produces an executable file that describes the resulting program.

The **loader** makes that executable available in memory and sets up execution. The **entry point**
is the address where execution begins. In this program, that address is labelled `_start`;
`global _start` exposes the label to the linker.

Some simulators assemble directly into simulated memory. This x86 environment builds and loads
an executable file before the program can run.

## ELF connects the file to memory

**ELF**, the **Executable and Linkable Format**, is the format used for this course's x86 object
files and executables. Its header identifies the processor, byte order and file type, and records
the executable's entry address.

ELF describes contents in two ways. **Sections** organize code and data for building and inspecting
the program. **Loadable segments** tell the loader which file bytes to use, where they belong in
memory, how much memory to provide, and which read, write and execute permissions to apply.

One loadable segment can include both `.data` and `.bss`. It supplies region C with the score's
initial value and the buffer's zero-filled space. Other segments can supply the instructions and
greeting. A segment need not correspond to exactly one section.

The section name `.rodata` expresses an intention to keep data unchanged. The linked segment's
permissions and the execution environment provide the protection that prevents a write.

A **file offset** counts bytes from the start of the file. A **virtual address** identifies a position
in the running program's address space. An instruction's file offset alone cannot give its virtual
address; the loading information connects them. The `.bss` buffer occupies memory without a
corresponding payload of zero bytes in the file.

<details>
<summary>Other executable formats</summary>

PE on Windows and Mach-O on macOS serve similar roles. A raw binary contains only bytes, with its
loading address and entry point supplied separately.

The [ELF specification](https://gabi.xinuos.com/elf/01-intro.html) documents ELF in detail.

</details>

## Check your understanding

1. Which sections contain this program's instructions, greeting, score and buffer?
2. What is the difference between the values in `r13` and `r15` after execution? Why do the score's
   bytes start with `0A`?
3. Does `resb 16` add sixteen zero bytes as a payload to the executable? What space does it require
   when the program runs?
4. Could one loadable segment prepare both the score and buffer? Does that make the stack another
   source section? Can a file offset alone tell you a running address?
5. Why might reading a mapped keyboard address twice give different results, while reading an
   unchanged score twice gives the same value?

<details>
<summary>Show answers</summary>

1. `.text`, `.rodata`, `.data` and `.bss`, respectively.
2. `r13` holds the address of `score`; `r15` holds the value 10 read there. Ten is hexadecimal `0A`,
   and little-endian order puts that lowest byte first, followed by seven zero bytes.
3. No. The file records the space requirement rather than a payload of sixteen zero bytes. The
   running program needs sixteen bytes of zero-filled memory for the buffer.
4. Yes, one loadable segment can include `.data` and `.bss`. The stack is a runtime region supplied
   for execution. A file offset needs loading information to connect it to a virtual address.
5. A device read can consume a waiting character or otherwise change device state. Reading ordinary
   storage leaves the value in place until something writes it.

</details>
