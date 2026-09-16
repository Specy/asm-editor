# Arrays, strings and the string instructions

An **array** is a consecutive run of equal-size elements. If a qword array begins at `numbers`,
then its elements begin at `numbers + 0`, `numbers + 8`, `numbers + 16`, and so on. There are two
common ways to walk it:

- keep an index and calculate `base + index * element_size`;
- keep a pointer to the current element and advance it by `element_size`.

Both forms need a boundary so that they never read beyond the array.

## Walking an array by index

This loop sums six qwords. The index starts at zero, so `[rbx + rcx*8]` implements
`base + index * size`.

```x86|playground|memory|no-flags
default rel
global _start

section .data
numbers:    dq 4, 8, 15, 16, 23, 42
COUNT       equ ($ - numbers) / 8

section .text
_start:
    lea rbx, [rel numbers]      ; base address
    xor rcx, rcx                ; index = 0
    xor rax, rax                ; total = 0

sum_test:
    cmp rcx, COUNT
    jae sum_done                ; unsigned index >= count
    add rax, [rbx + rcx*8]
    inc rcx
    jmp sum_test

sum_done:
    mov r8, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

The `dq` directive emits 48 bytes. Dividing that byte count by the eight-byte element size makes
`COUNT` equal to 6. `COUNT equ ...` is an assembly-time calculation: it allocates no memory and
there is no stored variable named `COUNT` at run time.

The condition is tested before the load. If `COUNT` were zero, the first `jae` would skip the body,
so the program would not try to read an element that does not exist.

## Walking the same array with a pointer

A label immediately after the array gives its **one-past-end address**. That address is a boundary;
the program compares against it but never dereferences it.

```x86|playground|no-flags
default rel
global _start

section .data
numbers:    dq 4, 8, 15, 16, 23, 42
numbers_end:

section .text
_start:
    lea rsi, [rel numbers]      ; current element
    lea rdi, [rel numbers_end]  ; one past the final element
    xor rax, rax                ; total = 0

pointer_test:
    cmp rsi, rdi
    jae pointer_done            ; at or beyond the boundary
    add rax, [rsi]
    add rsi, 8                  ; advance by one qword
    jmp pointer_test

pointer_done:
    mov r8, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

The pointer takes the values `numbers`, `numbers + 8`, through `numbers + 40`. After the final
element it becomes `numbers_end`. The pre-test happens before every load, including the first one,
so this shape is safe for an empty array whose start and end labels have the same address.

The index form keeps the element number available. The pointer form already holds the next address
to use. x86 string instructions use the pointer form through implicit registers.

## Fixed-length bytes and zero-terminated strings

A string is byte data plus a rule that says where the data ends. Two common rules are an explicit
length and a terminating zero byte:

```x86
fixed:      db "hello"
FIXED_LEN   equ $ - fixed       ; five bytes

c_text:     db "hello", 0      ; six bytes including the terminator
```

`fixed` contains exactly five bytes, so code must receive or calculate its length. Those five bytes
may include zero; the length, rather than a byte value, determines the end.

`c_text` uses the C-style convention: the first zero byte ends the string. NASM does not append
that byte to a quoted `db` value. The explicit `, 0` creates it.

For the smaller declaration `message: db "Hi!", 0`, memory contains:

| address       | byte | meaning |
| ------------- | ---- | ------- |
| `message + 0` | `48` | `H` |
| `message + 1` | `69` | `i` |
| `message + 2` | `21` | `!` |
| `message + 3` | `00` | terminator |

A byte-at-a-time walk examines offsets 0, 1, 2, and 3. The load at offset 3 reads the terminator;
`test al, al` then sets `ZF`, and the loop stops without treating that byte as a character. A valid
zero-terminated string therefore needs accessible storage for the terminator as well as the visible
characters.

## Implicit registers and the direction flag

This lesson uses four byte-form string instructions. They use fixed registers rather than written
operands:

| instruction | operation | pointer change when `DF=0` | pointer change when `DF=1` |
| ----------- | --------- | -------------------------- | -------------------------- |
| `movsb` | copy byte `[rsi]` to `[rdi]` | `rsi += 1`, `rdi += 1` | `rsi -= 1`, `rdi -= 1` |
| `stosb` | store `al` at `[rdi]` | `rdi += 1` | `rdi -= 1` |
| `scasb` | set flags for `al - [rdi]` | `rdi += 1` | `rdi -= 1` |
| `cmpsb` | set flags for `[rsi] - [rdi]` | `rsi += 1`, `rdi += 1` | `rsi -= 1`, `rdi -= 1` |

The **direction flag**, `DF`, is persistent processor state. `cld` clears it for forward movement;
`std` sets it for backward movement. A string instruction does not restore the old direction when
it finishes. Execute `cld` whenever code requires forward movement instead of relying on whatever
some earlier code left in `DF`.

The suffix selects the element width. The `w`, `d`, and `q` forms move each affected pointer by 2,
4, or 8 bytes respectively; the byte forms above move by 1. For example, `movsq` copies a qword and
then adds or subtracts 8 from both pointers.

`movsb` is also a useful exception to the ordinary operand rule. An explicit
`mov [destination], [source]` is invalid because ordinary `mov` cannot have two memory operands.
`movsb` performs a memory-to-memory copy through its implicit `[rsi]` source and `[rdi]`
destination.

## Repeating a string instruction

A repeat prefix uses `rcx` as a count. Before each possible iteration, a zero `rcx` stops the
instruction. Each completed iteration decrements `rcx`.

- As used here, `rep` repeats `movs` or `stos` while `rcx` is nonzero.
- `repe` repeats a comparison while `rcx` is nonzero and, after each comparison, `ZF=1`.
- `repne` repeats a comparison while `rcx` is nonzero and, after each comparison, `ZF=0`.

Here a bounded `rep movsb` copies six bytes, including the terminator. A bounded `rep stosb` then
fills four other bytes.

```x86|playground|memory|no-flags
default rel
global _start

section .data
source: db "hello", 0
dest:   times 16 db 0

section .text
_start:
    cld                         ; both operations move forward

    lea rsi, [rel source]
    lea rdi, [rel dest]
    mov rcx, 6
    rep movsb

    lea rdi, [rel dest + 8]
    mov al, 'A'
    mov rcx, 4
    rep stosb

    mov rax, 60
    xor rdi, rdi
    syscall
```

The resulting destination bytes are:

```
68 65 6C 6C 6F 00 00 00   41 41 41 41 00 00 00 00
```

After the copy, `rsi` is `source + 6`, `rdi` is `dest + 6`, and `rcx` is zero. The following setup
changes `rdi`; after the fill, it is `dest + 12` and `rcx` is zero again.

## Scanning within a capacity

`repne scasb` can look for a byte, but it must have a real bound. This example searches an
eight-byte accessible range for a zero terminator:

```x86|playground|no-flags
default rel
global _start

section .data
text:           db "hello", 0, 'X', 'Y'
text_end:
TEXT_CAPACITY   equ text_end - text

section .text
_start:
    lea rbx, [rel text]         ; remember the start
    lea rdi, [rel text]
    mov rcx, TEXT_CAPACITY      ; maximum accessible bytes
    test rcx, rcx
    jz terminator_missing

    xor eax, eax                ; al = byte to find: zero
    cld                         ; scan toward increasing addresses
    repne scasb
    jnz terminator_missing      ; ZF=0: capacity exhausted without a match

    ; ZF=1: rdi is one byte past the matching zero
    mov r8, rdi
    sub r8, rbx
    dec r8                      ; character count excludes the terminator
    jmp scan_done

terminator_missing:
    mov r8, -1                  ; no terminator within the capacity

scan_done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

`scasb` sets flags for `al - [rdi]`, then advances `rdi`. The scan examines `h`, `e`, `l`, `l`,
`o`, and zero. On the match, `ZF=1`, `rcx=2`, and `rdi=text+6`, one byte past the terminator.
Subtracting the start gives six examined bytes; subtracting one more gives the five-character
length.

If all eight bytes were nonzero, the scan would finish with `rcx=0` and `ZF=0`. The immediate
`jnz` distinguishes that exhausted-input case from a match. A zero capacity is handled before the
scan because no comparison would run and there would be no new `ZF` result from `scasb`.

## Comparing two bounded byte sequences

`repe cmpsb` compares corresponding bytes while they are equal and a count remains. This example
has an explicit five-byte bound:

```x86|playground|no-flags
default rel
global _start

section .data
left:       db "stone"
right:      db "stove"
BYTE_COUNT  equ $ - right

section .text
_start:
    xor r8, r8                  ; result will be 0 or 1
    lea rsi, [rel left]
    lea rdi, [rel right]
    mov rcx, BYTE_COUNT
    cld
    repe cmpsb
    sete r8b                    ; 1 only if all five bytes matched

    mov rax, 60
    xor rdi, rdi
    syscall
```

`cmpsb` sets flags for `[rsi] - [rdi]`, then advances both pointers. The first three pairs match.
The fourth comparison is `n - v`, so `ZF=0`; repetition stops with `rcx=1` and both pointers one
byte past the differing pair. `r8` becomes zero. Two zero-length sequences count as equal, so that
path should set the result to 1 without executing `cmpsb`.

## Your turn

Each array below is nonempty and contains **unsigned qwords**. Walk each array with a pointer and
find its unsigned maximum. Leave the maxima in `r12` and `r13`. Preserve the final one-past-end
pointers in `r14` and `r15` before the exit setup.

```x86|playground|memory|exercise
default rel
global _start

section .data
values_a:       dq 4, 42, 15, 16, 23
values_a_end:
values_b:       dq 7, 0x8000000000000000, 12, 0xFFFFFFFFFFFFFFFE, 200, 5
values_b_end:

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r12": 42,
        "r13": "0xFFFFFFFFFFFFFFFE",
        "r14": "0x402028",
        "r15": "0x402058"
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
values_a:       dq 4, 42, 15, 16, 23
values_a_end:
values_b:       dq 7, 0x8000000000000000, 12, 0xFFFFFFFFFFFFFFFE, 200, 5
values_b_end:

section .text
_start:
    lea rsi, [rel values_a]
    lea rdx, [rel values_a_end]
    mov r12, [rsi]
    add rsi, 8

first_test:
    cmp rsi, rdx
    jae first_done
    mov rax, [rsi]
    cmp rax, r12
    jbe first_next            ; unsigned candidate <= current maximum
    mov r12, rax
first_next:
    add rsi, 8
    jmp first_test

first_done:
    mov r14, rsi

    lea rsi, [rel values_b]
    lea rdx, [rel values_b_end]
    mov r13, [rsi]
    add rsi, 8

second_test:
    cmp rsi, rdx
    jae second_done
    mov rax, [rsi]
    cmp rax, r13
    jbe second_next           ; unsigned candidate <= current maximum
    mov r13, rax
second_next:
    add rsi, 8
    jmp second_test

second_done:
    mov r15, rsi

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

Now copy the eight source bytes to `dest` with one `rep movsb`. The skeleton executes `std`
immediately before your code, so execute `cld` before the forward copy. Preserve the final `rsi`,
`rdi`, and `rcx` values in `r12`, `r13`, and `r14`.

```x86|playground|memory|exercise
default rel
global _start

section .data
source: db 1, 2, 3, 4, 5, 6, 7, 8
dest:   times 8 db 0

section .text
_start:
    std
    ; your code here

    mov r12, rsi
    mov r13, rdi
    mov r14, rcx
    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r12": "0x402008",
        "r13": "0x402010",
        "r14": 0
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402008",
            "bytes": 1,
            "expected": ["0x01", "0x02", "0x03", "0x04", "0x05", "0x06", "0x07", "0x08"]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
source: db 1, 2, 3, 4, 5, 6, 7, 8
dest:   times 8 db 0

section .text
_start:
    std
    cld                         ; this copy must move forward
    lea rsi, [rel source]
    lea rdi, [rel dest]
    mov rcx, 8
    rep movsb

    mov r12, rsi
    mov r13, rdi
    mov r14, rcx
    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
