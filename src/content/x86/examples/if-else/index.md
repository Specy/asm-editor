The `cmp` and conditional-jumps lesson built an `if` with two paths. To find the larger of two
numbers, we can begin with one possible answer and change it only if the comparison calls for it.

Load `x` into `rax`. If signed `x >= y`, it is already the answer, so jump past the replacement.
Otherwise, let execution fall through to `mov rax, [y]`.

```x86|playground|allow-open
default rel
global _start

section .data
x:      dq 7
y:      dq 12

section .text
_start:
    mov rax, [x]            ; start with x as the answer
    cmp rax, [y]            ; set flags for x - y; leave rax unchanged
    jge .done               ; signed x >= y: keep x
    mov rax, [y]            ; otherwise choose y
.done:
    mov r8, rax             ; keep the answer for inspection

    mov rax, 60
    xor rdi, rdi
    syscall
```

With `x = 7` and `y = 12`, `cmp` sets flags for `7 - 12 = -5`: `SF = 1` because the result is
negative, and `OF = 0` because this subtraction did not overflow the signed qword range. `jge`
checks whether `SF = OF`. Here they differ, so execution falls through and loads 12 into `rax`.
The copy to `r8` matters because the exit syscall setup then replaces `rax` with 60. Try swapping
the two data values: `jge` is taken, so the replacement is skipped and `r8` holds 12 again.

The dot makes `.done` a NASM local label under `_start`. You can jump to `.done` from this part of
`_start`; after another ordinary label, a `.done` there would be a separate label. The jump lands
at `mov r8, rax`, which both paths must run.

These are signed qwords, so the jump is `jge` (greater or equal), not `jae` (above or equal).
Try `x: dq -1` with `y: dq 12`: signed -1 is smaller, and `r8` becomes 12. If you change only
`jge` to `jae`, the same bits in -1 count as a very large unsigned number, and `r8` becomes -1.
The comparison sets flags for both interpretations; the jump chooses which one to use.

The `cmp rax, [y]` form reads `y` directly from memory. Like the earlier `mov` examples, this
two-operand instruction cannot take both values from memory. Loading `x` into `rax` first gives
`cmp` a register operand and also establishes the first possible answer.

## Your turn

Write the one-branch version for the signed qwords `left` and `right` below. Leave the larger value
in `r8` before the exit code runs. Start by loading `left` as your possible answer, compare it with
`right`, and replace it only when `right` is larger. Keep `cmp` next to its conditional jump so the
jump reads the flags you intended.

For the supplied values, predict `r8`, then use **Test**: it expects `r8 = 3`. Afterward, change
the data yourself and check `r8` in the register panel: `left = 14, right = 3` should give 14;
`left = 3, right = 3` should give 3; and `left = -5, right = -2` should give -2. The last case
checks that the comparison remains signed when both values are negative.

```x86|playground|exercise
default rel
global _start

section .data
left:  dq -5
right: dq 3

section .text
_start:
    ; Leave the larger signed value in r8.

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r8": 3
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .data
left:  dq -5
right: dq 3

section .text
_start:
    mov r8, [left]
    cmp r8, [right]
    jge .max_done
    mov r8, [right]
.max_done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
