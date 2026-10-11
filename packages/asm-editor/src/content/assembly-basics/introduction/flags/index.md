An instruction leaves a number behind, and the CPU also keeps a few single bits saying how that
number came out. Those bits are the **flags**. Each CPU has a different set of them, and they follow
the same patterns.

A flag describes the **most recent operation** and nothing else, and what reads them are the
**conditional instructions** (_branch if zero_, _branch if negative_, etc...), which is how a program
decides where to go next.

They live together in one register, called the **status register**, the **condition code register
(CCR)** or the **flags register**, depending on the architecture.

These are the ones you meet in most of them:

- **Zero flag (Z)**: set when the result is zero. Subtract two equal numbers and it goes to 1.
- **Negative flag (N)**: set when the result is negative, which in practice is when the highest bit of the result is 1.
- **Carry flag (C)**: set when the operation carried out of the highest bit. This is the one unsigned arithmetic reads, say adding two numbers whose sum does not fit in the register.
- **Overflow flag (V, or O)**: set when the result is too large or too small for the _signed_ range of the register.
- **Sign flag (S)**: the same idea as N, used instead of it or next to it on some architectures.
- **Parity flag (P)**: set when the number of 1 bits in the result is even. x86 has one and uses it for error checking.

The M68K adds an **Extend flag (X)**, a second copy of the carry kept for the instructions that add
and subtract across more than one register, and it is the first of the five in the flags panel of
every program on this page.

A program almost never writes the flags itself, the CPU **updates them by itself** after nearly every
arithmetic and logic instruction. An `add` writes the zero, negative, carry and overflow flags from its own
result, and the branch on the next line reads them.

## Compare and branch

`cmp` subtracts its first operand from its second, throws the answer away and keeps only what the
answer did to the flags. `beq` (branch if equal) reads the zero flag, because the two operands were
equal exactly when that subtraction came out at zero.

Build this one and step through it watching the flags panel, which sits above the registers.

```m68k|playground|pc
    move.l #5, d0       ; x = 5
    cmp.l #5, d0        ; compare x with 5
    beq equal           ; if(x == 5) goto equal
    move.l #100, d1     ; y = 100
    bra end
equal:
    move.l #200, d1     ; y = 200
end:
```

| after this line   |   X |   N |   Z |   V |   C |
| ----------------- | --: | --: | --: | --: | --: |
| `move.l #5, d0`   |   0 |   0 |   0 |   0 |   0 |
| `cmp.l #5, d0`    |   0 |   0 |   1 |   0 |   0 |
| `beq equal`       |   0 |   0 |   1 |   0 |   0 |
| `move.l #200, d1` |   0 |   0 |   0 |   0 |   0 |

`cmp.l #5, d0` computes 5 minus 5, so `Z` goes to 1 and `beq` jumps. `beq` itself changes nothing,
it only reads. The `move.l #200, d1` at the end puts `Z` back to 0, because 200 is not zero: a flag
is about the last instruction, not about the comparison you made three lines ago.

Try changing `move.l #5, d0` to `move.l #3, d0`. Now the subtraction is 3 minus 5, so `Z` stays 0,
`N` goes to 1 because the answer is negative, and `C` goes to 1 because the subtraction borrowed.
`beq` does not jump and `d1` comes out at 100.

## Carry and overflow are two different questions

Both of them are about a result that did not fit, and they are asked of the same bits from two
different sides: `C` is the unsigned answer, `V` is the signed one. Build this and step through it.

```m68k|playground
    move.l #$7FFFFFFF, d0   ; the largest positive long
    add.l #1, d0            ; one past it
    move.l #$FFFFFFFF, d1   ; every bit set
    add.l #1, d1            ; one past it
```

The first `add.l` leaves `d0` at `80000000`, with `N` and `V` at 1 and `C` at 0. Read as a signed
number, `$7FFFFFFF` plus 1 wrapped around to the most negative long there is, which is what `V`
reports; read as an unsigned number the answer is 2147483648 and perfectly correct, so `C` stays 0.

The second `add.l` leaves `d1` at `00000000`, with `Z` and `C` at 1 and `V` at 0. Read as unsigned,
4294967295 plus 1 did not fit, which is what `C` reports; read as signed, `$FFFFFFFF` is -1 and -1
plus 1 is 0, which is right, so `V` stays 0. The `X` flag copies `C` and is also 1.

The same bits, then, and the CPU sets both flags every time so that your program can ask whichever
of the two questions it cares about.
