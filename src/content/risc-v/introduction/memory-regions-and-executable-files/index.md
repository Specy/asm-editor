A program's instructions, greeting and score need addresses. A **memory region** is a range of
addresses with a particular purpose; a **memory map** shows where those regions are.

Keep two questions in view: how does the source group its contents, and where do those contents
live when the program runs?

## Sections and regions

An assembly **section** groups contents for the tools building the program. You have used `.text`
for instructions and `.data` for stored values. These two directives select the corresponding
regions here, but several source sections can contribute to one memory region.

Common sections:

| section   | purpose                                     | example                    |
| --------- | ------------------------------------------- | -------------------------- |
| `.text`   | instructions                                | code that finds our values |
| `.rodata` | data intended to stay unchanged             | a greeting                 |
| `.data`   | writable data with chosen initial values    | a score starting at 10     |
| `.bss`    | writable storage initially filled with zero | a 16-byte buffer           |

In this RISC-V editor, `.data`, `.section .rodata` and `.bss` all select the **same writable data
area**. Switching sections continues the data layout. `.section .rodata` does not protect
the greeting against writes. Keeping the greeting and `.space` buffer inside `.data` also works.

These declarations provide **static storage**: space lasting for the program's execution, with
sizes determined during Build. The score can change. “Static” describes storage lifetime.

## Inspect one complete program

`.asciz "Hi"` creates `H`, `i` and a terminating zero byte. `.word 10` creates four bytes;
`.space 16` reserves sixteen zero-filled bytes here. `.align 2` advances to a multiple-of-four
address, adding padding when necessary.

A label names an address. `la` places it in a register; `lw` reads the four-byte value there.
`.globl main` selects `main` as this editor's **entry point**, where execution starts. Without it,
execution starts at the first text instruction. This program stops at the end of its instructions.

Build and run it, then inspect memory at `10010000`:

```riscv|playground|memory
.section .rodata
greeting: .asciz "Hi"

.data
          .align 2
score:    .word 10

.bss
          .align 2
buffer:   .space 16

.text
.globl main
main:
    la t0, greeting
    la t1, score
    lw t2, 0(t1)
    la t3, buffer
```

The resulting data layout:

| contents | address range             | initial bytes      |
| -------- | ------------------------- | ------------------ |
| greeting | `0x10010000`–`0x10010002` | `48 69 00`         |
| padding  | `0x10010003`              | `00`               |
| score    | `0x10010004`–`0x10010007` | `0A 00 00 00`      |
| buffer   | `0x10010008`–`0x10010017` | sixteen zero bytes |

`t0`, `t1` and `t3` hold the greeting, score and buffer addresses. `t2` holds the score's value, 10.
Its bytes use little-endian order.

## The editor's memory map

The data area is one part of the default map. Two other regions provide working storage:

- The **stack** holds temporary values, such as saved register values. The **stack pointer**, `sp`,
  tracks the current stack position. When a calculation finishes, its temporary values can stop
  being needed, allowing that stack space to be reused.
- The **heap** provides space requested while a program runs, for example for an image whose size
  comes from input. The **heap break** marks the end of the heap space currently granted; moving
  that boundary forward makes more space available.

| part of the default map | starting address or initial value | purpose                        |
| ----------------------- | --------------------------------- | ------------------------------ |
| text                    | `0x00400000`                      | assembled instructions         |
| static data             | `0x10010000`                      | greeting, score and buffer     |
| heap                    | `0x10040000`                      | requested working storage      |
| stack                   | initial `sp`: `0x7FFFEFFC`        | temporary working storage      |
| MMIO                    | `0xFFFF0000`                      | keyboard and console registers |

These starting points and initial `sp` belong to the simulator's default map; RISC-V itself does
not prescribe them. Use the table as a reference.

RV64 uses the same displayed locations here, with wider registers. Switching from RV32 to RV64
leaves `.word` at four bytes; `.dword` declares eight bytes. The declaration's size and alignment
determine the data layout.

## Addresses that reach devices

**Memory-mapped input/output**, or **MMIO**, assigns addresses to device registers. Loads and stores
there communicate with a device. Here, keyboard and console registers begin at `0xFFFF0000`.
Reading the keyboard's character register consumes a waiting character, so another read can differ
without a store.

The bitmap display uses a **framebuffer**: ordinary RAM watched by the display and drawn as pixels.
Keyboard and console registers have device behavior; framebuffer bytes remain stored values.

## From source to an executable file

Here, **Build** assembles source and loads instructions and data directly into the simulator.
It does not create or import ELF executables. The `.globl main` behavior is this editor's startup
convention.

A toolchain that produces executable files follows this route:

```text
source → assembler → object file → linker → executable file → loader → memory
```

The **assembler** encodes instructions and lays out data. An **object file** holds those contents
and information for combining files. The **linker** combines object files and settles references
to labels defined elsewhere. The **loader** prepares memory and execution from the executable.
Its entry point can lead to startup instructions that run before `main`.

## ELF describes the file and its loading

RISC-V toolchains commonly use **ELF**, the **Executable and Linkable Format**, for object files and
executables. Its header identifies the processor, byte order, file type and entry address.
**ELF32** and **ELF64** describe the file format's structures: address fields occupy four or eight
bytes. **RV32** and **RV64** describe the RISC-V architecture mode. They are related choices in a
toolchain, but choosing RV64 in this editor does not produce an ELF64 file.

ELF **sections** organize contents for building and inspection. **Loadable segments** specify file
bytes, memory addresses, memory sizes, and read, write and execute permissions for the loader.
One writable segment can contain both the `.data` score and `.bss` buffer.

The buffer needs sixteen zero-filled bytes in memory. In ELF, `.bss` records that storage requirement
without putting sixteen buffer bytes into the file. The segment description makes the loader
supply the extra zero-filled memory.

A **file offset** counts bytes from the beginning of a file. Instructions at file offset `0x1000`
could be loaded at memory address `0x00400000`; the offset alone does not tell you their address.
The [ELF specification](https://gabi.xinuos.com/elf/01-intro.html) describes the format.

## Check your understanding

1. Which conventional sections fit the greeting, score and buffer? Which memory area holds all
   three in this editor?
2. What do `t1` and `t2` contain after the example runs? Would choosing RV64 make `score` eight
   bytes long?
3. In an ELF executable, must the file store sixteen zero bytes for the `.bss` buffer? How much
   memory does the buffer need when the program runs?
4. Why can two reads of a keyboard character register differ without a store? How does the bitmap
   framebuffer hold its pixel values?
5. Put assembler, linker and loader in order. Which prepares memory using loadable segments? Is
   file offset `0x1000` enough to determine an instruction's memory address?

<details>
<summary>Show answers</summary>

1. `.rodata`, `.data` and `.bss`, respectively. Here they all contribute to the writable data area.
2. `t1` holds address `0x10010004`; `t2` holds value 10. `.word` occupies four bytes in either mode.
3. No. ELF records the storage requirement; the loader supplies sixteen zero-filled bytes in memory.
4. A keyboard read consumes a waiting character. The framebuffer stores pixel values in ordinary
   RAM watched by the display.
5. Assembler, linker, loader. The loader prepares memory from loadable segments. A file offset
   needs loading information to relate it to a memory address.

</details>
