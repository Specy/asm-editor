Two subroutines that call themselves. `factorial(8)` comes back as 40320 in `ix`, and `fib(10)`
comes back as 55 in `hl`, and neither of them has a loop for the repetition: the repetition is the
calls.

Stack arguments and a stack frame built one frame for one call. Recursion needs nothing added to
that, because `call` pushes at wherever `sp` happens to be, so every call gets its return address at
a fresh place and anything the subroutine pushes is private to that call for the same reason.

**You need to know:** the "Stack arguments and a stack frame" Example and the "call, ret and passing
values" lecture. What is new here is a subroutine calling itself, and `push af` as the way each call
keeps its own copy of `n`.

```z80|playground|memory|no-flags|allow-open
    .org 0x8000
    ld a, 8
    call factorial      ; 8!
    push hl
    pop ix              ; kept in ix, where the second call cannot reach it
    ld a, 10
    call fib            ; fib(10)
    jp done

; factorial(n): n in a, the answer in hl
factorial:
    cp 2
    jr nc, more
    ld hl, 1            ; factorial(0) and factorial(1) are 1
    ret
more:
    push af             ; n, private to this call
    dec a
    call factorial      ; hl = factorial(n - 1)
    pop af              ; n back, out of this call's own stack
    ld b, a
    ld d, h
    ld e, l             ; de = factorial(n - 1)
    ld hl, 0
times:
    add hl, de          ; n times, since there is no multiply
    djnz times
    ret

; fib(n): n in a, the answer in hl
fib:
    cp 2
    jr nc, recurse
    ld l, a
    ld h, 0             ; fib(0) is 0 and fib(1) is 1
    ret
recurse:
    push af
    dec a
    call fib            ; hl = fib(n - 1)
    pop af
    push hl             ; kept across the second call
    push af
    sub 2
    call fib            ; hl = fib(n - 2)
    pop af
    pop de
    add hl, de          ; fib(n - 1) + fib(n - 2)
    ret

done:
    halt
```

The `push af` before each recursive call is the line that makes recursion work. `n` is in `a`, one
register that every call would otherwise share, so each call puts its own copy on the stack, where
the address it lands at is different for every call and no other call can reach it. The `pop af`
after the call takes back the `n` that **this** call pushed, and the answer coming back in `hl` is
untouched by either.

`push af` is also the only way to push a single byte on this machine: `push` and `pop` always move
sixteen bits and always name a pair, so `push a` is not an instruction and the flags come along with
the accumulator whether you want them or not. That is harmless here, since nothing after a `pop af`
reads a flag, and it is what lets a single byte travel on a stack that only moves pairs.

`factorial` takes four bytes of stack per call, two for the return address and two for the
`push af`, and `fib` takes six in the middle of its second call. The deepest point of the whole run
is `sp` at `FFD7`, forty bytes below where it started, and the memory panel on `FFD0` shows what is
lying there afterwards.

The multiplication at the end of `factorial` is `n` additions, because the Z80 has no `mulu`. It is
one `add hl, de` per unit of `n`, so 8! costs 2 + 3 + 4 + 5 + 6 + 7 + 8 additions on top of the
calls, and the whole program is 1836 instructions. `fib` is the expensive half: `fib(n)` calls
itself twice, so the number of calls roughly doubles for every 1 you add to `n`, for a number you
could get with a loop and two registers. Recursion is written to be read, not to be quick.

Try changing `ld a, 8` to `ld a, 9`. `ix` comes out at `8980`, which is 35200 and simply wrong: 9!
is 362880, and `hl` is sixteen bits, so everything above 65535 was thrown away as the additions
wrapped.
