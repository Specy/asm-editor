[Assembly basics](/learn/courses/assembly-basics) went through registers, memory, branching and the
stack once, using whichever language made each point clearest. From here on there is one language,
the M68K.

## The machine

**M68K** is short for the Motorola 68000, a family of CPUs. It works with:

- **Eight data registers**, `d0` to `d7`, 32 bits each. Numbers live here.
- **Eight address registers**, `a0` to `a7`, also 32 bits. Addresses live here, and `a7` is the stack
  pointer, which you can also write as `sp`.
- **Memory**, one large array of bytes. In this editor it runs from `$000000` to `$FFFFFF`, so an
  address is 24 bits.
- **Five flags**, `X`, `N`, `Z`, `V` and `C`, in a register of their own. Comparisons and most
  arithmetic write them, and the branch instructions read them.

The registers panel next to every program on this page lists all sixteen. The two kinds are not
interchangeable, some instructions take only one of them. For example `lea`, which loads an address,
writes an address register and nothing else.

The M68K is **big endian**: the most significant byte of a number sits at the lowest address, so a
long you wrote as `$12345678` reads left to right in memory as `12 34 56 78`.

## The simulator

There is no real 68000 in your browser, there is a simulator, and this one follows **EASy68K**.
Printing, reading input and drawing go through the instruction `trap #15`, which is taught in the
"Talking to the outside world" module of this course. Until then, programs show what they did in the
registers and the memory.

## How a program is written down

A line is a label, an instruction, a directive, a comment, or nothing.

- A **comment** starts at a `;` and runs to the end of the line. A `*` in the first column comments
  out the whole line, which is what you will see used for headings inside a program.
- A **label** goes at the start of the line and ends with a colon: `start:`. It is just a name for
  the address of whatever comes next, code or data. The colon is required.
- A **directive** is a line addressed to the assembler instead of the CPU. `org` says where in
  memory the code goes, `dc` writes data there, `equ` gives a number a name. They get a lecture of
  their own, "org, equ, dc and ds", later in this course.
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

`move.l #$2000, d0` puts the number `$2000` in `d0`. Drop the `#` and `move.l $2000, d0` reads the
four bytes _at address_ `$2000` and puts those in `d0` instead. One character makes two completely
different instructions.

Most instructions also carry a **size**, which says how much of the register or of memory they touch.
`.b` is one byte, `.w` is two (a word), `.l` is four (a long). Leave it off and you get a word, which
is a good reason to always write it.

## Your first program

This one puts two numbers in registers and adds them. Press **Build**, then **Run**, and read the
answer in `d0` in the registers panel.

```m68k|playground|no-flags
    move.l #10, d0      ; x = 10
    move.l #32, d1      ; y = 32
    add.l d1, d0        ; x = x + y
```

`move.l #10, d0` writes the number 10 into all four bytes of `d0`, and the line under it does the
same with 32 and `d1`. `add.l d1, d0` adds the two registers and leaves the answer in `d0`, because
on the M68K the operand on the right is the destination, the one that gets written. So `d0` ends at
42 and `d1` is still 32.

**Build** assembles what you wrote and points the simulator at the first instruction, **Run** runs
the program to the end, and **Step** runs one instruction at a time.

Nothing in the program says "stop". The simulator ends a program when there is no next instruction to
run, which here is the end of what you wrote.

Try changing `add.l d1, d0` to `add.l d0, d1` and see the answer come out in `d1` instead.

## Sizes in the registers panel

A size touches the low end of the register and leaves the rest of it alone. Build this one and press
**Step** four times, keeping an eye on `d0` in the registers panel.

```m68k|playground|no-flags
    move.l #$AABBCCDD, d0   ; fill d0 so the sizes are easy to see
    move.b #$11, d0         ; only the lowest byte changes
    move.w #$2222, d0       ; only the lowest word changes
    move.l #$33333333, d0   ; and now the whole register
```

Try putting `move.b #$11, d0` back at the end and see that `$33333333` becomes `$33333311`, not
`$00000011`.

## The flags panel

The flags sit just above the registers. `cmp` subtracts its first operand from its second, throws
the answer away and keeps only what the answer did to the flags. `Z` goes to 1 when the two were
equal, which is what `beq` and `bne` read.

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
<summary>Show solution</summary>

```m68k|playground|solution
    move.b #$FF, d0     ; only the lowest byte of d0
    move.l #100, d1     ; the whole of d1
```

</details>
