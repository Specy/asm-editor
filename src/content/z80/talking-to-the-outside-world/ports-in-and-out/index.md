Every program so far left its answer in a register or in memory. To print a line or read what you
typed, an M68K program runs `trap #15`, a MIPS program runs `syscall` and a RISC-V program runs
`ecall`. **The Z80 has no such instruction.** There is nothing in the instruction set that means "ask
the environment for something", and there never was.

What it has instead is a second address space.

## The I/O address space

Alongside the 64 KB of memory the Z80 has **256 I/O ports**, numbered `0x00` to `0xFF`, and they are
not memory: no `ld` reaches them, no address in the 64 KB overlaps with them, and the CPU raises a
different signal on the bus when it talks to one. Two instructions reach them and nothing else does.

- **`out (n), a`** writes `a` to port `n`.
- **`in a, (n)`** reads port `n` into `a`.

There is a second form where the port number comes from a register:

- **`out (c), r`** writes register `r` to the port whose number is in **`c`**.
- **`in r, (c)`** reads that port into `r`, and any 8 bit register can be the destination.

The number in the parentheses is the low byte of the address bus. The **high byte** is `a` in the
first form and **`b`** in the second, and this editor uses that: a port that needs a parameter takes
it in `b`, and one port takes a whole 16 bit value that way.

That is port-mapped I/O, the sibling of memory-mapped I/O from the general course, and it is what x86
uses too. Which device sits behind which number is decided by whoever built the machine, and this
editor's map is what the rest of this module is about.

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
    ld hl, message  ; p = message
print:
    ld a, (hl)      ; c = *p
    or a            ; the terminator?
    jr z, done
    out (0x10), a      ; putchar(c)
    inc hl          ; p++
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
    ld c, 4         ; the port number
    out (c), l      ; and the low byte is the payload
    ld a, 10
    out (0x10), a      ; a newline
    halt
```

The console reads `200 -56 C8 1000`. One byte, three ports, three answers, and choosing the port is
choosing how the bits are read, which is the same choice the numbers lecture made about `C` and
`P/V`.

Try changing the three `ld a, 200` to `ld a, 100` and the second one prints `100` as well, because
100 has its top bit clear and reads the same either way.

The last four instructions are port `0x14`, which is where the high byte of the address bus earns its
keep. In the `out (c), r` form the address bus carries `b` on the high half, so `b` and the byte
written are the two halves of one 16 bit number, and three instructions and one `out` print anything
up to 65535. It is the only port that reads the high byte of the address.

## Reading

`in a, (0x11)` asks for a whole line, parses it as a decimal number and gives back its low byte. When no
input is waiting the program **stops inside the `in`** and waits: press Run, type a number in the box
under the console, press Enter, and the run carries on inside that one instruction.

```z80|playground|console|no-flags
    .org 0x8000
    in a, (0x11)       ; x = readNumber()
    ld b, a
    in a, (0x11)       ; y = readNumber()
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
    in a, (0x10)       ; c = getchar()
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

## Ports nobody is behind

Only the numbers this editor maps do anything. Every other port is an **empty bus**, which is exactly
what a real Z80 sees when no device answers: a write goes nowhere and a read comes back `FF`, because
that is what an undriven bus reads as.

```z80|playground|console|no-flags
    .org 0x8000
    in a, (0x77)    ; nothing is behind port 0x77
    out (0x13), a      ; print what came back
    halt
```

The console reads `FF`. So a program written for a real machine will run here with its unsupported
I/O quietly doing nothing, instead of stopping with an error.

## Ending a program

The Z80's four endings from the first lecture are still the only ones: `halt`, a top level `ret`,
`ei` and `halt`, or running off the end of the code. There is no "terminate" port and no task 9 to
call, because ending a program is not something a device does.

## Your turn

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
