This program adds six qwords by walking from the address of the first one to the address just after
the last one. `rsi` holds the address to read next, `rdi` holds the stopping address, and `rax` holds
the running sum.

```x86|playground|memory|allow-open
default rel
global _start

section .data
numbers:    dq 4, 8, 15, 16, 23, 42
numbers_end:

section .text
_start:
    lea rsi, [numbers]      ; address of the first element
    lea rdi, [numbers_end]  ; address just after the last element
    xor rax, rax            ; running sum = 0
.next:
    add rax, [rsi]          ; add the qword at address rsi
    add rsi, 8              ; advance by one qword
    cmp rsi, rdi
    jb .next                ; repeat while rsi is below the end
    mov r8, rax             ; save the sum for inspection
    mov r9, rdi             ; save the end address for inspection

    mov rax, 60
    xor rdi, rdi
    syscall
```

The brackets in `[rsi]` mean “the qword stored at the address in `rsi`.” On the first pass, the
loop adds 4 to `rax` and moves `rsi` from `numbers` to `numbers + 8`. Since that address is still
below `numbers_end`, `jb` takes the loop back. On the second pass, it adds 8, making `rax = 12`,
then moves `rsi` to `numbers + 16`. The same two instructions read and advance through the
remaining qwords.

`numbers_end:` names the address where the next qword would begin. The label itself stores no
data; the assembler assigns it an address after the six qwords. Six qwords occupy 48 bytes, so
after the last addition `rsi` has advanced 48 bytes from `numbers` and equals `rdi`. The `jb`
condition is then false. The program compares with this end address but never reads from it.

Run the program and inspect the registers. `r8` holds the answer, **108**: the program copies the
sum there before setting `rax` to 60 for the exit syscall. `r9` saves the end address before the
exit setup clears `rdi`. At the end, `rsi` and `r9` both show `0x402030`, 48 bytes past `numbers`
at `0x402000`. This loop shape assumes the array has at least one qword, as it reads before
checking whether it has reached the end.

## Your turn

Add `100` as a seventh qword in the `dq` list, then complete the missing instruction so the loop
adds each qword to `rax`. Keep `numbers_end:` immediately after the data. Before running, predict
the sum; then check that `r8` is **208** and `rsi` equals the saved end address in `r9`. Use
**Test** to check the sum.

```x86|playground|memory|exercise
default rel
global _start

section .data
numbers:    dq 4, 8, 15, 16, 23, 42  ; add 100 here
numbers_end:

section .text
_start:
    lea rsi, [numbers]
    lea rdi, [numbers_end]
    xor rax, rax
.next:
    ; Add the qword at rsi to rax.
    add rsi, 8
    cmp rsi, rdi
    jb .next
    mov r8, rax
    mov r9, rdi

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r8": 208
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
numbers:    dq 4, 8, 15, 16, 23, 42, 100
numbers_end:

section .text
_start:
    lea rsi, [numbers]
    lea rdi, [numbers_end]
    xor rax, rax
.next:
    add rax, [rsi]
    add rsi, 8
    cmp rsi, rdi
    jb .next
    mov r8, rax
    mov r9, rdi

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
