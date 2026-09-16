# Loops

A loop repeats a body while a condition allows another pass. In assembly, the parts that a
high-level language writes as `while` or `for` are separate instructions and labels.

Consider this loop:

```c
while (index < limit) {
    do_something();
    index++;
}
```

Its control flow can be written with labels and jumps:

```text
loop_test:
    if index >= limit, go to loop_done
    do_something
    increase index
    go back to loop_test
loop_done:
```

This shape has five parts:

- the **condition** is tested before each pass;
- the **body** does the repeated work;
- the **state update** changes a value used by the condition;
- the **backward edge** jumps to an earlier label;
- the **exit** is where execution continues when the condition is false.

The update is essential. Every path through the body that returns to the test must change the
controlling state so that the condition can eventually become false. If one path jumps back without
doing that, the loop can repeat forever.

## Testing before the body

Here is the same pre-tested shape with an unsigned qword counter. The body sees the values 0 through
9:

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    xor rcx, rcx                ; index = 0

loop_test:
    cmp rcx, 10
    jae loop_done               ; unsigned index >= 10: leave the loop

    ; body: rcx is an index from 0 through 9
    inc rcx                     ; state update
    jmp loop_test               ; backward edge

loop_done:
    ; Immediately before exit setup, rcx is 10.
    mov rax, 60
    xor rdi, rdi
    syscall
```

Keep `cmp` beside the conditional jump that reads its flags. Starting from 0, the first comparison
allows entry. The body sees 0, updates `rcx` to 1, and jumps back. After the body sees 9, the update
makes `rcx` equal to 10. The next `cmp` makes `jae` take the exit. For this upward loop, the counter
is one past the final body value immediately before the exit setup.

A pre-tested loop can also run zero times. If `rcx` starts at 10, the first `cmp rcx, 10` makes
`jae loop_done` jump immediately. The body and its `inc` do not run, so `rcx` is still 10 at
`loop_done`.

## Counting down at the bottom

When a count is known to be positive, the body can run before the test. This example adds
`5 + 4 + 3 + 2 + 1`:

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rcx, 5                  ; a known positive count
    xor rax, rax                ; total = 0

countdown_body:
    add rax, rcx
    dec rcx                     ; state update; also sets ZF
    jnz countdown_body          ; repeat while rcx is not zero

countdown_done:
    ; Immediately before exit setup, rax is 15 and rcx is 0.
    mov rax, 60
    xor rdi, rdi
    syscall
```

The body runs with `rcx` equal to 5, 4, 3, 2, and 1. Each `dec` supplies the `ZF` value consumed by
the adjacent `jnz`. After processing 1, `dec` changes `rcx` to 0, sets `ZF`, and `jnz` falls through.
Unlike the upward example, this countdown finishes with its counter at zero.

This bottom-tested `dec`/`jnz` form requires a nonzero initial count. If `rcx` starts at zero, the
body still runs once. The `dec` then wraps the qword to all ones:
`0xFFFFFFFFFFFFFFFF`, which is unsigned `2^64 - 1` and signed `-1`. `jnz` jumps back, and the loop
continues through the enormous wrapped count.

When zero is a valid input, guard the body with a test at the top:

```x86
    test rcx, rcx
    jz countdown_done

countdown_body:
    ; body
    dec rcx
    jnz countdown_body

countdown_done:
```

The first pair handles zero before the body. For a positive count, the bottom pair performs the
remaining tests. Both flag-producing instructions stay next to the jumps that use their flags.

## Walking an array

A loop counter can also be an array index. This loop fills ten qwords with the values 1 through 10:

```x86|playground|memory|no-flags
default rel
global _start

section .bss
numbers:    resq 10

section .text
_start:
    lea rbx, [rel numbers]      ; base address of the array
    xor rcx, rcx                ; zero-based index

fill_test:
    cmp rcx, 10
    jae fill_done

    mov rax, rcx
    inc rax                     ; value = index + 1
    mov [rbx + rcx*8], rax      ; store one qword
    inc rcx                     ; advance to the next element
    jmp fill_test

fill_done:
    ; Immediately before exit setup, rcx is 10 and the array holds 1 through 10.
    mov rax, 60
    xor rdi, rdi
    syscall
```

`lea rbx, [rel numbers]` first calculates the position-independent address of the array. The memory
operand `[rbx + rcx*8]` then combines that base address with the index. Its scale is 8 because each
qword occupies eight bytes. A dword array would use a scale of 4 and a dword-sized store.

The pre-test also defines the empty case. If the length were zero, the first comparison would jump
to `fill_done` before any memory access.

## Nested loops

A nested loop has two pieces of controlling state. The inner counter must be initialized once for
every outer pass:

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    xor rax, rax                ; number of inner-body executions
    xor rcx, rcx                ; outer counter

outer_body:
    xor rdx, rdx                ; reset the inner counter for this outer pass

inner_body:
    inc rax
    inc rdx
    cmp rdx, 4
    jb inner_body

    inc rcx
    cmp rcx, 3
    jb outer_body

    mov r12, rax                ; keep the result across the exit setup
    mov rax, 60
    xor rdi, rdi
    syscall
```

On each outer pass, `rdx` starts at 0 and the inner body advances it through 1, 2, 3, and 4. The
inner body therefore runs four times. `rcx` advances once after each completed inner loop, so three
outer passes produce 12 inner-body executions and leave 12 in `r12`.

Reset placement determines which loop owns the initialization. If `xor rdx, rdx` were moved above
`outer_body`, it would run only once. The first inner loop would take `rdx` from 0 to 4. Because this
inner loop tests at the bottom, the second outer pass would still enter the inner body once, taking
`rdx` from 4 to 5, and the third would take it from 5 to 6. That changed program would leave 6 in
`r12`, not 12.

## Your turn

Add the integers from 1 through each supplied unsigned count. The three inputs are in `r8`, `r9`,
and `r10`; put their corresponding totals in `r12`, `r13`, and `r14`. Use a guarded countdown loop
for each input so a zero count skips the body. The tested pairs are `0 → 0`, `4 → 10`, and
`10 → 55`.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "startingRegisters": {
        "r8": 0,
        "r9": 4,
        "r10": 10
    },
    "expectedRegisters": {
        "r12": 0,
        "r13": 10,
        "r14": 55
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
    xor r12, r12
    mov rcx, r8
    test rcx, rcx
    jz first_sum_done
first_sum_body:
    add r12, rcx
    dec rcx
    jnz first_sum_body
first_sum_done:

    xor r13, r13
    mov rcx, r9
    test rcx, rcx
    jz second_sum_done
second_sum_body:
    add r13, rcx
    dec rcx
    jnz second_sum_body
second_sum_done:

    xor r14, r14
    mov rcx, r10
    test rcx, rcx
    jz third_sum_done
third_sum_body:
    add r14, rcx
    dec rcx
    jnz third_sum_body
third_sum_done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

Now walk the six-qword array in order. Leave the total in `r8` and the final index in `r9`. The
final index should equal the number of elements processed.

```x86|playground|memory|exercise
default rel
global _start

section .data
values: dq 13, 7, 29, 4, 18, 11

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
        "r8": 82,
        "r9": 6
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
values: dq 13, 7, 29, 4, 18, 11

section .text
_start:
    lea rbx, [rel values]
    xor r8, r8                  ; total
    xor r9, r9                  ; index

array_test:
    cmp r9, 6
    jae array_done
    add r8, [rbx + r9*8]
    inc r9
    jmp array_test

array_done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
