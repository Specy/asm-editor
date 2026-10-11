# A subroutine with its arguments in registers

Suppose a program needs to add two numbers and then continue with the answer. Here `_start` gives
20 and 22 to `sum`. The subroutine adds them and returns 42. The caller saves that answer in
`r12`, where you can inspect it after the exit setup changes `rax`.

```x86|playground|allow-open
default rel
global _start

section .text
; sum(a, b) -> a + b
; The System V convention puts the first two arguments in rdi and rsi
; and expects the return value in rax.
sum:
    mov rax, rdi            ; start the answer with a
    add rax, rsi            ; add b
    ret

_start:
    mov rdi, 20             ; first integer argument
    mov rsi, 22             ; second integer argument
    call sum
    mov r12, rax            ; execution resumes here; r12 = 42

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi
    syscall
```

The System V convention gives the first two integer arguments to `rdi` and `rsi` and returns one
integer in `rax`. `sum` follows that agreement. The `call` and `ret` instructions handle a separate
problem: getting back to the instruction after this particular call.

## Follow the return address

Step through the program with `rip`, `rsp`, and the **Stack** tab visible. `rip` tells you which
instruction will execute next. Let `S` stand for the value of `rsp` just before `call sum`;
your run will show a concrete address instead.

| When you stop          | `rip` points to         | `rsp`   | What to inspect                                           |
| ---------------------- | ----------------------- | ------- | --------------------------------------------------------- |
| Before `call sum`      | `call sum`              | `S`     | The caller is about to leave `_start`.                    |
| After executing `call` | `mov rax, rdi` at `sum` | `S - 8` | The qword at `[rsp]` holds the address of `mov r12, rax`. |
| Just before `ret`      | `ret` at `sum`          | `S - 8` | The same address is still at `[rsp]`; `rax` now holds 42. |
| After executing `ret`  | `mov r12, rax`          | `S`     | The caller has resumed immediately after its `call`.      |

The address is eight bytes because this 64-bit `call` stores a 64-bit return address: one qword.
It first subtracts 8 from `rsp`, writes the address of the instruction following the `call` at
the new `[rsp]`, and sets `rip` to `sum`. `ret` reads that qword into `rip` and adds 8 to `rsp`.
The old bytes may still be visible in memory afterward, but that stack slot is no longer in use.

This is why a subroutine must leave `rsp` pointing at its return address when it reaches `ret`.
If `sum` pushed another value without popping it, `ret` would read that value as an address and
try to continue there.

`sum` changes only `rax`, which is a caller-saved register. If a subroutine uses a callee-saved
register such as `rbx` or `r12`, it must restore the caller's value before returning. The
caller can use `r12` here to keep the result after `sum` returns.

## Your turn

Write `difference(a, b)` so it reads `a` from `rdi`, reads `b` from `rsi`, and returns `a - b`
in `rax`. In `_start`, call it with 50 and 8, then save the result in `r12`. Call the same
subroutine again with 100 and 37, and save that result in `r13`. Write the argument setup and
both calls yourself.

Before running, predict both answers. Then press **Test**: it expects `r12 = 42` and `r13 = 63`.
You can also step through both calls. Each `call` puts a different return address at `[rsp]`:
the first leads to `mov r12, rax`, and the second leads to `mov r13, rax`. After each `ret`,
`rsp` is back where it was before that call.

```x86|playground|exercise
default rel
global _start

section .text
; difference(a, b) -> a - b
difference:
    ; Write the two instructions that put a - b in rax.
    ret

_start:
    ; Call difference(50, 8), then save its answer in r12.

    ; Call difference(100, 37), then save its answer in r13.

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r12": 42,
        "r13": 63
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
; difference(a, b) -> a - b
difference:
    mov rax, rdi
    sub rax, rsi
    ret

_start:
    mov rdi, 50
    mov rsi, 8
    call difference
    mov r12, rax

    mov rdi, 100
    mov rsi, 37
    call difference
    mov r13, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
