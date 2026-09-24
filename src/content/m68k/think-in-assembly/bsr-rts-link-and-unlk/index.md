# bsr, rts, link and unlk

A **subroutine** is a reusable group of instructions entered by a call and left by a return. A
call can come from different places, so the subroutine must know which instruction to resume after
each one. On M68K, `bsr label` (branch to subroutine) puts that **return address** on the stack and
jumps to `label`. `rts` (return from subroutine) takes the address off the stack and resumes there.

## Call with an argument in a register

For this example, the caller puts a number in `d0`, and `triple` leaves its answer in `d0`:

```m68k|playground|pc|no-flags
    move.l #10, d0      ; input = 10
    bsr triple
    move.l d0, d1       ; copy the returned 30
    bra end

; triple(x): input and answer in d0; may overwrite d2
triple:
    move.l d0, d2
    add.l d2, d0
    add.l d2, d0
    rts

end:
```

The playground begins with `sp` (also called `a7`) at `$1000000`. Here `bsr triple` is at
`$1004`, and the instruction after it, `move.l d0,d1`, is at `$1008`:

| moment       | next instruction              | `sp`       | top of stack            |
| ------------ | ----------------------------- | ---------- | ----------------------- |
| before `bsr` | `bsr triple` at `$1004`       | `$1000000` | no value from this call |
| after `bsr`  | first instruction of `triple` | `$FFFFFC`  | return address `$1008`  |
| after `rts`  | `move.l d0,d1` at `$1008`     | `$1000000` | return address popped   |

`bsr` pushed a long address, moving `sp` down by four bytes. `rts` used that address and moved `sp`
back up by four. The caller then copies 30 into `d1`. The `bra end` skips the subroutine's code:
without it, execution would fall through from the caller into `triple` a second time, reaching
`rts` without a matching call.

The processor supplies the return-address behavior. The choice of `d0` for the input and answer is
an agreement between these two pieces of code. So is the choice to let `triple` overwrite `d2`.
If its caller needs the old `d2` afterward, the caller must save and restore it. Together, such
agreements form a **calling convention**. This lesson uses local conventions stated beside each
routine; it does not assume a particular system-wide register rule.

A routine can instead promise to preserve a scratch register. This version doubles `d0` while
giving the caller its original `d2` back:

```m68k|playground|no-flags
    move.l #$12345678, d2
    move.l #5, d0
    bsr double_keep_d2
    move.l d0, d1
    bra end

; double_keep_d2(x): input and answer in d0; preserves d2
double_keep_d2:
    move.l d2, -(sp)
    move.l d0, d2
    add.l d2, d0
    move.l (sp)+, d2
    rts

end:
```

At the `rts`, the saved `d2` has already been popped, so the return address is again at `(sp)`.
The result is `d0 = d1 = 10`, `d2 = $12345678`, and `sp` is back where it began. This routine's
promise about `d2` is a choice made for this example, not a rule imposed by `bsr`.

## Pass long arguments on the stack

Here is another local agreement: the caller pushes two **long** arguments, the routine reads them
without removing them, the answer comes back in `d0`, and the caller removes the arguments after
`rts`. The caller pushes `b` first and `a` second:

```m68k|playground|memory|no-flags
    move.l #20, -(sp)   ; b: second argument
    move.l #22, -(sp)   ; a: first argument
    bsr add_two
    add.l #8, sp        ; caller removes two long arguments
    bra end

; add_two(a, b): two long arguments on stack; answer in d0
add_two:
    move.l 4(sp), d0    ; a
    add.l 8(sp), d0     ; + b
    rts

end:
```

Starting from the playground's `$1000000` stack pointer, each push changes the top:

| moment                       | `sp`       | value at `(sp)`         |
| ---------------------------- | ---------- | ----------------------- |
| before the pushes            | `$1000000` | no argument yet         |
| after pushing `b`            | `$FFFFFC`  | 20                      |
| after pushing `a`            | `$FFFFF8`  | 22                      |
| on entry to `add_two`        | `$FFFFF4`  | return address          |
| after `rts`                  | `$FFFFF8`  | `a`, still on the stack |
| after caller's `add.l #8,sp` | `$1000000` | both arguments removed  |

At entry, `(sp)` is the return address, `4(sp)` is the long `a` (22), and `8(sp)` is the long `b`
(20). These offsets come from this push order and from each argument occupying four bytes. A
different size or order would give different offsets. `rts` removes only the return address; the
caller's `add.l #8,sp` is the cleanup rule chosen here.

## Keep fixed offsets with `link` and `unlk`

Offsets from `sp` change when a routine makes another push. If `add_two` first saved `d2` with
`move.l d2,-(sp)`, its `a` would move from `4(sp)` to `8(sp)`. A **frame pointer** is a register
kept at one position during the call, so the routine can use stable offsets even while `sp` moves.

`link a6,#-8` builds a frame in three steps: it pushes the caller's `a6`, copies the resulting
`sp` into `a6`, then subtracts eight from `sp` to reserve eight bytes for local values. The
reserved bytes have no initialized value until the routine writes them. `unlk a6` sets `sp` back
to the position in `a6` and pops the saved `a6`. The return address is then at `(sp)` for `rts`.

This example stores two local longs. Recall that `mulu.w source,Dn` multiplies the unsigned low
words of its operands and replaces the whole 32-bit destination with the product. With `n = 7`,
`mulu.w d0,d0` produces 49:

```m68k|playground|memory|no-flags
    move.l #7, -(sp)    ; one long argument
    bsr squares
    add.l #4, sp        ; caller removes that argument
    bra end

; squares(n): long n at 8(a6); answer in d0; also changes d1 and d2
squares:
    link a6, #-8
    move.l 8(a6), d0    ; n
    move.l d0, -4(a6)   ; first local = n
    mulu.w d0, d0       ; d0 = n * n
    move.l d0, -8(a6)   ; second local = n * n
    move.l -4(a6), d1   ; inspect the first local
    move.l -8(a6), d2   ; inspect the second local
    unlk a6
    rts

end:
```

After `link`, the layout is as follows. The addresses assume the playground's initial
`sp = $1000000`. The two local rows name reserved space, not values supplied by `link`:

| address   | offset from `a6` | contents immediately after `link` |
| --------- | ---------------- | --------------------------------- |
| `$FFFFEC` | `-8(a6)`         | second local: uninitialized       |
| `$FFFFF0` | `-4(a6)`         | first local: uninitialized        |
| `$FFFFF4` | `(a6)`           | caller's saved `a6`               |
| `$FFFFF8` | `4(a6)`          | return address                    |
| `$FFFFFC` | `8(a6)`          | long argument `n = 7`             |

Here `sp = $FFFFEC` and `a6 = $FFFFF4` immediately after `link`. The routine writes both locals
before reading them. The positive offset `8(a6)` is the first argument because this call pushed
one long; more long arguments would follow at `12(a6)`, `16(a6)`, and so on. `a6` stays fixed until
`unlk`, even if the routine temporarily pushes another value.

The saved value at `(a6)` links to a caller's frame **if that caller also uses `a6` as its frame
pointer**. This caller has no frame; `link` still saves its original `a6` and `unlk` restores it.
After `unlk`, `sp = $FFFFF8` points at the return address. `rts` moves it to `$FFFFFC`, and the
caller's cleanup moves it to `$1000000`. The program finishes with `d0 = 49`, `d1 = 7`, and
`d2 = 49`.

## Your turn

### 1. Square a register argument

Write a complete program that calls `square` with `bsr`. `d0` starts at 7; `square` returns 49 in
`d0`. Put `move.l #1,d3` immediately after the call as a marker that execution returned, then
branch over the routine. Leave `sp` at `$1000000`. You can use `mulu.w` with the two low words of
the 7 in `d0`.

```m68k|playground|exercise
; your program here
```

```testcase
{
    "startingRegisters": { "d0": 7, "d3": "0xA5A5A5A5", "a7": "0x1000000" },
    "expectedRegisters": { "d0": 49, "d3": 1, "a7": "0x1000000" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    bsr square
    move.l #1, d3       ; reached only after the return
    bra end

; square(x): input and answer in d0
square:
    mulu.w d0, d0
    rts

end:
```

</details>

### 2. Read stack arguments

The caller pushes long `b = 20` and then long `a = 22`. Fill in `add_two` so it returns 42 in
`d0`. Leave its two arguments in place for the caller to remove; `rts` must find the return
address at `(sp)`. The instruction after the call marks the return path in `d3`.

```m68k|playground|exercise
    move.l #20, -(sp)   ; b
    move.l #22, -(sp)   ; a
    bsr add_two
    move.l #1, d3       ; reached after rts
    add.l #8, sp        ; caller removes the two longs
    bra end

; add_two(a, b): long a at 4(sp), long b at 8(sp); answer in d0
add_two:
    rts

end:
```

```testcase
{
    "startingRegisters": { "d0": "0xDEADBEEF", "d3": "0xA5A5A5A5", "a7": "0x1000000" },
    "expectedRegisters": { "d0": 42, "d3": 1, "a7": "0x1000000" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l #20, -(sp)   ; b
    move.l #22, -(sp)   ; a
    bsr add_two
    move.l #1, d3       ; reached after rts
    add.l #8, sp        ; caller removes the two longs
    bra end

; add_two(a, b): long a at 4(sp), long b at 8(sp); answer in d0
add_two:
    move.l 4(sp), d0
    add.l 8(sp), d0
    rts

end:
```

</details>
