The greatest common divisor of two numbers, worked out by Euclid's method: replace the pair with the
smaller number and the remainder of the division, and go round until the remainder is zero. The
program calls it as a subroutine, with the two arguments in `a0` and `a1` and the answer coming back
in `a0`.

This is the first program on the ladder that calls anything. Everything before it was one block of
code running once, and this one has a piece of code with a name that the rest of the program hands
work to.

**You need to know:** the "jal, ret and the calling convention" lecture and the "Multiply and
divide, with the remainder" Example. What is new here is the call itself, `jal` writes the address
of the next instruction into `ra` and jumps, and `ret` jumps back to it.

```riscv|playground|allow-open
.text
.globl main

# gcd(a, b): a arrives in a0 and b in a1, the answer leaves in a0.
# It works in t0, which the caller has to expect.
gcd:
    beqz a1, gcd_done   # while(b != 0)
    rem t0, a0, a1      # t = a % b
    mv a0, a1           # a = b
    mv a1, t0           # b = t
    j gcd
gcd_done:
    ret                 # the answer is what is left in a0

main:
    li a0, 84           # a = 84
    li a1, 36           # b = 36
    jal gcd             # gcd(a, b)
    mv s0, a0           # the answer, kept somewhere it will not be reused
```

Arguments in `a0` to `a7` and the answer in `a0` is the standard RISC-V convention, and this program
adds one line of its own to it: `gcd` destroys `t0`, which a subroutine is entitled to do without
telling anyone, and the comment above the label says so. Nothing in the machine enforces any of
that. A **calling convention** is exactly this comment, agreed once for a whole program instead of
once per subroutine.

`gcd_done` is a bare `ret`, with nothing to move first, because the first argument register and the
return value register are the same `a0` and the loop has already left its answer there. MIPS takes
its arguments in `$a0` and answers in `$v0`, so the same subroutine ends with a `move $v0, $a0`.

`gcd` is written **above** `main` and `.globl main` is what makes the program start at `main` anyway.
Execution begins at the first instruction in `.text` and a global `main` overrides that, so a
compute-only program with a subroutine puts the subroutine first and lets `main` run off the end of
the text section, which is how it stops. Take the `.globl main` line out and the program starts in
`gcd`, whose `ret` jumps to the 0 that `ra` still holds and ends the run with
`Instruction load access error`.

`jal` touches no memory at all: the return address goes into `ra`, where a `bsr` on the M68K pushes
it onto the stack. Step through the call and `ra` is 0 until the `jal` and `00400024` after it, which
is the address of the `mv` that follows the call, and `ret` puts the `pc` back there. This works
because `gcd` calls nothing: with a second `jal` inside it the new return address would land on top
of the one it still needed, and the stack would have to hold it.

`a0` and `s0` both come out at `0000000C`, which is 12: 84 and 36 are both 12 times something and
nothing larger divides them both. `a1` finishes at 0, since the loop works by overwriting its own
arguments.

Try changing the two numbers to 1071 and 462. The answer is 21, and the loop goes round one more
time to find it: 22 instructions instead of 17.
