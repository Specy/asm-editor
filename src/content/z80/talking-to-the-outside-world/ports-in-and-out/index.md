Every program so far left its answer in a register or in memory, where only you and the panels could
see it. Printing a line, or reading what you typed, means getting a byte out of the CPU and into
something else entirely.

There is nothing in the Z80's instruction set that means "ask the environment for something", and
there never was. What it has instead is a second address space.

## The I/O address space

Alongside the 64 KB of memory the Z80 has **256 I/O ports**, numbered `0x00` to `0xFF`. They are not
memory. No `ld` reaches them, no address in the 64 KB overlaps with them, and the CPU announces on
its pins that this access is to a port and not to RAM, so a device knows when it is being spoken to.
Two instructions reach them and nothing else does.

- **`out (n), a`** writes `a` to port `n`.
- **`in a, (n)`** reads port `n` into `a`.

There is a second form where the port number comes from a register:

- **`out (c), r`** writes register `r` to the port whose number is in **`c`**.
- **`in r, (c)`** reads that port into `r`, and any 8 bit register can be the destination.

Here is a detail that looks like trivia and is not, because two of this editor's ports depend on it.

When the CPU reads or writes anything, it puts the address on sixteen wires that run out of the chip
to the rest of the machine. Those wires are the **address bus**. A port number is only eight bits,
so it goes on the low eight wires, and the other eight are left carrying something.

What they carry is not nothing. In the `out (n), a` form the high eight wires carry `a`; in the
`out (c), r` form they carry **`b`**. A device that wants to look can read all sixteen. This editor
does look, so a port that needs a second parameter takes it in `b`, and one port uses those spare
eight wires to carry the high half of a 16 bit number.

That arrangement has a name, **port-mapped I/O**: devices live at their own numbers in their own
space, rather than being wired into unused corners of memory. Which device sits behind which number
is decided by whoever built the machine, and this editor's map is what the rest of this module is
about.

## Why ports and not a system call convention

Real Z80 machines did have printing routines, in ROM, and every machine had a different one at a
different address: the ZX Spectrum's is not the Amstrad's and neither is CP/M's. Inventing one here
would mean loading a ROM into the 64 KB, which would then collide with wherever your `.org` put your
program. Ports cost no memory, and `in` and `out` belong to the CPU itself, so the whole convention
lives outside your address space. That is the reasoning written down in
[ADR 0002](https://github.com/Specy/asm-editor/blob/main/docs/adr/0002-z80-console-ports.md).

## The console ports

Five ports carry the console, and there is **one port per output format**, because an `out` carries
exactly one byte of payload and the port number is the only other thing the instruction encodes.

| port   | writing prints                                      | reading gives                        |
| ------ | --------------------------------------------------- | ------------------------------------ |
| `0x10` | the byte as a character                             | the next character of the input line |
| `0x11` | the byte as an unsigned number, 0 to 255            | a line parsed as a decimal number    |
| `0x12` | the byte as a signed number, -128 to 127            | the same as `0x11`                   |
| `0x13` | the byte as two upper case hexadecimal digits       | a line parsed as hexadecimal         |
| `0x14` | a 16 bit number, the high byte from the address bus | the same as `0x11`                   |

The whole table, with a runnable example for every port, is on the
[Z80 I/O documentation page](/documentation/z80/io).

## Printing a string

A string is bytes and the character port takes one byte, so printing is the string loop from the
"Arrays, strings and ix" lecture with an `out` in the middle.

```z80|playground|console|no-registers|no-flags
    .org 0x8000
    ld hl, message  ; hl = the start of the string
print:
    ld a, (hl)      ; the byte hl points at
    or a            ; the terminator?
    jr z, done
    out (0x10), a      ; send it to the console
    inc hl          ; on to the next byte
    jr print
done:
    halt

    .org 0x9000
message: .asciz "Hello, world!", 10
```

The console panel below the editor shows `Hello, world!` and a newline. The `10` at the end of the
`.asciz` line is that newline written as its character code, and the terminating zero goes after it,
so the loop prints the 10 and then stops.

There is no "print a string" port, because a port carries one byte. Every string this machine prints
is printed a character at a time by a loop you wrote.

## Printing numbers

The same byte written to four different ports prints four different things.

```z80|playground|console|no-flags
    .org 0x8000
    ld a, 200
    out (0x11), a      ; unsigned: 200
    ld a, ' '
    out (0x10), a
    ld a, 200
    out (0x12), a      ; signed: the same bits read as -56
    ld a, ' '
    out (0x10), a
    ld a, 200
    out (0x13), a      ; hexadecimal: C8
    ld a, ' '
    out (0x10), a

    ld hl, 1000     ; a number no byte can hold
    ld b, h         ; the high byte goes on the address bus
    ld c, 0x14      ; the port number
    out (c), l      ; and the low byte is the payload
    ld a, 10
    out (0x10), a      ; a newline
    halt
```

The console reads `200 -56 C8 1000`. One byte, three ports, three answers, and choosing the port is
choosing how the bits are read, which is the same choice the numbers lecture made about `C` and
`P/V`.

The last four instructions are port `0x14`, and they are where those spare eight wires earn their
keep. An `out` carries one byte of payload, which is not enough for a number like 1000. So `ld b, h`
puts the high half of `hl` on the high wires of the address bus, `out (c), l` sends the low half as
the payload, and the port puts the two together. Three instructions and one `out` print anything up
to 65535, and it is the only port that reads the high half of the address.

## Reading

`in a, (0x11)` asks for a whole line, parses it as a decimal number and gives back its low byte. When no
input is waiting the program **stops inside the `in`** and waits: press Run, type a number in the box
under the console, press Enter, and the run carries on inside that one instruction.

```z80|playground|console|no-flags
    .org 0x8000
    in a, (0x11)       ; a whole line, read as a number
    ld b, a
    in a, (0x11)       ; and a second one
    add a, b        ; x + y
    out (0x11), a
    ld a, 10
    out (0x10), a
    halt
```

```testcase
{ "input": ["10", "32"] }
```

Press Run and type `10`, Enter, `32`, Enter. The console shows `42`.

A line that is not a number stops the program with an error, and a number over 255 comes back as its
low byte, because `a` is one byte.

The character port reads differently. It hands back the input line **one byte at a time**, and the
line ends with a newline character, `0x0A`, so a program reads until it sees one:

```z80|playground|console|no-flags
    .org 0x8000
    ld b, 0         ; n = 0
read:
    in a, (0x10)       ; one character of the typed line
    cp 10           ; the newline at the end of the line
    jr z, done
    inc b           ; n++
    jr read
done:
    ld a, b
    out (0x11), a      ; print how many characters were typed
    ld a, 10
    out (0x10), a
    halt
```

```testcase
{ "input": ["hi there"] }
```

Type `hi there` and press Enter: the console shows `8`, the eight characters before the newline.

## What happens at a port with nothing behind it

Only the numbers this editor maps do anything. Write to any of the other ones and the byte simply
goes nowhere; read from one and `FF` comes back.

That is not the editor being tidy, it is what a real machine does. A port is a request shouted at
whatever hardware is listening, and if nothing answers, the wires the answer would have come back on
are left floating high, which reads as all ones.

```z80|playground|console|no-flags
    .org 0x8000
    in a, (0x77)    ; nothing is behind port 0x77
    out (0x13), a      ; print what came back
    halt
```

The console reads `FF`. So a program written for a real machine will run here with its unsupported
I/O quietly doing nothing, instead of stopping with an error.

## Ending a program

The four endings from the first lecture are still the only ones: `halt`, a top level `ret`, `ei` and
`halt`, or running off the end of the code. There is no "stop the program" port, because stopping is
not something a device does to you.

## Two to print

Print `The answer is 42` with no newline after it. The string is written for you at `0x9000`, and the
number is not part of it: print the string a character at a time, then the 42 with the unsigned
number port.

```z80|playground|console|exercise
    .org 0x8000
    ; your code here
    halt

    .org 0x9000
message: .asciz "The answer is "
```

```testcase
{
    "expectedOutput": "The answer is 42"
}
```

<details>
<summary>Show solution</summary>

```z80|playground|console|solution
    .org 0x8000
    ld hl, message
print:
    ld a, (hl)
    or a
    jr z, number
    out (0x10), a      ; one character
    inc hl
    jr print
number:
    ld a, 42
    out (0x11), a      ; the number, as an unsigned decimal
    halt

    .org 0x9000
message: .asciz "The answer is "
```

</details>

The second one reads a number and prints it back in hexadecimal, with nothing else in the output. The
test types 255, so the console reads `FF`.

```z80|playground|console|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "input": ["255"],
    "expectedOutput": "FF"
}
```

<details>
<summary>Show solution</summary>

```z80|playground|console|solution
    .org 0x8000
    in a, (0x11)       ; a line, parsed as decimal
    out (0x13), a      ; the same byte, printed as hexadecimal
    halt
```

```testcase
{ "input": ["255"] }
```

</details>
