In the previous lecture we saw the **stack**: a region of memory that grows downwards, that you push
values onto and pop them back off, with one register keeping track of where the top is. Let's now use
it for calling code.

Say you wrote the instructions that double a number, and you need them in five places in your
program. You could write them out five times, but then every time you change your mind you have to
find all five copies and fix each one. In C you would write a function instead, and call it:

```c
int doubled(int x) {
    return x + x;
}

int quadrupled(int x) {
    x = doubled(x);
    x = doubled(x);
    return x;
}

int main() {
    int y = quadrupled(10);
}
```

In assembly a piece of code you can jump to from anywhere, and that goes back to whoever jumped to
it, is called a **subroutine** (you will also hear procedure, routine, or simply function). The words
C uses for its pieces mean the same things here:

- **Call**: in C, `quadrupled(10)` stops `main` and starts running `quadrupled`. In assembly a call
  is a jump to the subroutine's first instruction.
- **Return**: in C, `return x;` ends `quadrupled` and carries on inside `main` right after the call.
  In assembly it is a jump back to that point.
- **Return address**: where the return jumps to, the address of the instruction right after the call.
  C never shows it to you, in assembly the call has to leave it somewhere.
- **Parameter** and **argument**: `x` is the parameter of `doubled`, the `10` that `main` hands over
  is the argument. In assembly they travel in a register or on the stack.
- **Return value**: what `return` hands back, the `int` in front of `doubled`. In assembly it comes
  back in a register the two sides agreed on.

## The return address

Jumping _to_ the subroutine is a branch to a label, which we saw in
[branching](/learn/courses/assembly-basics/think-in-assembly/branching-and-control-flow). Coming back
needs more, because "back" is a different address every time, each call has to return to the
instruction that follows that particular call.

So whoever calls leaves the return address where the subroutine can find it. The M68K leaves it on
the stack, RISC-V in a register.

## The return address on the stack

`bsr label` (branch to subroutine) pushes the address of the next instruction onto the stack and
jumps to the label. `rts` (return from subroutine) pops it back off into the program counter, so the
program carries on where it left off.

Build this one and step through it. It is the C above, so there is a call inside a call. Watch the
program counter on the top right, and `a7`, the stack pointer, drop by 4 at every `bsr` and climb
back at every `rts`.

```m68k|playground|pc|no-flags
    move.l #10, d0      ; x = 10
    bsr quadrupled      ; x = quadrupled(x)
    move.l d0, d1       ; y = x
    bra end

* quadrupled(x): x arrives in d0, the answer leaves in d0
quadrupled:
    bsr doubled         ; x = doubled(x)
    bsr doubled         ; x = doubled(x)
    rts

* doubled(x): x arrives in d0, the answer leaves in d0
doubled:
    add.l d0, d0        ; x = x + x
    rts

end:
```

Here is where we see the stack being used. The instructions of that program are four bytes each and
start at `0x1000`:

|  address | instruction      |
| -------: | ---------------- |
| `0x1000` | `move.l #10, d0` |
| `0x1004` | `bsr quadrupled` |
| `0x1008` | `move.l d0, d1`  |
| `0x100C` | `bra end`        |
| `0x1010` | `bsr doubled`    |
| `0x1014` | `bsr doubled`    |
| `0x1018` | `rts`            |
| `0x101C` | `add.l d0, d0`   |
| `0x1020` | `rts`            |

Before the first call the stack is empty and `a7` holds `0x1000000`, one past the last byte of
memory (🟢 is the stack pointer, `????????` is memory we know nothing about):

|     address |  value   |
| ----------: | :------: |
|  `0xFFFFF8` | ???????? |
|  `0xFFFFFC` | ???????? |
| `0x1000000` |    🟢    |

The `bsr quadrupled` at `0x1004` pushes the address of the instruction after it, `0x1008`, and then
jumps:

|     address |    value    |
| ----------: | :---------: |
|  `0xFFFFF8` |  ????????   |
|  `0xFFFFFC` | 🟢 00001008 |
| `0x1000000` |             |

`quadrupled` calls `doubled`, and that `bsr`, at `0x1010`, pushes `0x1014` under the return address
already there:

|     address |    value    |
| ----------: | :---------: |
|  `0xFFFFF8` | 🟢 00001014 |
|  `0xFFFFFC` |  00001008   |
| `0x1000000` |             |

The `rts` of `doubled` pops `0x1014` into the program counter, so the program goes on at the second
`bsr doubled`, and the stack pointer climbs back by 4. The value stays in memory, we are just not
supposed to read it any more:

|     address |    value    |
| ----------: | :---------: |
|  `0xFFFFF8` |  00001014   |
|  `0xFFFFFC` | 🟢 00001008 |
| `0x1000000` |             |

That second `bsr doubled` pushes `0x1018` the same way and its `rts` pops it, and then the `rts` of
`quadrupled` pops `0x1008`:

|     address |  value   |
| ----------: | :------: |
|  `0xFFFFF8` | 00001018 |
|  `0xFFFFFC` | 00001008 |
| `0x1000000` |    🟢    |

## The return address in a register

RISC-V does not touch memory for this. `jal ra, label` (jump and link) writes the address of the next
instruction into the register you name, by convention `ra`, and then jumps. `ret` jumps to whatever
is in `ra`.

```riscv|playground
    li a0, 10          # x = 10
    jal ra, doubled    # x = doubled(x)
    mv s0, a0          # y = x
    j end

doubled:
    add a0, a0, a0     # x = x + x
    ret                # jump to the address in ra

end:
```

That is cheaper than a push, but there is a catch, there is only one `ra`. If `doubled` called a
subroutine of its own, that `jal` would write a new return address into `ra` and the program would
lose the address where to return to. So a subroutine that calls anything else pushes `ra` on the
stack first and pops it back before `ret`. The stack turns up either way, RISC-V just does not make
you use it when you don't have to.

## Passing values

But how do we pass the parameter `x`? The hardware has no concept of parameters in procedures, so we
need to write that logic ourselves: the caller writes the argument somewhere and the subroutine reads
it from that same place. The agreement on where is the **calling convention**.

In the two programs above the agreement was "the argument arrives in `d0` (or `a0`), the return value
leaves in the same register", which works because we wrote both sides. The real conventions of
each assembly language are standardized and everyone follows them. For example in RISC-V the `a`
registers are the argument registers, `a0` to `a7`, which is where the letter comes from, and the
return value comes back in `a0`.

A convention also says which registers a subroutine may change. One that uses `d3` for scratch work
destroys what the caller kept there, so either the subroutine pushes `d3` on entry and pops it before
returning, or the caller saves it before making the call. Both are done in practice, and the
convention is the list of which registers are whose problem.

## Recursion

A subroutine can call _itself_, and every call gets its own private copy of whatever it pushed,
because every call pushes at a different address.

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

Step through it and watch `a7` fall as the calls go deeper and climb back as they return. The
`bsr factorial` inside the routine is at `0x101C`, so it pushes `0x1020`, the `move.l (sp)+, d1`
after it, and the first call, the one at `0x1004` outside the routine, pushed `0x1008`. With `n = 5`
the deepest point comes when `d0` reaches 1:

|    address |    value    |
| ---------: | :---------: |
| `0xFFFFDC` | 🟢 00001020 |
| `0xFFFFE0` |  00000002   |
| `0xFFFFE4` |  00001020   |
| `0xFFFFE8` |  00000003   |
| `0xFFFFEC` |  00001020   |
| `0xFFFFF0` |  00000004   |
| `0xFFFFF4` |  00001020   |
| `0xFFFFF8` |  00000005   |
| `0xFFFFFC` |  00001008   |

Five return addresses and four copies of `n`, one per call, and nobody picked an address for any of
them.

Try changing `move.l #5, d0` to `move.l #8, d0` and count how much further down `a7` gets.
