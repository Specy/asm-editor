[Assembly basics](/learn/courses/assembly-basics) went through registers, memory, branching and the
stack once, using whichever language made each point clearest. From here on there is one machine, the
Zilog Z80.

## The machine

The **Z80** is an 8 bit CPU that Zilog launched in July 1976, designed by Federico Faggin and
Masatoshi Shima. It was built to run Intel 8080 code unchanged and then to go further than the 8080,
which is where its alternate register set, its two index registers and its bit and block instructions
come from. It is the CPU of the ZX Spectrum, the Amstrad CPC, the MSX machines, the TRS-80 and the
Sega Master System.

Eight bits is the number that shapes everything else here:

- **Seven 8 bit registers**, `a`, `b`, `c`, `d`, `e`, `h` and `l`. Each of them holds one byte, so a
  number over 255 does not fit in any of them.
- **`a` is the accumulator.** Every 8 bit addition, subtraction and logic instruction writes its
  answer into `a`, and most of them read one of their two operands from it.
- **Three 16 bit pairs**, `bc`, `de` and `hl`, each of which is two of those registers glued
  together: `b` is the high byte of `bc` and `c` is the low one. That is how a 16 bit address fits.
- **Two index registers**, `ix` and `iy`, 16 bits each, which address memory with a displacement.
- **A stack pointer `sp` and a program counter `pc`**, 16 bits each.
- **An alternate set**, written `af'`, `bc'`, `de'` and `hl'`. They are a second copy of the same
  registers, and two instructions swap the copies in and out.
- **Memory**, one array of bytes running from `0x0000` to `0xFFFF`. That is 64 KB, and 16 bits is
  exactly enough to address all of it, which is why the pairs exist.
- **Six flags** in a register called `f`, which is where the results of comparisons go.

The registers panel next to every program on this page lists `a` on its own and everything else as a
16 bit pair, because that is how the Z80 itself treats them. `f` is not in the list, the flags panel
above it is `f` drawn one bit at a time.

The Z80 is **little endian**: the low byte of a 16 bit number sits at the lower address, so `0x1234`
written to memory reads `34 12`.

## The simulator

There is no real Z80 in your browser, there is an emulator. The other languages in this editor each
imitate a simulator that came before them, EASy68K or MARS or RARS, and the Z80 imitates none: real
Z80 machines had no operating system in common, every one of them had its own ROM at its own
addresses, and there is nothing to copy.

So this editor uses the Z80's own mechanism instead, **I/O ports**. There is no system call
instruction anywhere in the instruction set, and a program that wants to print a character or read a
key writes or reads a port number with `in` and `out`. Which port does what is what the "Talking to
the outside world" module of this course is for. Until then, programs show what they did in the
registers and the memory.

## How a program is written down

A line is a label, an instruction, a directive, a comment, or nothing.

- A **comment** starts at a `;` and runs to the end of the line, wherever the `;` is.
- A **label** goes at the start of the line: `loop:`. It is a name for the address of whatever comes
  next, code or data. The colon is optional here, and these pages write it.
- A **directive** is a line addressed to the assembler instead of the CPU. `.org` says where in
  memory what follows goes, `.db` and `.dw` write bytes and words there, `.ds` reserves room, `equ`
  gives a number a name. They get a lecture of their own, "org, db, dw and ds", later in this course.
- Everything else is **indented**, one instruction per line. Four spaces is what these courses use.
- **Case does not matter.** `LD A, B` and `ld a, b` are the same instruction. We write lower case.

Numbers can be written in several bases, and unlike the M68K there is no `#` in front of an
immediate: the parentheses are what mark a memory access.

| written      | means                         |
| ------------ | ----------------------------- |
| `31`         | decimal 31                    |
| `0x1F`       | hex, the same 31              |
| `$1F`        | hex again                     |
| `1Fh`        | hex again, the Zilog spelling |
| `0b00011111` | binary, still 31              |
| `0o37`       | octal, still 31               |
| `'A'`        | the character code, 65        |

`ld a, 0x1F` puts the number `0x1F` in `a`. Put the same thing in parentheses and `ld a, (0x1F)`
reads the byte _at address_ `0x1F` instead. Two characters make two completely different
instructions.

There are no size suffixes. On the M68K you write `move.b` or `move.l` to say how much you are
moving; on the Z80 the registers you name say it for you, `ld a, b` moves one byte because `a` and
`b` are one byte each, and `ld hl, bc` moves two because those pairs are two.

## Your first program

This one puts two numbers in registers and adds them. Press **Build**, then **Run**, and read the
answer in `a` in the registers panel.

```z80|playground|no-flags
    .org 0x8000
    ld a, 10        ; x = 10
    ld b, 32        ; y = 32
    add a, b        ; x = x + y
    halt
```

`ld a, 10` writes the number 10 into `a`, and the line under it does the same with 32 and `b`. `ld`
is the Z80's move instruction, and it is the only one: there is no `mov`, no `move` and no `store`,
every copy of a value from anywhere to anywhere is an `ld`, and the destination is the operand on the
left.

`add a, b` adds the two and leaves the answer in `a`, which comes out at `2A`, hexadecimal for the
number 42. `b` is untouched, and so is `bc` in the panel, which reads `2000` because `b` is its high
byte and `c` is still zero.

`.org 0x8000` puts the program at address `0x8000`, halfway up the 64 KB. Leave it out and the
program is assembled at `0x0000`, which on a real Z80 is where the reset and interrupt entry points
live, so every program in this course starts with that line.

Try changing `add a, b` to `add a, a` and see 20 come out instead, since the accumulator is then
added to itself.

## Bytes and the pair they make

`h` and `l` are two registers and `hl` is both of them at once, and every instruction that names one
of the three is talking about the same sixteen bits. Build this one and press **Step** four times,
watching `hl` in the registers panel.

```z80|playground|no-flags
    .org 0x8000
    ld hl, 0x1234   ; both halves at once
    ld a, h         ; a = the high byte
    ld d, l         ; d = the low byte
    ld l, 0xFF      ; only the low half of hl changes
    halt
```

| after this line | `a` |   `de` |   `hl` |
| --------------- | --: | -----: | -----: |
| `ld hl, 0x1234` |  00 | `0000` | `1234` |
| `ld a, h`       |  12 | `0000` | `1234` |
| `ld d, l`       |  12 | `3400` | `1234` |
| `ld l, 0xFF`    |  12 | `3400` | `12FF` |

`de` reads `3400` because `d` is the high byte of `de` and `e` was never written. The last line
changed `l` and left `h` alone, so `hl` went from `1234` to `12FF`.

Try changing `ld l, 0xFF` to `ld h, 0xFF` and watch `hl` become `FF34` instead.

## The flags panel

The flags sit just above the registers, and there are six of them: `S`, `Z`, `H`, `P/V`, `N` and `C`.
`cp` compares `a` against something by subtracting it, throwing the answer away and keeping only what
the subtraction did to the flags. `Z` goes to 1 when the two were equal.

```z80|playground
    .org 0x8000
    ld a, 5
    cp 5            ; 5 - 5, which is zero
    ld b, 7
    ld a, b         ; a load, which changes no flag at all
    cp 5            ; 7 - 5, which is not
    halt
```

Step through it and watch `Z`: it goes to 1 after the first `cp`, survives the two `ld` instructions
in the middle, and goes back to 0 after the second `cp`. **A load never touches the flags on the
Z80**, which is not true of the M68K, where a plain `move` sets them and destroys a comparison you
made a line earlier. The F register gets a lecture of its own later on.

## Four ways a program ends

The Z80 has no instruction that means "this program is over", because a real one was expected to keep
running until the power went off. This editor stops a program in four situations, and they are worth
knowing now because every program you write will use one of them.

- **`halt`.** On real hardware it parks the CPU until an interrupt arrives. Nothing here raises one,
  so the editor reports the program as terminated. This is what these pages use.
- **Running off the end of the code.** The program counter reaches an address that no line of your
  source produced, and the run stops there. The two programs above would end the same way with their
  `halt` deleted, which is why the earlier lectures of the other courses could get away with no
  ending at all.
- **A top level `ret`.** `ret` pops a return address off the stack and jumps to it, and at the top
  level there is nothing on the stack, so it pops whatever `0xFFFF` and beyond happen to hold. The
  editor treats that as the end of the program too.
- **`ei` and then `halt`.** On a real machine that is the idle loop of a program waiting for a
  device. Here it is the same as a plain `halt`.

The **Build** button assembles what you wrote and points the emulator at the first instruction,
**Run** runs it to one of those four endings, and **Step** runs one instruction at a time.

## Your turn

The test starts `hl` at `0x1234`. Leave its high byte in `a` and its low byte in `c`, which makes
`bc` read `0034` in the panel, since `b` is untouched and stays zero.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "hl": "0x1234" },
    "expectedRegisters": { "a": "0x12", "bc": "0x0034" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld a, h         ; the high byte of hl
    ld c, l         ; the low byte
    halt
```

</details>

The second one starts `a` at 5 and `bc` at `0x0307`, so `b` is 3 and `c` is 7. Leave the sum of the
three in `a`, which is 15, or `0F` in hexadecimal. Everything the Z80 adds goes through `a`, so this
is two instructions.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": 5, "bc": "0x0307" },
    "expectedRegisters": { "a": "0x0F" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    add a, b        ; a = a + b
    add a, c        ; a = a + c
    halt
```

</details>
