[Assembly basics](/learn/courses/assembly-basics) went through registers, memory, branching and the
stack once, using whichever language made each point clearest. From here on there is one language,
and this is where it starts.

## The machine

**M68K** is short for the Motorola 68000, a family of CPUs. What matters for writing code is what it
hands you:

- **Eight data registers**, `d0` to `d7`, 32 bits each. Numbers live here.
- **Eight address registers**, `a0` to `a7`, also 32 bits. Addresses live here, and `a7` is the stack
  pointer, which you can also write as `sp`.
- **Memory**, one large array of bytes. In this editor it runs from `$000000` to `$FFFFFF`, so an
  address is 24 bits.
- **Five flags**, `X`, `N`, `Z`, `V` and `C`, in a register of their own. Comparisons and most
  arithmetic write them, and the branch instructions read them.

The M68K is **big endian**: the most significant byte of a number sits at the lowest address, so a
long you wrote as `$12345678` reads left to right in memory as `12 34 56 78`.

## The simulator

There is no real 68000 in your browser, there is a simulator, and this one follows **EASy68K**. That
matters in one place: everything a program does to the outside world (printing, reading a number,
drawing, asking what time it is) goes through the instruction `trap #15`, with a task number in `d0`,
and those task numbers are EASy68K's, task for task. The whole list is in
[the traps documentation](/documentation/m68k/traps), and we will use two of them in a minute.

## How a program is written down

A line is a label, an instruction, a directive, a comment, or nothing.

- A **comment** starts at a `;` and runs to the end of the line. A `*` in the first column comments
  out the whole line, which is what you will see used for headings inside a program.
- A **label** goes at the start of the line and ends with a colon: `start:`. It is just a name for
  the address of whatever comes next, code or data. The colon is required.
- Everything else is **indented**, one instruction per line. Four spaces is what these courses use.
- **Case does not matter.** `MOVE.L D0, D1` and `move.l d0, d1` are the same instruction. We write
  lower case.

Numbers can be written in four bases, and a `#` in front means the number itself:

| written    | means             |
| ---------- | ----------------- |
| `100`      | decimal 100       |
| `$64`      | hex, the same 100 |
| `%1100100` | binary, still 100 |
| `@144`     | octal, still 100  |

The `#` is worth stopping on. `move.l #$2000, d0` puts the number `$2000` in `d0`. Drop the `#` and
`move.l $2000, d0` reads the four bytes _at address_ `$2000` and puts those in `d0` instead. One
character, two completely different instructions.

Last piece: most instructions carry a **size**, which says how much of the register or of memory they
touch. `.b` is one byte, `.w` is two (a word), `.l` is four (a long). Leave it off and you get a
word, which is a good reason to always write it.

## Your first program

This one prints a line and stops. Press **Build**, then **Run**, and the text lands in the console
panel.

```m68k|playground|console|no-flags
    ORG $1000
start:
    lea message, a1     ; a1 points at the text
    move.b #13, d0      ; task 13, print a string and go to a new line
    trap #15
    move.b #9, d0       ; task 9, stop the program
    trap #15

message: dc.b 'Hello, 68000!', 0
```

Four new things, one line at a time. `ORG $1000` tells the assembler where in memory to put what
follows, and `$1000` is where programs in this editor conventionally start. `dc.b` writes the bytes
that follow it into memory, here the letters of the message and a `0` to mark the end of it, and
`message` is the label for the address of the first of those bytes. `lea` (load effective address)
puts that address into `a1`, which is where task 13 looks for the string. And `trap #15` hands
control to the simulator, which reads `d0` to find out what you wanted: 13 to print, 9 to stop.

The task number is a byte, which is why it goes in with `move.b`. The `9` at the end is not optional
housekeeping, without it the program would carry on past the `trap` and start executing the letters
of your message as if they were instructions.

Try changing task 13 to task 14, which prints the same string without the new line. Then try changing
the message, and remember to leave the `0` at the end of the `dc.b`.

## Sizes in the registers panel

A size touches the low end of the register and leaves the rest of it alone. That is easiest to
believe by watching it, so build this one and press **Step** four times, keeping an eye on `d0` in
the registers panel.

```m68k|playground|no-flags
    move.l #$AABBCCDD, d0   ; fill d0 so the sizes are easy to see
    move.b #$11, d0         ; only the lowest byte changes
    move.w #$2222, d0       ; only the lowest word changes
    move.l #$33333333, d0   ; and now the whole register
```

Try putting `move.b #$11, d0` back at the end and see that `$33333333` becomes `$33333311`, not
`$00000011`.

## The flags panel

The other panel worth watching on the M68K is the flags, just above the registers. `cmp` subtracts
its first operand from its second, throws the answer away and keeps only what the answer did to the
flags. `Z` goes to 1 when the two were equal, which is what `beq` and `bne` read.

```m68k|playground
    move.l #5, d0       ; x = 5
    cmp.l #5, d0        ; compare x with 5
    move.l #7, d1       ; y = 7
    cmp.l #5, d1        ; compare y with 5
```

Step through it and watch `Z`: it goes to 1 after the first `cmp` and back to 0 after the second one.

## Your turn

Two instructions. Leave `$FF` in the lowest byte of `d0` without disturbing the three bytes above it,
and put `100` in `d1`. The test starts `d0` at `$12345678`, so a correct answer leaves it at
`$123456FF`. Write your two instructions and press **Test**.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": "0x12345678" },
    "expectedRegisters": { "d0": "0x123456FF", "d1": 100 }
}
```

<details>
<summary>Show a solution</summary>

```m68k|playground|solution
    move.b #$FF, d0     ; only the lowest byte of d0
    move.l #100, d1     ; the whole of d1
```

</details>
