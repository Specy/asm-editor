There are two ways to get from one element of an array to the next. You can count, and work out an
address from the count every time. Or you can keep the address itself and move it along. Both are
written here, because x86 has a family of instructions that only works with the second.

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
    add rax, [numbers + rcx*8]  ; add element number rcx
    inc rcx
    cmp rcx, COUNT
    jb .add
    mov r8, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

The loop never mentions the number six. `COUNT` is worked out by the assembler from the bytes the
`dq` line actually produced, so adding a seventh number to the list changes the answer and nothing
else.

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
    lea rsi, [numbers]          ; the address of the first element
    lea rdi, [numbers_end]      ; and of one past the last
    xor rax, rax
.add:
    add rax, [rsi]              ; add whatever rsi is pointing at
    add rsi, 8                  ; and step it on by one element
    cmp rsi, rdi
    jb .add                     ; until it reaches the end
    mov r8, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

`numbers_end:` is a label with nothing under it, so it holds the address the next item would have gone
at, which is one byte past the end of the array. It is an address you compare against and never read
from, and having the assembler work it out means the loop stays right when the array changes size.

Both loops do the same work. The index form is easier to read and lets you look back at the previous
element on the way past. The pointer form is what the string instructions below need, because they
have no notion of an index at all.

## A string is bytes and a rule for where it ends

There is no string type. There are bytes, and a convention about which byte stops the reading.

```
text:   db "hello", 0           ; six bytes, C style, ending at the zero
fixed:  db "hello"              ; five bytes, and the length has to be kept elsewhere
LEN     equ $ - fixed
```

A quoted string in a `db` line is one byte per character and nothing else. NASM will not add a
terminator for you, so if the code that reads the string is going to stop at a zero, the zero has to
be in the `db` line where you can see it.

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

The stopping condition is one instruction. `test al, al` sets `ZF` when `al` is zero and writes no
register, so the byte just loaded is examined and left exactly as it was.

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

`rep movsb` copies a block of memory in two bytes of code, and on a current processor it is the
fastest way to do it. The hardware recognises the pattern and moves whole cache lines at a time
rather than genuinely repeating a one byte copy `rcx` times.

## Finding the end of a string in four instructions

`repne scasb` scans forward until the byte at `[rdi]` equals `al`, or until `rcx` runs out. Set `al`
to zero and `rcx` to something huge and it stops on the terminator.

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

`r8` is 5, and the two lines that got it there deserve taking apart, because `not` followed by `dec`
looks like nothing at all to do with counting.

`rcx` started at -1, which is `FFFFFFFFFFFFFFFF`, every bit set. The repeat prefix takes one off it
per byte examined. So after the scan has looked at `k` bytes, `rcx` holds `-1 - k`:

| bytes examined | the byte | `rcx` afterwards   | as a number |
| -------------- | -------- | ------------------ | ----------- |
| 0              |          | `FFFFFFFFFFFFFFFF` | -1          |
| 1              | `h`      | `FFFFFFFFFFFFFFFE` | -2          |
| 2              | `e`      | `FFFFFFFFFFFFFFFD` | -3          |
| 3              | `l`      | `FFFFFFFFFFFFFFFC` | -4          |
| 4              | `l`      | `FFFFFFFFFFFFFFFB` | -5          |
| 5              | `o`      | `FFFFFFFFFFFFFFFA` | -6          |
| 6              | the zero | `FFFFFFFFFFFFFFF9` | -7          |

The count you want is in there, upside down. Getting it out is where `not` comes in, and the reason it
works is two's complement: flipping every bit of a number `n` gives you `-n - 1`. Flipping `-1 - k`
therefore gives `-(-1 - k) - 1`, which is just `k`. The scan looked at six bytes, so `not rcx` leaves 6.

Six is one too many, because the last of those six was the terminator and the terminator is not part
of the string. That is the `dec`. Five characters, which is what `r8` shows.

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
