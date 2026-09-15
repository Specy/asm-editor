[Assembly basics](/learn/courses/assembly-basics) went through registers, memory, branching and the
stack quickly. From here on everything happens on one machine.

## The machine

**M68K** is short for the Motorola 68000, a family of CPUs. What you get to work with is:

- **Eight data registers**, `d0` to `d7`, 32 bits each. Numbers live here.
- **Eight address registers**, `a0` to `a7`, also 32 bits. Addresses live here, and `a7` is the
  stack pointer, which you can also write as `sp`.
- **Memory**, one long row of bytes. There are sixteen megabytes of it, far more than anything in
  this course will use.
- **Five flags**, `X`, `N`, `Z`, `V` and `C`, in a register of their own. Comparisons and most
  arithmetic write them, and the branch instructions read them.

The registers panel beside every program on this page lists all sixteen registers. The two kinds are
not interchangeable: plenty of instructions accept one and refuse the other. `lea`, which loads an
address, writes an address register and nothing else.

## Everything is written in hex

A register is 32 bits and you will constantly want to know which of them are on. Decimal is no help
with that. Nothing about 2864434397 tells you anything about its bits, and you certainly cannot see
that it is four bytes that happen to spell `AA BB CC DD`.

So values here are written in **hexadecimal**, base 16, marked with a `$` in front. Hex counts `0`
to `9` like decimal and then keeps going with letters: `A` is ten, `B` eleven, `C` twelve, `D`
thirteen, `E` fourteen, `F` fifteen, and `$10` is sixteen.

The point of base 16 is that sixteen is two to the fourth, so **one hex digit is exactly four bits**
and **two hex digits are exactly one byte**. Nothing ever straddles a digit. Read `$AABBCCDD` in
pairs and you are reading the four bytes of a long straight off the page.

A 32 bit register is therefore always eight hex digits, and the registers panel shows all eight,
padded with zeroes on the left. The number ten sits in `d0` as `0000000A`.

Addresses work the same way. Memory here runs from `$000000` to `$FFFFFF`, six hex digits, which is
24 bits and 16777216 bytes.

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

A `#` in front of a number means the number itself. `move.l #$2000, d0` puts the number `$2000` in
`d0`. Drop the `#` and `move.l $2000, d0` reads the four bytes _at address_ `$2000` and puts those
in `d0` instead.

Most instructions also carry a **size**, which says how much of the register or of memory they
touch. `.b` is one byte, `.w` is two (a word), `.l` is four (a long). Leave it off and you get a
word, which is a good reason to always write it.

## Your first program

This one puts two numbers in registers and adds them. Press **Build**, then **Run**, and read the
answer in `d0` in the registers panel.

```m68k|playground|no-flags
    move.l #10, d0      ; x = 10
    move.l #32, d1      ; y = 32
    add.l d1, d0        ; x = x + y
```

`move.l #10, d0` writes the number 10 into all four bytes of `d0`, and the line under it does the
same with 32 and `d1`. `add.l d1, d0` adds the two registers and leaves the answer **in `d0`**: on
the M68K the operand on the right is the destination, the one that gets written, and the one on the
left is left alone.

**Build** assembles what you wrote and points the simulator at the first instruction, **Run** runs
the program to the end, and **Step** runs one instruction at a time.

Nothing in the program says "stop". The simulator ends a program when there is no next instruction
to run, which here is the end of what you wrote.

## Sizes in the registers panel

A size touches the low end of the register and leaves the rest of it alone. Build this one and press
**Step** four times, keeping an eye on `d0`.

```m68k|playground|no-flags
    move.l #$AABBCCDD, d0   ; fill d0 so the sizes are easy to see
    move.b #$11, d0         ; only the lowest byte changes
    move.w #$2222, d0       ; only the lowest word changes
    move.l #$33333333, d0   ; and now the whole register
```

| after                   |       `d0` |
| ----------------------- | ---------: |
| `move.l #$AABBCCDD, d0` | `AABBCCDD` |
| `move.b #$11, d0`       | `AABBCC11` |
| `move.w #$2222, d0`     | `AABB2222` |
| `move.l #$33333333, d0` | `33333333` |

Read the right hand column in pairs of digits and you can see how far up the register each
instruction reached. `.b` changed two digits, `.w` changed four, `.l` changed all eight.

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

Step through it with an eye on `Z`. The first comparison is of two equal numbers and the second one
is not.

## Your turn

Time to write some yourself. The editor below has a **Test** button under it: write your answer,
press Test, and it says whether the registers came out as asked.

Two instructions. `d0` begins holding `$12345678`. Leave `$FF` in its lowest byte without disturbing
the three bytes above it, so it ends at `$123456FF`, and put `100` in `d1`.

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
