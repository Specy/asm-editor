# The F register

An arithmetic instruction leaves its answer in a register. It also leaves a few one-bit facts about
that answer in the **F register**. Those bits are the **flags**. Keep the flags panel open while you
step through the programs on this page: it is a view of `f`, with each flag shown separately.

For example, a byte can hold only values from 0 to 255 when we read it as unsigned. Adding 200 and
100 leaves 44 in `a` (shown as `2C` in hexadecimal), because 300 wraps around. The carry flag
records the extra bit that did not fit.

```z80|playground
    .org 0x8000
    ld a, 200
    add a, 100
    halt
```

After `add a, 100`, `a` is 44 (shown as `2C`) and `C` is 1. The value in `a` is still useful; `C`
supplies one more fact about how that value was made.

## Six flags to see

The editor shows these six named bits of `f`:

| Bit in `f` | 7   | 6   | 4   | 2     | 1   | 0   |
| ---------- | --- | --- | --- | ----- | --- | --- |
| Flag       | `S` | `Z` | `H` | `P/V` | `N` | `C` |

The two flags to learn first are:

- **`Z`**, zero: 1 when an operation's result is zero.
- **`C`**, carry: 1 when an unsigned addition needs an extra bit, or when an unsigned subtraction
  needs to borrow.

The other four are results the CPU records as well. `S` copies the top bit of a result; `H` records
a carry from the lower four bits to the upper four bits of a byte; `P/V` records parity or signed
overflow, depending on the instruction; and `N` records that the arithmetic was a subtraction. The
comparisons below use `Z` and `C`.

## Compare without changing `a`

`cp` is a comparison instruction. `cp value` works out `a - value`, updates the flags, and throws
the subtraction result away. `value` can be a number, such as `5`, or a byte register, such as
`c`. The value already in `a` is unchanged.

Try the comparison, then change `ld c, 12` to `ld c, 15` and run it again.

```z80|playground
    .org 0x8000
    ld a, 12
    ld c, 12
    cp c            ; first try: 12 - 12
    halt
```

With `cp c`, the subtraction is zero, so `Z` is 1 and `C` is 0. Change the last load to `ld c, 15`
and run it again. Now the subtraction is 12 minus 15. It is not zero, so `Z` is 0. It also needs a
borrow, so `C` is 1.

This gives `cp` a useful unsigned meaning:

| After `cp value` | What it says about unsigned `a` and `value` |
| ---------------- | ------------------------------------------- |
| `Z` is 1         | they are equal                              |
| `Z` is 0         | they are different                          |
| `C` is 1         | `a` is smaller                              |
| `C` is 0         | `a` is at least as large                    |

The flags hold these facts so that another instruction can use them to make a decision. Use the
flags panel to see the answer directly.

## Another way to set `Z`

`or a` means “OR `a` with itself.” Every bit ORed with itself stays the same, so `a` keeps its value.
The instruction still updates the flags from that value: `Z` becomes 1 when `a` is zero, and `C`
becomes 0.

```z80|playground
    .org 0x8000
    ld a, 0
    or a
    halt
```

Run it once with `a` set to 0 and once with `a` set to 7. In both runs `a` stays as it started. In
the first run `Z` is 1; in the second it is 0. This is a compact way to ask the CPU to record whether
the value already in `a` is zero.

## Flags describe recent work

Flags are not a permanent property of a register. They describe the most recent instruction that
changed them. `ld` does not change flags, so it is safe to load or copy a value after a comparison.
Arithmetic and logic instructions such as `add`, `sub`, `inc`, `dec`, and `or` can write new flag
results.

```z80|playground
    .org 0x8000
    ld a, 3
    cp 5            ; Z = 0, C = 1: 3 is smaller than 5
    ld b, 0         ; a load: Z and C stay the same
    add a, 2        ; new arithmetic: its flags replace the comparison's flags
    halt
```

Step through the last three lines. After `cp 5`, `Z` is 0 and `C` is 1. They are unchanged after
`ld b, 0`. After `add a, 2`, `a` is 5; the new addition has replaced the old comparison result, so
`C` is 0. When a program needs the answer from `cp`, it must use that answer before more arithmetic
or logic can replace the flags.

## Try it yourself

Before looking at the answer, predict the value in `a` and the values of `Z` and `C` after this
short program. Then build it, run it, and check your prediction in the panels.

```z80|playground
    .org 0x8000
    ld a, 0
    or a
    halt
```

<details>
<summary>Show solution</summary>

`a` is still 0. `Z` is 1 because the value is zero, and `C` is 0 because `or a` clears it.

</details>

For a second check, predict `a`, `c`, `Z`, and `C` after this comparison. Then build and run it to
check the flags panel. The comparison does not change either byte register.

```z80|playground
    .org 0x8000
    ld a, 100
    ld c, 200
    cp c
    halt
```

<details>
<summary>Show solution</summary>

`a` is 100 and `c` is 200. The subtraction is 100 minus 200, so `Z` is 0 and `C` is 1: the
unsigned subtraction needed a borrow.

</details>
