A jump table chooses a case by using an index to read a code address from an array. A chain of
`cmp` and conditional jumps may check several cases before finding a match. Here, one unsigned
bounds check protects the table, then one indexed read and one indirect jump choose among the
valid cases. Adding more cases does not add more comparisons to that path.

Run this program first. In the register panel, check that `r8` is **30** when it finishes: `rcx`
starts at 2, so the program runs `case2`.

```x86|playground|allow-open
default rel
global _start

section .data
table:  dq case0, case1, case2, case3      ; four code addresses, eight bytes each
CASES   equ ($ - table) / 8

section .text
_start:
    mov rcx, 2              ; the case to run
    cmp rcx, CASES
    jae out_of_range        ; reject an index outside 0 through CASES - 1
    lea rbx, [table]
    jmp [rbx + rcx*8]       ; read a code address and continue there

case0:
    mov r8, 10
    jmp done
case1:
    mov r8, 20
    jmp done
case2:
    mov r8, 30
    jmp done
case3:
    mov r8, 40
    jmp done
out_of_range:
    mov r8, -1
done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

`dq case0` stores the address marked by `case0`, just as `dq 10` would store a number. The four
qwords at `table` are therefore an array of instruction addresses. `lea rbx, [table]` gives
`rbx` the address of its first entry. With `rcx = 2`, `[rbx + rcx*8]` selects the third qword:
the address of `case2`.

The brackets on `jmp [rbx + rcx*8]` mean that the instruction reads the qword at that memory
address. Unlike `mov`, this load becomes the address of the **next instruction** (`rip`), so
execution continues at `case2`. Each case jumps to `done` after setting `r8`; otherwise it
would fall through into the next case.

Valid indices are 0 through 3. `jae` treats `rcx` as **unsigned** and rejects anything greater
than or equal to `CASES`, including 4. This check must happen before reading the table: an
out-of-range read would supply an address that the program never intended to jump to. For a
safe experiment, change `mov rcx, 2` to `mov rcx, 4` and run again. The check should take you
to `out_of_range`, leaving `r8 = -1`. Restore `rcx` to 2 when you are done.

## Your turn

The next program has five cases, numbered 0 through 4. Add **case 5**: append `case5` to the
`table` declaration and write a `case5:` handler that puts **60** in `r8` and returns. Keep the
indexed `jmp` as the dispatch. `CASES` is calculated from the table's byte length, so adding
one qword changes it from 5 to 6 without editing the `equ` line.

The program calls `dispatch` twice. First, `rcx = 5` should select your new case; `_start`
saves that answer in `r9`. Next, `rcx = CASES` is exactly one past the last valid index, so
the bounds check should leave `r8 = -1`. Every case uses `ret` to return to the instruction
after the `call dispatch`. Press **Test**: it expects `r9 = 60` and `r8 = -1`. You can step
through the first call to watch the indexed jump land at `case5`.

```x86|playground|exercise
default rel
global _start

section .data
table:  dq case0, case1, case2, case3, case4
CASES   equ ($ - table) / 8

section .text
_start:
    mov rcx, 5
    call dispatch
    mov r9, r8              ; save the result of case 5
    mov rcx, CASES          ; one past the last valid index
    call dispatch

    mov rax, 60
    xor rdi, rdi
    syscall

dispatch:
    cmp rcx, CASES
    jae out_of_range
    lea r11, [table]
    jmp [r11 + rcx*8]

case0:
    mov r8, 10
    ret
case1:
    mov r8, 20
    ret
case2:
    mov r8, 30
    ret
case3:
    mov r8, 40
    ret
case4:
    mov r8, 50
    ret
; Add case5 here. Put 60 in r8, then return.

out_of_range:
    mov r8, -1
    ret
```

```testcase
{
    "expectedRegisters": {
        "r9": 60,
        "r8": "0xffffffffffffffff"
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .data
table:  dq case0, case1, case2, case3, case4, case5
CASES   equ ($ - table) / 8

section .text
_start:
    mov rcx, 5
    call dispatch
    mov r9, r8
    mov rcx, CASES
    call dispatch

    mov rax, 60
    xor rdi, rdi
    syscall

dispatch:
    cmp rcx, CASES
    jae out_of_range
    lea r11, [table]
    jmp [r11 + rcx*8]

case0:
    mov r8, 10
    ret
case1:
    mov r8, 20
    ret
case2:
    mov r8, 30
    ret
case3:
    mov r8, 40
    ret
case4:
    mov r8, 50
    ret
case5:
    mov r8, 60
    ret
out_of_range:
    mov r8, -1
    ret
```

</details>
