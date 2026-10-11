# Memory regions and executable files

Instructions, a greeting and a score all occupy bytes, but those bytes have different jobs. A
**memory region** is a range of addresses used for a particular purpose. A **memory map** describes
those ranges. Start with the map we can build using `org`, `dc` and `ds` in this editor.

## Place code and data directly

`org` chooses the next assembly address. `dc.b` places known bytes; `dc.l` places four-byte longs.
`ds.b` reserves bytes without specifying their contents. A label names the address where its
following instruction or data begins. Labels themselves occupy no bytes.

The example stores a greeting, a score initially equal to 10, and a 16-byte buffer: space for the
program to fill. In `dc.b "Hi",0`, the text supplies one byte per character; the final `0` is an
additional zero byte marking the text's end. A padding byte makes the following long start at an
even address, as required by the 68000.

`move.l` copies a long value. In `move.l #greeting,a0`, `#` makes the label's address an immediate
value, copied into address register `a0`. Without `#`, `move.l score,d0` reads the long at `score`
into data register `d0`. `$` marks hexadecimal numbers; plain `10` and `16` below are decimal.

```m68k|playground|memory|no-flags
    org $1000
start:
    move.l #greeting, a0
    move.l #score, a1
    move.l #buffer, a2
    move.l score, d0

    org $3000
greeting: dc.b "Hi", 0
padding:  dc.b 0
score:    dc.l 10
buffer:   ds.b 16
```

Build resolves labels and places instructions and declared bytes directly at their chosen addresses.
Run starts at the first assembled instruction, here at `$1000`. In this simulator, it finishes after
the fourth instruction. Directives are not execution steps.
No `main` label or separate executable file is required.

The instructions begin at `$1000`. The data area has these exact byte ranges, including both ends:

| addresses       | purpose            | initial contents                     |
| --------------- | ------------------ | ------------------------------------ |
| `$3000`–`$3002` | `greeting`         | `48 69 00`, the bytes for `Hi` and 0 |
| `$3003`         | `padding`          | `00`                                 |
| `$3004`–`$3007` | `score`            | `00 00 00 0A`, the big-endian 10     |
| `$3008`–`$3017` | `buffer`, 16 bytes | unspecified by `ds`                  |

After Run, `a0`, `a1` and `a2` hold `$3000`, `$3004` and `$3008`; `d0` holds 10. An address tells us
where the bytes are, while the bytes hold the value. The score's address is `$3004`, not 10.

With this editor's default settings, untouched buffer bytes appear as `FF`, from the simulator's
initial memory contents. `ds` still promises no initial value: write a reserved byte before
relying on it.

## Storage during execution

The greeting, score and buffer have **static storage**: their space lasts throughout execution,
with sizes fixed during Build. The score can change; "static" describes the storage's lifetime.

The **stack** is working space for temporary values, such as saved registers. The **stack pointer**,
called `sp` or `a7`, tracks its current position. This simulator initially sets it to `$2000`. Our
data starts at `$3000` to keep it away from that starting position; the example does not use the
stack.

A **heap** supplies blocks requested during execution and released for reuse. A program could
request room for an image whose size comes from its input. This editor supplies no heap allocator
or dedicated heap region. An allocator is code managing those requests; another M68K environment
can provide one.

Calling bytes "code" or "unchanged data" does not itself protect them against writes in this
simulator. Real hardware can have a different map and memory protections. Our addresses are
choices for this program, not a universal M68K layout.

Devices can occupy address ranges on some machines. **Memory-mapped input/output**, or **MMIO**,
uses memory reads and writes to communicate with them. A device read can have a side effect, such
as consuming a waiting character. This editor provides keyboard and screen access through simulator
trap tasks, not a memory-mapped keyboard or framebuffer region.

## Sections in external toolchains

Tools producing executable files often group source contents into **sections** according to their
purpose. These conventional names describe the kinds of contents we just placed:

| section   | usual purpose                                      | counterpart in our example |
| --------- | -------------------------------------------------- | -------------------------- |
| `.text`   | instructions                                       | the four `move.l` lines    |
| `.rodata` | data intended to remain unchanged                  | the greeting               |
| `.data`   | writable data with stored initial values           | the score                  |
| `.bss`    | writable storage supplied as zeroes during loading | space for a buffer         |

These names are not replacement directives for this editor's M68K assembler. Here, `org` selects
addresses, `dc` supplies bytes, and `ds` reserves space. `ds` does not acquire the zero-filling
behavior of ELF `.bss`.

## From source to an executable file

Outside this editor, a file-producing toolchain can use this route:

```text
assembly source → assembler → object file → linker → executable file → loader → memory
```

The **assembler** translates instructions and lays out data. An **object file** holds those
contents and information for combining them with other object files. The **linker** combines the
files, chooses their final layout and resolves references between them. One file can refer to a
greeting defined in another.

The **loader** prepares the executable's contents in memory. An **entry point** is the address
where execution begins. An external executable records it; it need not be a function named `main`.
Here, Build performs direct assembly, and execution begins at the first assembled instruction.
This editor does not import an ELF executable.

## ELF connects file positions to memory addresses

**ELF**, the **Executable and Linkable Format**, can describe object files and executables. Its
**[header](https://gabi.xinuos.com/elf/02-eheader.html)**, a record at the file's beginning, identifies
the processor, byte order and file type,
and records an executable's entry address.

Sections group contents for building and inspection; **loadable segments** describe the ranges a
loader prepares in memory. A segment records which file bytes to use, its memory size and access
permissions. One segment can contain several sections, such as `.data` and `.bss`. Protection
depends on the machine and execution environment enforcing those permissions.

A **file offset** counts bytes from the file's start. It is different from a memory address. Bytes
at file offset `$1000` could be loaded at memory address `$3000`; loading information connects the
two. The [ELF specification](https://gabi.xinuos.com/elf/01-intro.html) describes these file views.

For `.bss`, the segment's memory size includes space absent from its file bytes. A 16-byte buffer
there needs 16 bytes in memory without storing 16 zero bytes in the file. The loader supplies the
zeroes, following [ELF's loading rules](https://gabi.xinuos.com/elf/07-pheader.html). This differs
from our `ds.b 16` reservation.

A **raw binary** contains a sequence of bytes without ELF's loading records. Its loading address
and entry point must be supplied separately.

## Check your understanding

1. What address goes into `a1`? What value goes into `d0`? Why are they different?
2. Which addresses belong to the 16-byte buffer? Does `ds.b 16` promise to fill them with zeroes?
3. Where does this example begin execution? Do the `org` and `dc` lines execute afterwards?
4. Which conventional sections could hold the score and buffer in an ELF executable? Could one
   loadable segment contain both, and must its file bytes include the buffer's zeroes?
5. If instructions are at file offset `$1000`, does that tell you their memory address?

<details>
<summary>Show answers</summary>

1. `a1` receives `$3004`, the address named by `score`. `d0` receives 10, the long stored there.
   `#score` supplies the address; `score` without `#` reads the stored value.
2. `$3008` through `$3017`, inclusive. `ds` promises no initial contents. The untouched bytes show
   `FF` with the simulator's default settings, so the program must write before relying on them.
3. At the first assembled instruction, at `$1000`. Directives guide Build rather than executing.
   The simulator finishes after the fourth instruction; no `main` is required.
4. `.data` for the score and `.bss` for zero-filled buffer storage. One loadable segment can contain
   both. Its memory size includes the buffer; its file bytes need not store those zeroes.
5. No. A file offset identifies a position inside the file. Loading information determines the
   corresponding memory address.

</details>
