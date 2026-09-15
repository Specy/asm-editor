An instruction that adds two numbers produces more than a sum. It also knows whether the answer was
zero, whether it was negative, and whether it was too big to fit in the register it went into. All of
that would be thrown away if there were nowhere to put it, so there is somewhere: a register of
single bits called `rflags`, which the panel shows as its own row above the registers.

## The row

Five of those bits do nearly all the work.

| flag | set when                                                                             |
| ---- | ------------------------------------------------------------------------------------ |
| `CF` | the **unsigned** answer did not fit: an addition carried out, a subtraction borrowed |
| `ZF` | the answer was zero                                                                  |
| `SF` | the top bit of the answer is set, so read as signed it is negative                   |
| `OF` | the **signed** answer did not fit                                                    |
| `DF` | the string instructions should count downwards instead of up                         |

`DF` is the odd one in that list: no arithmetic touches it, `cld` clears it, `std` sets it, and only
the string instructions ever read it. The other four are written by nearly everything and read by the
conditional jumps.

The panel shows three more bits. `PF` is set when the low byte of the answer has an even number of
set bits, a parity check left over from serial communication, and it comes back once in this course
when floating point numbers are compared. `AF` records a carry out of bit 3 and is read only by the
decimal arithmetic instructions, which nothing here uses. `TF` is the trap flag, which a debugger
sets to make the processor stop after every instruction; the Step button here is the emulator
stopping, not that.

## Who writes them

- **`add`, `sub`, `neg`, `and`, `or`, `xor`, the shifts** write the flags as a side effect of doing
  their real work.
- **`cmp` and `test`** exist only to write them. `cmp a, b` subtracts and throws the answer away;
  `test a, b` ands and throws the answer away.
- **`inc` and `dec`** write every flag except `CF`, which they deliberately leave alone so that a
  loop can count without disturbing a carry the loop body is keeping.
- **`mov`, `lea`, `push`, `pop` and the jumps** write no flags at all.

That last line is what makes the whole arrangement usable. A flag survives until something writes it,
so you can `cmp`, do a `mov` or two, and still read the answer to the comparison afterwards.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 5
    sub rax, 5              ; zero: ZF goes to 1
    mov rbx, 3
    sub rbx, 5              ; -2: SF and CF go to 1, ZF back to 0
    mov rcx, 1
    mov rdx, 2              ; mov writes no flags, so the row does not move
    add rcx, rdx            ; 3: everything back to 0

    mov rax, 60
    mov rdi, 0
    syscall
```

Press **Step** through it with the flags row in view. `ZF` lights after the first `sub` and goes out
after the second, where `SF` and `CF` light instead: `CF` because 3 minus 5 borrowed, `SF` because the
answer `FFFFFFFFFFFFFFFE` has its top bit set. The two `mov` lines change nothing in the row at all.

## cmp and test

`cmp rax, rbx` computes `rax - rbx`, sets the flags from the answer, and writes no register anywhere.
The comparison you wanted is then read out of the flags:

| written              | true when                |
| -------------------- | ------------------------ |
| `cmp a, b` then `je` | a equals b               |
| `cmp a, b` then `jb` | a is below b, unsigned   |
| `cmp a, b` then `jl` | a is less than b, signed |

Read it left to right. `cmp rax, rbx` followed by `jl` jumps when `rax < rbx`, with the operands in
the order the question is asked in.

`test rax, rbx` does the same with an AND instead of a subtraction. Its two usual forms are

```
    test rax, rax           ; is rax zero? ZF says so
    test rcx, 1             ; is the lowest bit set? ZF is 0 if it is
```

`test rax, rax` looks strange the first time. A number ANDed with itself is itself, so the instruction
computes nothing new; all it does is set the flags from the value already in `rax`, and `ZF` then
answers "is this zero". It is a byte shorter than `cmp rax, 0` and it is what x86 code writes.

```x86|playground
default rel
global _start

section .text
_start:
    mov rcx, 0x80
    test rcx, 0x80          ; bit 7 is set, so the and is not zero: ZF = 0
    test rcx, 0x01          ; bit 0 is clear, so the and is zero: ZF = 1
    xor rax, rax            ; a register exclusive-ored with itself is zero
    test rax, rax           ; zero: ZF = 1 and nothing was written

    mov rax, 60
    mov rdi, 0
    syscall
```

Step through and watch `ZF` alone. `rcx` never changes, because `test` writes no register.

## Why "less than" is SF against OF

Here is the piece that every table states and nobody explains. The condition `jl` uses is not "`SF` is
set". It is "**`SF` is not `OF`**", and it is worth seeing why, because the reason is the same reason
signed and unsigned comparisons have to be different instructions.

Work it on bytes, where the numbers are small enough to hold in your head. A signed byte runs from
-128 to 127. `cmp al, bl` subtracts `bl` from `al` and keeps the flags.

Start with the easy pair.

| `al`   | `bl`   | subtraction | true answer | byte kept | `SF` | `OF` |
| ------ | ------ | ----------- | ----------- | --------- | ---- | ---- |
| `0x05` | `0x03` | 5 - 3       | 2           | `0x02`    | 0    | 0    |
| `0x03` | `0x05` | 3 - 5       | -2          | `0xFE`    | 1    | 0    |

Nothing overflowed in either row, so the answer came out with its real sign, and `SF` alone tells you
which number was bigger. If every subtraction behaved like this, `jl` could just read `SF`.

Now the pair that breaks it.

| `al`   | `bl`   | subtraction  | true answer | byte kept | `SF` | `OF` |
| ------ | ------ | ------------ | ----------- | --------- | ---- | ---- |
| `0x9C` | `0x64` | -100 - 100   | -200        | `0x38`    | 0    | 1    |
| `0x64` | `0x9C` | 100 - (-100) | 200         | `0xC8`    | 1    | 1    |

Follow the first of those two. -100 really is less than 100, and the true answer, -200, really is
negative. But -200 does not fit in a signed byte, so what the processor keeps is `0x38`, which is 56,
and its top bit is **clear**. `SF` came out 0 for a subtraction whose real answer was negative. `SF`
is lying, and `OF` is set precisely to say so.

The row under it is the same accident pointing the other way: 200 does not fit either, the byte kept
is `0xC8` with its top bit set, and `SF` says negative about an answer that was positive.

So the rule writes itself. `SF` tells you the sign of the answer that survived. `OF` tells you whether
that sign is trustworthy. When `OF` is 0, believe `SF`. When `OF` is 1, believe the opposite of `SF`.
Both cases together are exactly "`SF` is different from `OF`", and that is `jl`.

```x86|playground
default rel
global _start

section .text
_start:
    mov al, -100
    mov bl, 100
    cmp al, bl              ; -100 is less than 100: SF 0, OF 1

    mov al, 100
    mov bl, -100
    cmp al, bl              ; and this way round: SF 1, OF 1

    mov rax, 60
    mov rdi, 0
    syscall
```

Step through it and read `SF` and `OF` off the panel after each `cmp`. They differ after the first one
and match after the second, and in both cases the answer sitting in `al` has the wrong sign on it.

Every other signed condition is built out of those two flags and `ZF` in the same way, and you never
have to work any of them out again: `jl` and `jg` and the rest already contain the reasoning above.

## Signed and unsigned ask different questions

The same `cmp` sets `CF` for the unsigned reading and `SF` with `OF` for the signed one. You choose
which pair the processor looks at by choosing the jump.

| unsigned | signed | means                                        |
| -------- | ------ | -------------------------------------------- |
| `jb`     | `jl`   | below, less                                  |
| `jbe`    | `jle`  | below or equal, less or equal                |
| `ja`     | `jg`   | above, greater                               |
| `jae`    | `jge`  | above or equal, greater or equal             |
| `je`     | `je`   | equal, which is the same question either way |

`0xFFFFFFFFFFFFFFFF` is -1 read as signed and the largest number there is read as unsigned. So "is it
bigger than 1" has two correct answers, and the instruction you write picks which one you get.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, -1             ; FFFFFFFFFFFFFFFF
    mov rbx, 1
    cmp rax, rbx            ; one comparison

    setg r8b                ; signed: -1 > 1 is false, so 0
    seta r9b                ; unsigned: a huge number > 1 is true, so 1

    mov rax, 60
    mov rdi, 0
    syscall
```

One `cmp`, two answers, and neither instruction had to be told what kind of number was in `rax`.

## Your turn

`rax` holds a number. Leave 1 in `bl` if it is zero and 0 if it is not, using `test` and a `setcc`.
The test starts `rax` at 0 and `rbx` at `0xFF`, so a correct answer leaves `rbx` at 1.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    mov rdi, 0
    syscall
```

```testcase
{
    "startingRegisters": { "rax": 0, "rbx": "0xFF" },
    "expectedRegisters": { "rbx": 1 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    test rax, rax       ; ZF = 1 when rax is zero
    sete bl             ; and sete reads exactly that

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>

The second one is the signed and unsigned trap. `rax` and `rbx` hold `0xFFFFFFFFFFFFFFFF` and `1`.
Leave the **unsigned** answer to "is `rax` below `rbx`" in `cl` and the **signed** answer to "is `rax`
less than `rbx`" in `dl`. The unsigned answer is 0 and the signed answer is 1.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    mov rdi, 0
    syscall
```

```testcase
{
    "startingRegisters": { "rax": "0xFFFFFFFFFFFFFFFF", "rbx": 1, "rcx": "0xFF", "rdx": "0xFF" },
    "expectedRegisters": { "rcx": 0, "rdx": 1 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    cmp rax, rbx        ; one comparison answers both
    setb cl             ; unsigned below: 0
    setl dl             ; signed less: 1

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>
