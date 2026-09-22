A **subroutine** is a piece of code that can be used from several places in a program. A **call**
jumps to the subroutine, and a **return** carries on at the instruction immediately after that
particular call.

The Z80 remembers where to carry on by putting a return address on the stack. Passing an argument
to the subroutine and bringing a result back are separate jobs. The program has to choose where
those values travel.

## `call` leaves a return address on the stack

`call label` does two things:

1. it subtracts 2 from `sp` and pushes the address of the instruction after the `call`;
2. it puts the label's address in `pc`, so execution continues at the subroutine.

`ret` reverses the first part. It pops a two-byte address into `pc` and adds 2 to `sp`. Execution
therefore resumes after the matching call.

Build this program, open the memory panel at `fff8`, and step through it.

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, 10
    call triple
    ld b, a         ; execution resumes here
    jp done          ; do not fall through into the subroutine

; triple(x): x arrives in a; the result leaves in a
triple:
    ld c, a
    add a, c
    add a, c
    ret

done:
    halt
```

The `call` begins at `0x8002` and occupies three bytes, so the following `ld b, a` begins at
`0x8005`. In this playground, `sp` begins at `0xFFFF`. The call changes it to `0xFFFD` and stores
the return address `0x8005` there.

As with every 16-bit value stored in Z80 memory, the address is little endian: its low byte `05`
comes first, followed by its high byte `80`.

| Address  | Byte    | Meaning                         |
| -------- | ------- | ------------------------------- |
| `0xFFFD` | 🟢 `05` | low byte of the return address  |
| `0xFFFE` | `80`    | high byte of the return address |
| `0xFFFF` | unused  |                                 |

At `ret`, the Z80 reads those bytes as `0x8005`, puts that address in `pc`, and restores `sp` to
`0xFFFF`. The next instruction is `ld b, a`, so both `a` and `b` finish at `0x1E`, which is 30.

The `jp done` also matters. After `ld b, a`, ordinary execution would otherwise continue into
`triple` without a call. Its `ret` would then treat unrelated bytes as an address. Arrange the
surrounding control flow so a subroutine is entered by `call`.

## Decide how values travel

The CPU gives `call` and `ret` their stack behaviour, but it has no built-in idea of parameters or
return values. The caller and subroutine need an agreement such as:

- the argument arrives in `a`;
- the result leaves in `a`;
- `bc` has the same value after the call as before it.

This agreement is a **calling convention**, or simply the subroutine's **contract**. It is chosen by
the program and recorded in a comment; the CPU does not enforce it. A small program can choose its
own rules. Code that calls an existing library has to follow the rules that library states.

Registers are the simplest place to pass a few values. In `triple`, `a` carries both the argument
and the result. The subroutine also uses `c` as scratch space, so its contract should either say that
`bc` may change or preserve the old value.

## Preserve registers promised by the contract

`push` and `pop` let a subroutine borrow a register pair and then restore it. This routine uses `b`
for its calculation but promises to preserve the whole `bc` pair:

```z80|playground|no-flags
    .org 0x8000
    ld bc, 0x1111
    ld a, 5
    call twice
    jp done

; twice(x): x arrives in a; the result leaves in a; preserves bc
twice:
    push bc
    ld b, a
    add a, b
    pop bc
    ret

done:
    halt
```

The call first puts its return address on the stack. `push bc` puts the saved `bc` above that
address. `pop bc` must remove the saved value before `ret`, leaving the return address at the top
again. The program finishes with `a = 0x0A`, `bc = 0x1111`, and `sp = 0xFFFF`.

Every route to `ret` must undo the pushes made by that call. A jump that reaches `ret` while a saved
pair is still on top would make `ret` use that pair as an address.

## Conditional calls and returns

The conditions already used with branches can also control calls and returns. This example uses
`z`; `nz`, `c`, and `nc` work in the same positions.

```z80|playground|no-flags
    .org 0x8000
    ld bc, 0        ; c is the count

    ld a, 0
    or a
    call z, mark    ; Z is 1, so this call is taken

    ld a, 1
    or a
    call z, mark    ; Z is 0, so execution continues below
    jp done

mark:
    inc c
    ret

done:
    halt
```

`bc` finishes at `0x0001`. When `call z, mark` is not taken, it does not push a return address.

A conditional return tests a condition at the end of a subroutine. For example, this routine
returns immediately when its argument is zero:

```z80
; count_nonzero(x): x arrives in a; increments c when x is nonzero
count_nonzero:
    or a
    ret z
    inc c
    ret
```

When `Z` is 1, `ret z` pops the return address and leaves the subroutine. When `Z` is 0, execution
continues at `inc c`. If a routine has saved registers, restore them before any return that can be
taken.

## Pass arguments on the stack

Registers are convenient, but a caller may need them for other values. Arguments can also be
pushed. The order of the pushes becomes part of the contract.

This caller wants `add_two(22, 20)`. It pushes the second argument first and the first argument
last, then removes both arguments after the subroutine returns. It also gives `ix` a visible value
so we can check that the subroutine preserves it.

```z80|playground|memory|no-flags
    .org 0x8000
    ld ix, 0x3456
    ld hl, 20
    push hl         ; y, the second argument
    ld hl, 22
    push hl         ; x, the first argument
    call add_two
    pop de          ; discard x
    pop de          ; discard y
    jp done

; add_two(x, y): stack arguments; result in hl; preserves ix
add_two:
    push ix
    ld ix, 0
    add ix, sp      ; ix is a fixed pointer to this call's stack frame
    ld l, (ix+4)    ; low byte of x
    ld h, (ix+5)    ; high byte of x
    ld e, (ix+6)    ; low byte of y
    ld d, (ix+7)    ; high byte of y
    add hl, de
    pop ix
    ret

done:
    halt
```

There is no `ld ix, sp`, so `ld ix, 0` followed by `add ix, sp` copies the current stack address into
`ix`. The value in `ix` then stays fixed while the subroutine reads its arguments. A register used
this way is called a **frame pointer**, and the group of values for this call is its **stack frame**.

Immediately after `push ix`, `sp` and `ix` both hold `0xFFF7`. Here is the frame one byte at a time:

| Address  | Reached as | Byte    | Meaning                              |
| -------- | ---------- | ------- | ------------------------------------ |
| `0xFFF7` | `(ix+0)`   | 🟢 `56` | low byte of the caller's saved `ix`  |
| `0xFFF8` | `(ix+1)`   | `34`    | high byte of the caller's saved `ix` |
| `0xFFF9` | `(ix+2)`   | `0F`    | low byte of return address `0x800F`  |
| `0xFFFA` | `(ix+3)`   | `80`    | high byte of return address `0x800F` |
| `0xFFFB` | `(ix+4)`   | `16`    | low byte of `x = 0x0016`             |
| `0xFFFC` | `(ix+5)`   | `00`    | high byte of `x`                     |
| `0xFFFD` | `(ix+6)`   | `14`    | low byte of `y = 0x0014`             |
| `0xFFFE` | `(ix+7)`   | `00`    | high byte of `y`                     |

Every item is a two-byte word stored low byte first. The saved `ix` accounts for offsets 0 and 1,
and the return address accounts for offsets 2 and 3. That is why the first argument begins at
`ix+4`, not `ix+2`.

The ending is balanced in two stages. The subroutine's `pop ix` removes what the subroutine pushed,
then `ret` removes the return address. Back in the caller, two more pops remove the two arguments the
caller pushed. `hl` finishes at `0x002A`, `ix` is restored to `0x3456`, and `sp` is back at
`0xFFFF`.

## Calls can be nested

A subroutine can call another subroutine. Each active call has its own return address because each
`call` pushes at the current `sp`.

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, 10
    call quadruple
    ld b, a
    jp done

; quadruple(x): x arrives in a; result leaves in a
quadruple:
    call twice
    call twice
    ret

; twice(x): x arrives in a; result leaves in a
twice:
    add a, a
    ret

done:
    halt
```

The call from the main code pushes `0x8005`. Inside `quadruple`, the first `call twice` pushes
`0x800C`. At that deepest point there are exactly two active calls and two return addresses:

| Address  | Byte    | Meaning                                 |
| -------- | ------- | --------------------------------------- |
| `0xFFFB` | 🟢 `0C` | low byte of the return to `quadruple`   |
| `0xFFFC` | `80`    | high byte of that return address        |
| `0xFFFD` | `05`    | low byte of the return to the main code |
| `0xFFFE` | `80`    | high byte of that return address        |

The first `ret` resumes at the second `call twice`. The next `ret` resumes at `quadruple`'s own
`ret`, and that final return resumes at `ld b, a`. Both `a` and `b` finish at 40, and the three
returns have restored `sp` to `0xFFFF`.

## Write two subroutines

Write `square`. Its argument arrives in `a`, its 16-bit result leaves in `hl`, and it must preserve
`bc`. The test starts `a` at 7 and `bc` at `0x1234`, so `hl` must finish at 49 (`0x0031`). Use
repeated 16-bit addition. Keep every path through the subroutine balanced.

```z80|playground|exercise
    .org 0x8000
    call square
    jp done

; square(x): x in a; result in hl; preserves bc
square:
    ret

done:
    halt
```

```testcase
{
    "startingRegisters": { "a": 7, "bc": "0x1234", "sp": "0xFFFF" },
    "expectedRegisters": { "a": 7, "bc": "0x1234", "hl": "0x0031", "sp": "0xFFFF" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    call square
    jp done

; square(x): x in a; result in hl; preserves bc
square:
    push bc
    ld e, a
    ld d, 0         ; de = unsigned x
    ld hl, 0
    or a
    jr z, finished  ; zero additions when x is zero
    ld b, a
add_next:
    add hl, de
    djnz add_next
finished:
    pop bc
    ret

done:
    halt
```

</details>

For the second subroutine, the caller pushes `y = 8` and `x = 50`. Write `difference` so it leaves
`x - y`, which is 42, in `hl`. Use `ix` as a frame pointer and preserve the caller's value in `ix`.
The caller removes its two arguments after the return.

```z80|playground|exercise
    .org 0x8000
    ld ix, 0x3456
    ld hl, 8
    push hl         ; y
    ld hl, 50
    push hl         ; x
    call difference
    pop de
    pop de
    jp done

; difference(x, y): stack arguments; result in hl; preserves ix
difference:
    ret

done:
    halt
```

```testcase
{
    "startingRegisters": { "sp": "0xFFFF" },
    "expectedRegisters": { "hl": 42, "ix": "0x3456", "sp": "0xFFFF" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld ix, 0x3456
    ld hl, 8
    push hl
    ld hl, 50
    push hl
    call difference
    pop de
    pop de
    jp done

; difference(x, y): stack arguments; result in hl; preserves ix
difference:
    push ix
    ld ix, 0
    add ix, sp
    ld l, (ix+4)
    ld h, (ix+5)    ; hl = x
    ld e, (ix+6)
    ld d, (ix+7)    ; de = y
    or a             ; clear carry before sbc
    sbc hl, de
    pop ix
    ret

done:
    halt
```

</details>
