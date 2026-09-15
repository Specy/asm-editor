Sixteen registers is not many. Sooner or later you need one that is already holding something you
still want, and the value has to go somewhere until you are finished. Picking an address in memory
by hand and remembering it works, right up until two pieces of code pick the same address. The stack
is the arrangement that makes that impossible, and x86 has two instructions that do the whole of it.

## rsp, and downwards

`rsp` holds the address of the value on top of the stack, and the stack **grows downwards**: a push
subtracts from `rsp` and then writes, a pop reads and then adds.

- **`push rax`** is `sub rsp, 8` followed by `mov [rsp], rax`.
- **`pop rax`** is `mov rax, [rsp]` followed by `add rsp, 8`.

Always 8, because a push in 64 bit mode is always a qword. `push ax` for two bytes is a form and
`push eax` is not, so in practice everything on the stack is eight bytes wide.

```x86|playground|memory|no-flags
default rel
global _start

section .text
_start:
    mov rax, 0x1111111111111111
    mov rbx, 0x2222222222222222

    push rax                    ; down 8 and write
    push rbx                    ; down 8 and write

    pop rcx                     ; read and up 8
    pop rdx                     ; read and up 8

    mov rax, 60
    xor rdi, rdi
    syscall
```

Step through it with the **Stack** tab of the memory panel in view. Before the first push, `rsp`
holds `0x4FFFFFFFFED0` and the stack already has something on it (🟢 is the stack pointer):

|          address |        value        |
| ---------------: | :-----------------: |
| `0x4FFFFFFFFEC0` |  0000000000000000   |
| `0x4FFFFFFFFEC8` |  0000000000000000   |
| `0x4FFFFFFFFED0` | 🟢 0000000000000001 |

That `1` is the number of command line arguments the program was started with, and the qword above it
is the address of the program's own name. Linux puts them there before it starts you, which is why
the stack has something on it before your first instruction runs.

`push rax` drops `rsp` to `0x4FFFFFFFFEC8` and writes:

|          address |        value        |
| ---------------: | :-----------------: |
| `0x4FFFFFFFFEC0` |  0000000000000000   |
| `0x4FFFFFFFFEC8` | 🟢 1111111111111111 |
| `0x4FFFFFFFFED0` |  0000000000000001   |

`push rbx` drops it another 8 and writes underneath:

|          address |        value        |
| ---------------: | :-----------------: |
| `0x4FFFFFFFFEC0` | 🟢 2222222222222222 |
| `0x4FFFFFFFFEC8` |  1111111111111111   |
| `0x4FFFFFFFFED0` |  0000000000000001   |

Then the two pops read them back in the other order, so `rcx` gets `2222222222222222` and `rdx` gets
`1111111111111111`, and `rsp` climbs back to `0x4FFFFFFFFED0`. Last in, first out.

Both values are still in memory after the pops. Popping moves `rsp` and erases nothing, which is why
the region below `rsp` is not yours: the next `push`, `call` or signal writes over it without asking.

## One subtraction, several slots

A push is one instruction, but `sub rsp, 24` once and three stores at offsets is the shape a
subroutine uses, because the slots then stay in one place while the body runs.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    sub rsp, 24                 ; room for three qwords

    mov qword [rsp], 1          ; the first slot
    mov qword [rsp + 8], 2      ; the second
    mov qword [rsp + 16], 3     ; the third

    mov r8, [rsp + 8]           ; read one back

    add rsp, 24                 ; and give the room back

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` comes out at 2. The `add rsp, 24` at the end is not optional. `ret` takes whatever `rsp` points
at and puts it in `rip`, so a subroutine that forgets to give its room back returns to one of its own
local values instead of to its caller.

## Saving registers across something

The reason a push exists is to hold a register while you need it for something else.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rbx, 100
    mov r12, 200

    push rbx                    ; hold both
    push r12

    mov rbx, 0xFF               ; now destroy them
    mov r12, 0xFF

    pop r12                     ; and take them back, in reverse order
    pop rbx

    mov rax, 60
    xor rdi, rdi
    syscall
```

Both registers end at the values they started with. The pops are in the opposite order to the
pushes, always: the stack hands back what was put on it last.

## What else moves rsp

`push` and `pop` are not the only instructions that write `rsp`.

- **`call`** pushes the address of the instruction after it, then jumps.
- **`ret`** pops that address into `rip`.
- **`pushfq`** and **`popfq`** move the flags register.
- A **signal** delivered by the kernel writes a whole block below `rsp` without warning.

So everything on the stack is shared with the machinery of calling, and that is what the next lecture
is about.

One more rule comes not from the hardware but from the agreement programs follow when they call each
other: **`rsp` should be a multiple of 16** at the moment a `call` happens. Nothing checks it, and
nothing in this course goes wrong when it is broken, but code compiled by somebody else is entitled to
assume it and some instructions fault outright on a misaligned address. `_start` begins with `rsp` a
multiple of 16, and every push moves it by 8, so the count of pushes between there and a call is what
decides whether the rule still holds.

## Your turn

`rbx` and `r12` hold two numbers. Swap them using the stack and nothing else, no third register and
no `xchg`. The test gives 11 and 22.

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
    "startingRegisters": { "rbx": 11, "r12": 22 },
    "expectedRegisters": { "rbx": 22, "r12": 11 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    push rbx            ; 11 goes on
    push r12            ; 22 goes on top of it
    pop rbx             ; and 22 comes off first
    pop r12

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one makes room. Reserve 32 bytes on the stack, write 7 into the qword at offset 8 and 9
into the one at offset 24, read them back into `r8` and `r9`, and give the room back so that `rsp`
ends where it started. The test checks `r8`, `r9` and `rsp`.

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
    "expectedRegisters": { "r8": 7, "r9": 9, "rsp": "0x4FFFFFFFFED0" }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    sub rsp, 32                 ; the room
    mov qword [rsp + 8], 7
    mov qword [rsp + 24], 9
    mov r8, [rsp + 8]
    mov r9, [rsp + 24]
    add rsp, 32                 ; and back to where rsp was

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
