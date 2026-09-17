The greatest common divisor of two numbers, worked out by Euclid's method: replace the pair with the
smaller number and the remainder of the division, and go round until the remainder is zero. The
program calls it as a subroutine, with the two arguments in `a0` and `a1` and the answer coming back
in `a0`.

Everything up to here was one block of code that ran once. This is the first program with a piece of
code that has a name, which the rest of the program hands work to and gets an answer back from.

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

`gcd_done` is a bare `ret` with nothing to move first, because `a0` is both the first argument and
the answer, and the loop has already left the right number in it.

`gcd` is written **above** `main` and `.globl main` is what makes the program start at `main` anyway.
Execution begins at the first instruction in `.text` and a global `main` overrides that, so a
compute-only program with a subroutine puts the subroutine first and lets `main` run off the end of
the text section, which is how it stops. Take the `.globl main` line out and the program starts in
`gcd`, whose `ret` jumps to the 0 that `ra` still holds and ends the run with
`Instruction load access error`.

`jal` touches no memory. The return address goes into `ra` and stays in a register, which is quick
and which is also the catch: there is only one `ra`. Step through the call and watch it hold
`00400024`, the address of the `mv` after the `jal`, until `ret` puts that value back into `pc`.
This works here only because `gcd` calls nothing itself. A second `jal` inside it would write a new
return address over the one still needed, and the old one would have to be kept on the stack first.
That is the next program.
