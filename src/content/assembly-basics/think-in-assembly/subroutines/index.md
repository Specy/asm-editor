In the previous lecture we saw the **stack**: a region of memory that grows downwards, that you push
values onto and pop them back off, and that costs you a single register to keep track of. Now we can
use it for the job it is really there for, which is calling code.

Say you wrote the instructions that double a number, and you need them in five places in your
program. You could write them out five times, but then every time you change your mind you have to
find all five copies and fix each one. What you want is the thing C gives you:

```c
int doubled(int x) {
    return x + x;
}

int main() {
    int y = doubled(10);
    int z = doubled(y);
}
```

A piece of code you can jump to from anywhere, that goes back to whoever jumped to it. In assembly we
call that a **subroutine** (you will also hear procedure, routine, or simply function).

## Getting back

Jumping _to_ the subroutine is the easy half, it's a branch to a label and we saw how to do that when
we looked at
[branching](/learn/courses/assembly-basics/think-in-assembly/branching-and-control-flow).
Coming back is the hard half, because "back" is a different place every time: the first call has to
return to the instruction after the first call, the second one to the instruction after the second
call.

So whoever calls has to leave the address to come back to somewhere the subroutine can find it. That
address is the **return address**, and it is simply the address of the instruction right after the
call. Where it gets left is the one thing architectures disagree on, and both answers use something
you have already seen.

## The return address on the stack

The M68K pushes it. `bsr label` (branch to subroutine) pushes the address of the next instruction
onto the stack and then jumps to the label. `rts` (return from subroutine) pops that address back off
and puts it in the program counter, so the program carries on exactly where it left off.

Compile this one and step through it. Watch the program counter on the top right jump into `double`
and come back, and watch `a7`, which is the stack pointer, drop by 4 at the call and climb back at
the `rts`.

```m68k|playground|pc|no-flags
    move.l #10, d0      ; x = 10
    bsr double          ; x = doubled(x)
    move.l d0, d1       ; y = x
    bra end

* doubled(x): x arrives in d0, the answer leaves in d0
double:
    add.l d0, d0        ; x = x + x
    rts                 ; back to whoever called us

end:
```

Try adding a second `bsr double` after the `move.l d0, d1` and step through again: the same two
instructions send you back to a different place the second time.

## The return address in a register

RISC-V does not touch memory for this. `jal ra, label` (jump and link) writes the address of the next
instruction into the register you name, by convention `ra`, and then jumps. `ret` jumps to whatever
is sitting in `ra`.

```riscv|playground
    li a0, 10          # x = 10
    jal ra, double     # x = doubled(x)
    mv s0, a0          # y = x
    j end

double:
    add a0, a0, a0     # x = x + x
    ret                # jump to the address in ra

end:
```

That is cheaper than a push, and it has a catch worth seeing now: there is only one `ra`. If `double`
called a subroutine of its own, that `jal` would write a new return address into `ra` and the way
home would be gone. So a subroutine that calls anything else pushes `ra` on the stack first and pops
it back before `ret`. The stack turns up either way, RISC-V just does not make you use it when you
don't have to.

## Passing values

Nothing so far said how `x` gets in and how the answer gets out. The hardware has no opinion:
registers are registers, and the two sides simply have to agree. That agreement is the **calling
convention**.

In the two programs above the agreement was "the argument arrives in `d0` (or `a0`), the answer
leaves in the same register", which is fine because we wrote both sides of it. Real conventions are
written down and everybody follows them: the `a` registers of RISC-V are the argument registers, `a0`
to `a7`, which is where the letter comes from, and an answer comes back in `a0`. The editor's own
system calls follow the same habit, `a0` carries the value the call works on.

The other half of the agreement is who is allowed to break what. A subroutine that uses `d3` for its
own scratch work destroys whatever the caller was keeping in `d3`. Either the subroutine promises to
put it back (push it on entry, pop it before returning), or the caller saves the registers it cares
about before making the call. Both are done in practice, and the convention is the list of which
registers are whose problem.

## Recursion

Here is the part that makes the stack worth the trouble. A subroutine can call _itself_, and every
call gets its own private copy of whatever it pushed, because every call pushes at a different place.

```m68k|playground
    move.l #5, d0       ; n = 5
    bsr factorial       ; d0 = factorial(n)
    bra end

* factorial(n): n arrives in d0, the answer leaves in d0
factorial:
    cmp.l #1, d0        ; if(n <= 1)
    ble one             ;   return 1
    move.l d0, -(sp)    ; push our n, the call below is about to overwrite d0
    sub.l #1, d0        ; n - 1
    bsr factorial       ; d0 = factorial(n - 1)
    move.l (sp)+, d1    ; pop our n back
    mulu d1, d0         ; d0 = n * factorial(n - 1)
    rts
one:
    move.l #1, d0       ; return 1
    rts

end:
```

Step through it and watch `a7` fall as the calls go deeper and climb back as they return. At the
deepest point the stack is holding five return addresses and four copies of `n`, one per call, and
nobody had to pick an address for a single one of them.

Try changing `move.l #5, d0` to `move.l #8, d0` and count how much further down `a7` gets.
