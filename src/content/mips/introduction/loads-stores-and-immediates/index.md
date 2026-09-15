An operand can be written in three different ways, and which one you used is called the operand's
**addressing mode**. Three is the whole list:

| mode             | written  | what the CPU does with it                          |
| ---------------- | -------- | -------------------------------------------------- |
| register         | `$t0`    | reads the register                                 |
| immediate        | `7`      | reads the number out of the instruction            |
| base plus offset | `4($t0)` | adds 4 to `$t0` and goes to memory at that address |

The first two hand the CPU a value it already has. The third hands it an address, and only a load or
a store is allowed to use it.

## Arithmetic never reaches memory

MIPS is a **load/store architecture**, and the phrase means exactly one thing: `lw`, `lh`, `lb`,
`lbu`, `lhu`, `sw`, `sh` and `sb` are the only instructions that touch memory. Every other
instruction in the machine reads registers and writes registers, full stop.

So a program that works on data in memory always has the same three steps in it. Load the value into
a register, do the arithmetic there, store the answer back.

Three steps for something that sounds like one is a deliberate trade. A load may take many cycles,
because it might have to wait on memory, and an `add` takes one. Keeping them in separate
instructions means the slow thing is visible in the program, so a compiler can start the load early
and fill the wait with useful work, instead of every arithmetic instruction having to be prepared
for a long stall.

## offset(base)

`lw $t3, 4($t2)` reads the word at the address `$t2 + 4`. The register is the **base**, the number is
the **offset** in bytes, and the offset is a signed 16 bit constant the assembler puts inside the
instruction. That is the whole mode: one register, one constant, added while the instruction runs.

```mips|playground|memory
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li $t0, 7               # immediate
    move $t1, $t0           # register
    la $t2, numbers         # the address of the label, nothing read
    lw $t3, 0($t2)          # the first element
    lw $t4, 4($t2)          # the second
    addi $t7, $t2, 12       # an address three words along
    lw $t8, -4($t7)         # and one word back from it
```

The four words sit at `0x10010000`, where `.data` puts the first label:

| address      | value      | which element |
| ------------ | ---------- | ------------- |
| `0x10010000` | `0000000A` | `numbers[0]`  |
| `0x10010004` | `00000014` | `numbers[1]`  |
| `0x10010008` | `0000001E` | `numbers[2]`  |
| `0x1001000C` | `00000028` | `numbers[3]`  |

`$t8` is the line to look at. `$t7` holds the address of the fourth element, and `-4($t7)` walks
back one word from it to find the third, because the offset is signed and may be negative.

The mode takes exactly one register and exactly one constant, which rules out two things you might
reach for. You cannot add two registers inside it, so `lw $t0, ($t1 + $t2)` does not exist. And it
does not scale, so turning an index into a byte offset is your program's job.

## Indexing an array

An array in memory is a run of bytes and nothing more. Element number `i` of `numbers` is at the
address of `numbers` plus `i` times the size of one element, and here the elements are 4 byte words,
so it is `i` times four. Both halves of that are yours to write.

```mips|playground|memory
.data
numbers: .word 10, 20, 30, 40

.text
main:
    la $t0, numbers
    li $t1, 2               # i = 2
    sll $t2, $t1, 2         # i * 4, one word per element
    add $t3, $t0, $t2       # base + offset, the element address
    lw $t4, 0($t3)          # element i
    lw $t5, 4($t3)          # and the one after it
    li $t6, 99
    sw $t6, 0($t3)          # write 99 over element i
```

`sll $t2, $t1, 2` is the multiplication. Shifting a number left by one place doubles it, so
shifting left by two places multiplies by four, and every size on this machine is a power of two, so
a shift is always the right tool for this. Then `add $t3, $t0, $t2` turns the byte offset into a
real address.

Once that address is in a register, the constant offset does the rest of the work for free. `0($t3)`
and `4($t3)` read two neighbouring elements out of one piece of arithmetic, so a loop that handles
elements in pairs pays for the `sll` and the `add` once instead of twice.

## The assembler's label forms

`lw $t5, numbers` is not one of the three modes. It is a pseudo-instruction, and the assembler turns
it into a `lui` that puts the address in `$at` and a real `lw` through it.

```mips|playground|memory
.data
numbers: .word 10, 20, 30, 40

.text
main:
    la $t0, numbers         # lui and ori: the address in a register
    lw $t1, numbers         # lui and lw: the first word
    lw $t2, numbers+8       # the same, eight bytes further on
    li $t3, 8
    lw $t4, numbers($t3)    # lui, addu and lw: a label plus a register
```

`$t1` is 10, `$t2` is 30 and `$t4` is 30 as well. Click each of those lines after building and the
editor prints what they became: two instructions for the first three, three for the last, and every
one of them writes `$at`.

So there is a trade. `lw $t1, numbers` is shorter to read and costs two instructions and `$at`
**every time it runs**, which is fine once and wasteful ten thousand times. Inside a loop you do the
`la` once before the loop starts and use `offset(base)` in the body. That is why `la` is the form
you will write most: what a loop wants is an address sitting in a register.

## Walking with a pointer

An array in memory has no length, no bounds and no element names, so a loop over it is built out of a
pointer and a count.

```mips|playground|memory
.data
numbers: .word 10, 20, 30, 40, 50

.text
main:
    la $t0, numbers         # the address we are standing on
    li $t1, 0               # the running total
    li $t2, 5               # how many are left to do
loop:
    lw $t3, 0($t0)          # the element under the pointer
    add $t1, $t1, $t3       # add it to the total
    addi $t0, $t0, 4        # step the pointer on by one word
    addi $t2, $t2, -1       # one fewer left
    bnez $t2, loop
```

The total in `$t1` is 150. `$t0` finishes at `10010014`, which is twenty bytes past where it
started: one word beyond the last element, pointing at memory the array does not own. A pointer that
ends up just past the end is normal, and reading through it is not.

The step is `addi $t0, $t0, 4` and not `addi $t0, $t0, 1`, because the pointer counts bytes and the
elements are four bytes each. That is the one mistake worth expecting; a program that steps by 1
reads the same word four times over with the bytes shifted along.

There is another way to write the same loop: keep `$t0` at the base and redo the `sll` and `add`
from an index on every pass. That is more instructions per element and it hands you the index, which
sometimes you need. Walk with a pointer when you visit every element in order; keep an index when
you need the number itself, or when the loop jumps around the array the way a binary search does.

## Branches and jumps are addressed differently

None of the three modes applies to the instruction stream. `beq $t0, $t1, label` holds a distance in
words from the branch to the label, so it reaches about 32 kilobytes either way. `j label` and
`jal label` hold the label's word address in 26 bits, which reaches anywhere in the same 256 megabyte
quarter of memory. `jr $t0` takes a full 32 bit address out of a register, which is how a jump table
and a subroutine return both work.

You write a label in all four and the assembler works out which of those it needs.

## Your turn

The four words are at `0x10010000`. Leave `numbers[2]` in `$t0`, working the address out at run time
from the index in `$t1` rather than writing the offset 8 yourself.

```mips|playground|memory|exercise
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li $t1, 2           # i = 2
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": 30 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li $t1, 2           # i = 2
    la $t2, numbers     # the base
    sll $t3, $t1, 2     # i * 4
    add $t3, $t2, $t3   # the address of element i
    lw $t0, 0($t3)      # and there it is
```

</details>

The second one wants `numbers[i] = 99` with `i` already in `$t1`. The test starts it at 3, so the
last of the four words is the one that changes and the array ends up as 10, 20, 30, 99.

```mips|playground|memory|exercise
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li $t1, 3           # i = 3
    # your code here
```

```testcase
{
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x10010000", "bytes": 4, "expected": [10, 20, 30, 99] }
    ]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li $t1, 3           # i = 3
    la $t2, numbers
    sll $t3, $t1, 2     # i * 4
    add $t3, $t2, $t3   # the address of element i
    li $t4, 99
    sw $t4, 0($t3)      # 99 over element i
```

</details>
