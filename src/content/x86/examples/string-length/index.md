A zero-terminated string has no stored character count. To find its length, read bytes until the
first zero. This example does that twice: an ordinary loop leaves its answer in `r8`, and
`repne scasb` leaves the same answer in `r9`. Both searches are limited to the bytes declared
for `text`.

```x86|playground|memory|allow-open
default rel
global _start

section .data
text:           db "assembly", 0
text_end:
TEXT_CAPACITY   equ text_end - text

section .text
_start:
    lea rsi, [text]             ; first byte
    xor rcx, rcx                ; offset, also the length so far
.next:
    cmp rcx, TEXT_CAPACITY
    jae .loop_missing           ; no byte remains to check
    cmp byte [rsi + rcx], 0
    je .loop_done               ; zero is not a character
    inc rcx
    jmp .next
.loop_done:
    mov r8, rcx
    jmp .scan_start
.loop_missing:
    mov r8, -1                  ; no zero within the capacity

.scan_start:
    lea rbx, [text]             ; save the starting address
    lea rdi, [text]             ; scasb reads from rdi
    mov rcx, TEXT_CAPACITY
    test rcx, rcx
    jz .scan_missing            ; no comparison for an empty range
    xor eax, eax                ; al = zero, the byte to find
    cld                         ; advance toward higher addresses
    repne scasb
    jnz .scan_missing           ; last comparison was not zero
    mov r9, rdi
    sub r9, rbx                 ; bytes examined, including the zero
    dec r9                      ; characters before the zero
    jmp .done
.scan_missing:
    mov r9, -1
.done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

Run it and inspect `r8` and `r9` in the register panel: both are **8**. The ordinary loop tests
the capacity _before_ reading `[rsi + rcx]`. At offsets 0 through 7 it sees the letters; at
offset 8 it sees zero and copies `rcx` to `r8`. `TEXT_CAPACITY` is 9 because `db` writes eight
letters and the explicit terminator. The `text_end` label marks the address just after those
nine bytes; it stores no byte itself.

The `byte` in `cmp byte [rsi + rcx], 0` is required. `[rsi + rcx]` gives an address and the
immediate `0` has no width, so NASM cannot tell whether to compare one, two, four, or eight
bytes without an explicit size.

For the second search, `scasb` compares `al` with the byte at `rdi` and then advances `rdi` by
one because `cld` cleared the direction flag. `repne` repeats that comparison while `rcx` is
nonzero and the last byte was unequal. It decrements `rcx` after every comparison. Here it
examines nine bytes, including the zero: on the match, `rdi = text + 9`, `rcx = 0`, and the
zero flag is set. `rdi - text` is therefore 9 bytes examined; subtracting one excludes the
terminator and gives the length 8. The `jnz` checks the comparison result immediately after
the scan. If the capacity runs out on a nonzero byte, it takes the missing-terminator path.

Try replacing the declaration with `text: db "abcdefghi"`, leaving `text_end` in place. Those
nine declared bytes contain no zero. Each search reads only those bytes and leaves **-1** (the
64-bit pattern `0xFFFFFFFFFFFFFFFF`) in its result register. Restore the original declaration
afterward. The capacity is the number of accessible bytes supplied to the search; it does not
promise that a zero is present. A program using this pattern must know that capacity before it
starts reading.

## Your turn

Complete the two ordinary loops below. For each string, check its capacity before reading a
byte, count the nonzero bytes, and put **-1** in the result register if no zero occurs within
that capacity. `first` contains `"Hi!"` and a zero, so `r10` should be **3**. `second` has five
nonzero bytes and no terminator, so `r11` should have the **-1** bit pattern
`0xFFFFFFFFFFFFFFFF`. Use **Test** to check both values,
then inspect the registers. The second string is safe to scan because its five-byte capacity
stops the loop before it reads beyond `second_end`.

```x86|playground|memory|exercise
default rel
global _start

section .data
first:          db "Hi!", 0
first_end:
FIRST_CAPACITY  equ first_end - first
second:         db "abcde"
second_end:
SECOND_CAPACITY equ second_end - second

section .text
_start:
    lea rsi, [first]
    xor rcx, rcx
.first_next:
    ; Check FIRST_CAPACITY before reading a byte.
    ; On zero, put rcx in r10. On exhaustion, put -1 in r10.

.second_start:
    lea rsi, [second]
    xor rcx, rcx
.second_next:
    ; Check SECOND_CAPACITY before reading a byte.
    ; On zero, put rcx in r11. On exhaustion, put -1 in r11.

.done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r10": 3,
        "r11": "0xFFFFFFFFFFFFFFFF"
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
first:          db "Hi!", 0
first_end:
FIRST_CAPACITY  equ first_end - first
second:         db "abcde"
second_end:
SECOND_CAPACITY equ second_end - second

section .text
_start:
    lea rsi, [first]
    xor rcx, rcx
.first_next:
    cmp rcx, FIRST_CAPACITY
    jae .first_missing
    cmp byte [rsi + rcx], 0
    je .first_found
    inc rcx
    jmp .first_next
.first_found:
    mov r10, rcx
    jmp .second_start
.first_missing:
    mov r10, -1

.second_start:
    lea rsi, [second]
    xor rcx, rcx
.second_next:
    cmp rcx, SECOND_CAPACITY
    jae .second_missing
    cmp byte [rsi + rcx], 0
    je .second_found
    inc rcx
    jmp .second_next
.second_found:
    mov r11, rcx
    jmp .done
.second_missing:
    mov r11, -1

.done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
