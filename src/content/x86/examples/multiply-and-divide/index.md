# Multiply and divide, with the remainder

Run this program and inspect `r8` through `r14` in the register panel. It performs two divisions
and two multiplications. Each division saves both its quotient and remainder; the final
multiplication saves the two halves of its full product.

```x86|playground|allow-open
default rel
global _start

section .text
_start:
    mov rax, 200
    mov rbx, 7
    xor rdx, rdx            ; unsigned dividend rdx:rax = 200
    div rbx                 ; quotient in rax = 28, remainder in rdx = 4
    mov r8, rax
    mov r9, rdx

    mov rax, -200
    mov rbx, 7
    cqo                     ; sign-extend rax into rdx:rax = -200
    idiv rbx                ; quotient in rax = -28, remainder in rdx = -4
    mov r10, rax
    mov r11, rdx

    mov rax, 6
    imul rax, 7             ; two operands: keep the low 64 bits, here 42
    mov r12, rax

    mov rax, 0xFFFFFFFFFFFFFFFF
    mov rbx, 2
    mul rbx                 ; one operand: unsigned full product in rdx:rax
    mov r13, rax            ; low 64 bits
    mov r14, rdx            ; high 64 bits

    mov rax, 60
    xor rdi, rdi
    syscall
```

## Read the saved results

`div` reads the unsigned dividend from `rdx:rax`, although its instruction line names only
`rbx`. Clearing `rdx` makes that dividend 200. The quotient 28 is saved in `r8`, and the
remainder 4 in `r9`: `200 = 28 × 7 + 4`.

`idiv` also reads `rdx:rax`, but treats the pair as signed. `cqo` copies the sign of -200 into
`rdx` before division. The quotient in `r10` is -28 and the remainder in `r11` is -4:
`-200 = (-28 × 7) + (-4)`. The quotient is rounded toward zero, and a nonzero remainder has
the dividend's sign. A hexadecimal register view shows -28 as `FFFFFFFFFFFFFFE4` and -4 as
`FFFFFFFFFFFFFFFC`; those are the same bits as the signed decimal values.

The two-operand `imul` leaves 42 in `r12`. The one-operand `mul` writes a full 128-bit
unsigned product to `rdx:rax`. After the copies, `r14` is the high half, `1`, and `r13` is
the low half, `FFFFFFFFFFFFFFFE`. Read them together, high half first, as
`0x1FFFFFFFFFFFFFFFE`. That is `0xFFFFFFFFFFFFFFFF × 2`, a 65-bit result.

## Why `cqo` matters

In the first program, remove only the `cqo` line immediately before `idiv rbx`, then run it
again. The earlier `div` left its remainder, 4, in `rdx`. Loading -200 into `rax` leaves
that old high half in place. `idiv` therefore receives a different, large positive
`rdx:rax` dividend; its quotient cannot fit in a signed qword, so the run ends with a divide
error before the later results are saved. Restore `cqo` and run again to see `r10 = -28`
and `r11 = -4`.

## Your turn

Fill in the three marked blocks below. Compute unsigned `205 / 8` and save its quotient in
`r8` and remainder in `r9`. Then compute signed `-205 / 8` and save its quotient in `r10`
and remainder in `r11`. Prepare `rdx:rax` for each division. Finally, use one-operand `mul`
to multiply unsigned `0x8000000000000000` by 2; save the low half in `r12` and the high
half in `r13`. The `mov rax, 60` at the end is the exit setup, so save your answers before it.

Predict the six registers, then press **Test**. It expects `r8 = 25`, `r9 = 5`,
`r10 = -25`, `r11 = -5`, `r12 = 0`, and `r13 = 1`. The testcase writes the two
negative results as hexadecimal bit patterns; the register panel can show them as signed
decimal values. The product's low half is zero because its single set bit moves into the
high half.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; Unsigned 205 / 8: save quotient in r8 and remainder in r9.

    ; Signed -205 / 8: save quotient in r10 and remainder in r11.

    ; Unsigned 0x8000000000000000 * 2: save low half in r12, high half in r13.

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r8": 25,
        "r9": 5,
        "r10": "0xFFFFFFFFFFFFFFE7",
        "r11": "0xFFFFFFFFFFFFFFFB",
        "r12": 0,
        "r13": 1
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov rax, 205
    mov rbx, 8
    xor rdx, rdx
    div rbx
    mov r8, rax
    mov r9, rdx

    mov rax, -205
    mov rbx, 8
    cqo
    idiv rbx
    mov r10, rax
    mov r11, rdx

    mov rax, 0x8000000000000000
    mov rbx, 2
    mul rbx
    mov r12, rax
    mov r13, rdx

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
