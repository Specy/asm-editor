A loop is a conditional jump that goes backwards. Everything the last lecture said about `cmp` and
`jcc` still holds, and this lecture is the three shapes a loop comes in and the one instruction x86
has that is a loop on its own.

## while

```c
int i = 0;
while (i < 10) {
    i++;
}
```

The flattened form tests at the top and jumps out when the test fails:

```c
    i = 0;
while_start:
    if (i >= 10) goto while_end;
    i++;
    goto while_start;
while_end:
```

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    xor rcx, rcx                ; i = 0
.while:
    cmp rcx, 10
    jae .done                   ; if (i >= 10) goto done, unsigned
    inc rcx                     ; i++
    jmp .while
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rcx` comes out at 10. `xor rcx, rcx` is how x86 writes `mov rcx, 0`: it is shorter, and the
processor recognises it as "this register now depends on nothing".

`jae` and not `jge`, because a counter is never negative and unsigned is the right question to ask
about it. `inc rcx` and not `add rcx, 1`, because it is one byte shorter and it leaves `CF` alone,
which matters when the loop body is adding things up with a carry.

## do while

A `do while` tests at the bottom, so it runs its body at least once and needs one jump instead of
two.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rcx, 5                  ; the count
    xor rax, rax                ; the total
.body:
    add rax, rcx                ; total += count
    dec rcx                     ; count--
    jnz .body                   ; while (count != 0)

    mov rax, 60
    xor rdi, rdi
    syscall
```

`dec rcx` sets `ZF` when the answer is zero, so `jnz` needs no `cmp` at all: the decrement has
already asked the question. Counting **down to zero** instead of up to a limit is the usual shape in
assembly for exactly this reason, and it is why a hand written loop often runs its passes backwards.

## for, over an array

A `for` over an array keeps an index and uses it to reach the elements.

```c
for (int i = 0; i < 10; i++) {
    numbers[i] = i + 1;
}
```

```x86|playground|memory|no-flags
default rel
global _start

section .bss
numbers:    resq 10

section .text
_start:
    xor rcx, rcx                ; i = 0
.fill:
    mov rax, rcx
    inc rax                     ; the value to store, i + 1
    mov [numbers + rcx*8], rax  ; numbers[i] = i + 1
    inc rcx                     ; i++
    cmp rcx, 10
    jb .fill                    ; while (i < 10)

    mov rax, 60
    xor rdi, rdi
    syscall
```

Type `402000` into the memory panel and the ten qwords read 1 to 10, each one as eight little endian
bytes.

`[numbers + rcx*8]` is the whole of the indexing: the scale of 8 is the size of one element, and the
processor multiplies it out as part of forming the address. Try changing the array to `resd 10`, the
store to `mov [numbers + rcx*4], eax` and the scale to 4, and the same loop fills dwords.

## The loop instruction

x86 has an instruction that is a countdown loop by itself. `loop label` decrements `rcx` and jumps to
`label` if the answer is not zero.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rcx, 5                  ; loop reads this and nothing else
    xor rax, rax
.sum:
    add rax, rcx
    loop .sum                   ; rcx--, and go again while rcx != 0

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rax` comes out at 15, which is 5 + 4 + 3 + 2 + 1.

Three things about it. The counter is always `rcx`, so a loop body that needs `rcx` for something
else has to save it. The jump it takes is a short one, reaching at most 127 bytes away, so a long
body makes it a build error. And on modern processors it is **slower** than the `dec` and `jnz` pair
it replaces, which is why compilers stopped emitting it decades ago. It is two bytes, it reads
clearly, and the previous playground is what production code looks like.

## Nested loops

An inner loop needs its own counter, since the outer one is still counting.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    xor rax, rax                ; the total
    xor rcx, rcx                ; the outer counter
.outer:
    xor rdx, rdx                ; the inner counter, reset every time round
.inner:
    inc rax
    inc rdx
    cmp rdx, 4
    jb .inner
    inc rcx
    cmp rcx, 3
    jb .outer

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rax` comes out at 12, three times four. The `xor rdx, rdx` is inside the outer loop and outside the
inner one, which is the only thing that makes it a nested loop instead of one long one.

## Your turn

Add up the numbers from 1 to `rcx` and leave the total in `rax`. The test sets `rcx` to 10, so the
answer is 55. Guard the loop so that a count of zero leaves the total at zero instead of counting
down past it.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rdi, rax
    mov rax, 60
    syscall
```

```testcase
{
    "startingRegisters": { "rcx": 10 },
    "expectedRegisters": { "rdi": 55 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    xor rax, rax
    test rcx, rcx
    jz .done            ; a count of zero adds nothing, and skipping the test
.sum:                   ; here is what stops dec from wrapping round to -1
    add rax, rcx        ; total += count
    dec rcx
    jnz .sum            ; while the count has not reached zero
.done:

    mov rdi, rax
    mov rax, 60
    syscall
```

</details>

The second one walks memory. `values` holds six qwords; leave their total in `r8`, which is 120.

```x86|playground|memory|exercise
default rel
global _start

section .data
values: dq 4, 8, 15, 16, 23, 54

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r8": 120 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
values: dq 4, 8, 15, 16, 23, 54

section .text
_start:
    xor r8, r8              ; the total
    xor rcx, rcx            ; the index
.add:
    add r8, [values + rcx*8]
    inc rcx
    cmp rcx, 6
    jb .add

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
