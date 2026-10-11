What happens when a subroutine calls itself? Each `call` puts a return address on the stack. If the
subroutine also saves the values it will need later, one call can wait while the next call works.
These two routines use that pattern to calculate `factorial(8)` and `fib(10)`.

Open the program in the editor and choose **Build**. Use **Step** to follow the smaller calls, or
**Run** to see the answers. The register panel shows hexadecimal values; `8` and `10` in the code
are decimal.

```z80|playground|memory|no-flags|allow-open
    .org 0x8000
    ld a, 8
    call factorial      ; 8!, returned in hl
    push hl
    pop ix              ; keep 8! while fib uses hl
    ld a, 10
    call fib            ; fib(10), returned in hl
    jp done

; factorial(n): n in a, answer in hl
factorial:
    cp 2
    jr nc, more
    ld hl, 1            ; factorial(0) and factorial(1) are 1
    ret
more:
    push af             ; save this call's n
    dec a
    call factorial      ; hl = factorial(n - 1)
    pop af              ; recover this call's n
    ld b, a
    ld d, h
    ld e, l             ; de = factorial(n - 1)
    ld hl, 0
times:
    add hl, de          ; add the smaller factorial n times
    djnz times
    ret

; fib(n): n in a, answer in hl
fib:
    cp 2
    jr nc, recurse
    ld l, a
    ld h, 0             ; fib(0) is 0 and fib(1) is 1
    ret
recurse:
    push af             ; save this call's n
    dec a
    call fib            ; hl = fib(n - 1)
    pop af              ; restore n before calculating n - 2
    push hl             ; keep the first answer across the next call
    sub 2
    call fib            ; hl = fib(n - 2)
    pop de              ; de = fib(n - 1)
    add hl, de          ; fib(n - 2) + fib(n - 1)
    ret

done:
    halt
```

### Factorial: one call waits for another

`factorial(0)` and `factorial(1)` return 1 directly. For any larger `n`, the routine saves `n`,
calls `factorial(n - 1)`, and multiplies that answer by `n`. There is no multiply instruction here,
so it adds the smaller factorial to `hl` exactly `n` times.

For `factorial(3)`, the calls go down through `3 → 2 → 1`. The call for 1 returns `hl = 1`.
The waiting call for 2 restores its own `n = 2`, adds 1 twice, and returns `hl = 2`. The waiting
call for 3 restores `n = 3`, adds 2 three times, and returns `hl = 6`. As `factorial(8)` returns,
the calls for 2 through 8 each do their own additions: 2 + 3 + 4 + 5 + 6 + 7 + 8 in all.

`push af` saves the current `a` along with the flags. Z80 `push` and `pop` work with 16-bit pairs,
so `push a` is not an instruction. When the smaller call returns, `pop af` restores the saved `n`
without changing its answer in `hl`. Each deeper `call` and `push` moves `sp` farther down, below
the waiting call's saved value. Its matching `pop` and `ret` move `sp` back up, so the waiting call
gets its own value and return address.

### Fibonacci: keep the first answer for the second call

`fib(0)` returns 0 and `fib(1)` returns 1. For larger `n`, the routine needs both `fib(n - 1)`
and `fib(n - 2)`. Both return their answers in `hl`, so the first answer must be saved before the
second call changes `hl`. That is the job of `push hl` and `pop de`.

Follow `fib(3)` through the recursive part. The values in this trace are decimal; the register
panel shows their hexadecimal equivalents.

| In the waiting `fib(3)` call   | `a`, `hl`, and saved values                                                     |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `push af`; `dec a`; `call fib` | Save original `n = 3`; call `fib(2)`.                                           |
| `fib(2)` returns               | It called `fib(1)` and `fib(0)`, added 1 + 0, and returned `hl = 1`.            |
| `pop af`; `push hl`            | Restore original `a = 3`; save the first answer, 1, on the stack.               |
| `sub 2`; `call fib`            | Subtract from the restored 3, so this call is `fib(1)`. It returns `hl = 1`.    |
| `pop de`; `add hl, de`         | Take the saved first answer into `de = 1`; add it to `hl = 1`. Return `hl = 2`. |

The second call gets its own return address below the saved first answer. When it returns, `sp`
points at that answer again, ready for `pop de`. In the full program, `ix` keeps `factorial(8)`
while Fibonacci uses `hl`. After **Run**, `ix = 9D80` (40320) and `hl = 0037` (55).

Try changing `ld a, 8` to `ld a, 9`, then build and run again. Predict whether `ix` can hold the
whole answer before looking at the panel.

<details>
<summary>Check your answer</summary>

`9!` is 362880, but `ix` shows `8980` (35200). A 16-bit pair holds values from 0 to 65535;
these additions wrap past that limit and keep only the low 16 bits. The routine does not report
the overflow.

</details>
