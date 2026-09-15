A loop is a conditional jump that goes backwards. Everything the last lecture said about `cmp` and
`jcc` still holds; the only new thing is that the label is above the jump instead of below it.

## Testing at the top

The most familiar shape tests before it does anything, so a loop whose condition is false at the
start runs its body zero times. That needs two jumps: one at the top that leaves when the test fails,
and one at the bottom that goes back to the top unconditionally.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    xor rcx, rcx                ; the counter, starting at 0
.while:
    cmp rcx, 10
    jae .done                   ; leave once it reaches 10
    inc rcx                     ; the body
    jmp .while
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rcx` comes out at 10, one past the last value the body saw, which is where a counting loop always
leaves its counter.

Two small choices in there are worth copying. `jae` rather than `jge`, because a counter is never
negative and the unsigned question is the right one to ask about it. And `inc rcx` rather than
`add rcx, 1`, because `inc` is a byte shorter and leaves `CF` alone, which matters when the loop body
is adding numbers up with a carry running between passes.

`xor rcx, rcx` is the usual way of writing `mov rcx, 0`. It is shorter, and it is also one of the
patterns the processor recognises as producing a value that depends on nothing that came before, for
the reason "The 16 registers and their halves" went through.

## Testing at the bottom

Move the test to the bottom and the body always runs at least once, which is fine when you already
know there is at least one pass to do. That shape needs only one jump.

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
    jnz .body                   ; go again unless the count hit zero

    mov rax, 60
    xor rdi, rdi
    syscall
```

There is no `cmp` anywhere in that loop, and the absence is the point. `dec rcx` sets `ZF` itself when
its answer is zero, so the decrement has already asked the question the jump wants answered. A loop
that counts **down to zero** gets its test for free; a loop that counts up to a limit has to compare
against the limit every pass. That is why so much hand written assembly runs its passes backwards even
when the order does not matter.

## Walking an array

Counting from 0 to 9 is more useful when the counter doubles as an index.

```x86|playground|memory|no-flags
default rel
global _start

section .bss
numbers:    resq 10

section .text
_start:
    xor rcx, rcx                ; the index
.fill:
    mov rax, rcx
    inc rax                     ; the value to store, one more than the index
    mov [numbers + rcx*8], rax
    inc rcx                     ; on to the next
    cmp rcx, 10
    jb .fill

    mov rax, 60
    xor rdi, rdi
    syscall
```

Type `402000` into the memory panel and the ten qwords read 1 to 10, each one as eight little endian
bytes.

`[numbers + rcx*8]` is the whole of the indexing. The scale of 8 is the size of one element, and the
processor multiplies it out as part of working out the address, so there is no separate line turning
an index into an offset. Change the array to `resd 10`, the store to `mov [numbers + rcx*4], eax` and
the scale to 4, and the same loop fills dwords instead.

## The loop instruction

x86 has an instruction that is a countdown loop on its own. `loop label` decrements `rcx` and jumps to
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

Three things constrain it. The counter is always `rcx`, so a body that needs `rcx` for anything else
has to save it first. The jump it takes is a short one, reaching at most 127 bytes, so a long body
turns into a build error. And on current processors it is **slower** than the `dec` and `jnz` pair it
replaces, which is why compilers stopped emitting it decades ago. It is two bytes and it reads
clearly, but the loop in the section above is what production code looks like.

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
inner one, and moving it up two lines is all it takes to turn this into one flat loop that counts to
four and stops.

## Your turn

Add up the numbers from 1 to `rcx` and leave the total in `rax`. The test sets `rcx` to 10, so the
answer is 55. Guard the loop so that a count of zero leaves the total at zero instead of counting down
past it. The exit in this one carries the answer out in `rdi`, which is what the test reads.

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
