The loops lecture walked an array with an index. This one is the other way of walking it, with a
pointer, and the family of instructions x86 has for moving bytes around that nothing else in this
editor has.

## An array is a label and a size

```x86|playground|memory|no-flags
default rel
global _start

section .data
numbers:    dq 4, 8, 15, 16, 23, 42
COUNT       equ ($ - numbers) / 8

section .text
_start:
    xor rax, rax                ; the total
    xor rcx, rcx                ; the index
.add:
    add rax, [numbers + rcx*8]  ; total += numbers[i]
    inc rcx
    cmp rcx, COUNT
    jb .add
    mov r8, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` comes out at `6C`, which is 108. `COUNT` is worked out by the assembler from the bytes the `dq`
line produced, so adding a seventh number to the list changes the answer without changing the loop.

## The same loop with a pointer

Instead of an index and a scale, keep the address of the next element and an address to stop at.

```x86|playground|no-flags
default rel
global _start

section .data
numbers:    dq 4, 8, 15, 16, 23, 42
numbers_end:

section .text
_start:
    lea rsi, [numbers]          ; p = numbers
    lea rdi, [numbers_end]      ; the address one past the last element
    xor rax, rax
.add:
    add rax, [rsi]              ; total += *p
    add rsi, 8                  ; p++, and the 8 is the size of an element
    cmp rsi, rdi
    jb .add                     ; while (p < end)
    mov r8, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

`numbers_end:` is a label with nothing under it, so it holds the address the next thing would have
gone at, which is one past the array. That is C's `numbers + 6`, the pointer you are allowed to
compare against and not to read.

Both loops do the same work. The index form is easier to read and lets you reach `numbers[i-1]` on
the way past; the pointer form is what the string instructions below need, because they only know how
to walk forwards.

## A string is bytes and a rule for where it ends

There is no string type. There are bytes, and a convention about which byte stops the reading.

```
text:   db "hello", 0           ; six bytes, C style, ending at the zero
fixed:  db "hello"              ; five bytes, and the length has to be kept elsewhere
LEN     equ $ - fixed
```

`db` with a quoted string writes one byte per character and nothing else, so the terminator is yours
to write. The MIPS and RISC-V assemblers have `.asciiz`, which adds it; NASM does not.

Walking one is a loop that stops on the zero:

```x86|playground|no-flags
default rel
global _start

section .data
text:   db "hello", 0

section .text
_start:
    lea rsi, [text]
    xor rcx, rcx                ; the length
.next:
    mov al, [rsi + rcx]         ; the byte at index rcx
    test al, al                 ; is it the terminator?
    jz .done
    inc rcx
    jmp .next
.done:
    mov r8, rcx

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` is 5. `test al, al` sets `ZF` when `al` is zero, which is the cheapest way x86 asks that
question.

## The string instructions

x86 has instructions that move one element from `[rsi]` to `[rdi]` and step both pointers as part of
doing it. They come in the four sizes, `b`, `w`, `d` and `q`, and the direction they step is `DF`:
`cld` clears it and they count upwards, `std` sets it and they count down.

| instruction | does                                                   |
| ----------- | ------------------------------------------------------ |
| `movsb`     | copy `[rsi]` to `[rdi]`, then step both                |
| `stosb`     | store `al` at `[rdi]`, then step `rdi`                 |
| `lodsb`     | load `[rsi]` into `al`, then step `rsi`                |
| `scasb`     | compare `al` with `[rdi]`, set the flags, step `rdi`   |
| `cmpsb`     | compare `[rsi]` with `[rdi]`, set the flags, step both |

None of them takes an operand: the registers are part of the instruction. What makes them worth
having is the **repeat prefixes**, which run the instruction `rcx` times without fetching it again:

- **`rep`** repeats `rcx` times. Used with `movs` and `stos`.
- **`repe`** repeats while the comparison says equal and `rcx` is not zero. Used with `cmps` and
  `scas`.
- **`repne`** repeats while it says not equal.

```x86|playground|memory|no-flags
default rel
global _start

section .data
source: db "hello", 0
        db "xxxxxxxxxx"
dest:   times 16 db 0

section .text
_start:
    cld                         ; count upwards

    lea rsi, [source]           ; copy six bytes from source
    lea rdi, [dest]             ; to dest
    mov rcx, 6
    rep movsb

    lea rdi, [dest + 8]         ; and fill four bytes with 'A'
    mov al, 'A'
    mov rcx, 4
    rep stosb

    mov rax, 60
    xor rdi, rdi
    syscall
```

Type `402010` into the memory panel, which is where `dest` starts. The sixteen bytes read

```
68 65 6C 6C 6F 00 00 00   41 41 41 41 00 00 00 00
```

`rep movsb` is `memcpy` in two bytes of code, and it is the fastest way to copy memory on a modern
x86 because the processor recognises the pattern and moves whole cache lines at a time.

## strlen in four instructions

`repne scasb` scans forward until the byte at `[rdi]` equals `al`, or until `rcx` runs out. Set `al`
to zero and `rcx` to something huge and it finds the terminator.

```x86|playground|no-flags
default rel
global _start

section .data
text:   db "hello", 0

section .text
_start:
    lea rdi, [text]
    xor al, al                  ; the byte being looked for
    mov rcx, -1                 ; the largest count there is
    cld
    repne scasb                 ; stop at the first zero

    not rcx                     ; how many it got through
    dec rcx                     ; minus the terminator itself
    mov r8, rcx

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` is 5. The arithmetic at the end is the awkward part: `rcx` counted **down** from `-1`, so `not
rcx` turns what is left into how many steps were taken, and the `dec` drops the terminator the scan
stopped on. Every C library's `strlen` for x86 has some version of those two lines.

Try changing `db "hello", 0` to a longer string and watch `r8` follow it.

## Your turn

`values` holds five qwords. Walk them with a **pointer**, not an index, and leave the largest of them
in `r8`. The answer is 42.

```x86|playground|memory|exercise
default rel
global _start

section .data
values:     dq 4, 42, 15, 16, 23
values_end:

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r8": 42 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
values:     dq 4, 42, 15, 16, 23
values_end:

section .text
_start:
    lea rsi, [values]
    lea rdi, [values_end]
    mov r8, [rsi]               ; the first one is the best so far
    add rsi, 8
.next:
    mov rax, [rsi]
    cmp rax, r8
    jbe .skip                   ; not bigger, so leave the best alone
    mov r8, rax
.skip:
    add rsi, 8
    cmp rsi, rdi
    jb .next

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one copies. `source` holds eight bytes and `dest` is eight zeroes. Copy the eight across
with one `rep movsb`, so that `dest` reads `01 02 03 04 05 06 07 08`.

```x86|playground|memory|exercise
default rel
global _start

section .data
source: db 1, 2, 3, 4, 5, 6, 7, 8
dest:   times 8 db 0

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x402008", "bytes": 8, "expected": ["0x0807060504030201"] }
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
    cld                     ; upwards
    lea rsi, [source]
    lea rdi, [dest]
    mov rcx, 8
    rep movsb

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
