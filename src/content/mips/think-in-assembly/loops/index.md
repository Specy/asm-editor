A loop is a comparison, a branch out of it and a jump backwards, which we can now write. The M68K has
`dbra`, one instruction that counts and jumps at once; MIPS has nothing of the kind, so the counter
and the branch are yours to write and how you write them decides how much the loop costs.

## The loop written out

Adding up the numbers from 1 to 10, in C, then flattened, then assembled:

```c
int sum = 0;
for (int i = 1; i <= 10; i++) sum += i;
```

```c
    int sum = 0;
    int i = 1;
while_start:
    if (i > 10) goto while_end;
    sum += i;
    i++;
    goto while_start;
while_end:
```

```mips|playground
.text
main:
    li $t0, 0               # sum = 0
    li $t1, 1               # i = 1
while_start:
    bgt $t1, 10, while_end  # while(i <= 10)
    add $t0, $t0, $t1       # sum += i
    addi $t1, $t1, 1        # i++
    j while_start
while_end:
```

`$t0` comes out at `00000037`, which is 55, and `$t1` at 11, one past the last value it used. The
`j while_start` is what makes it a loop, and it is the same instruction an `if` uses to jump forward.

`bgt $t1, 10, while_end` is a pseudo-instruction with a constant in it, so it costs three real
instructions: an `addi` to put the 10 in `$at`, an `slt` and a `bne`. That makes six instructions a
pass, four of them the machinery of the loop and one the work.

## Counting down to zero

`bnez` and `beqz` are real instructions that compare against `$zero`, and they cost one. So a loop
whose counter runs **down to zero** is half the size of the same loop counting up.

```mips|playground
.text
main:
    li $t0, 0               # sum = 0
    li $t1, 10              # n = 10
loop:
    add $t0, $t0, $t1       # sum += n
    addi $t1, $t1, -1       # n--
    bnez $t1, loop          # until it reaches zero
```

`$t0` is 55 again and `$t1` ends at 0, out of three instructions a pass instead of six. Two things
changed: the test moved to the **bottom** of the loop, which makes it a `do while`, and it compares
against zero, which needs no `slt` and no `$at`.

The test at the bottom is what makes it cheaper and it is also what to watch: the body runs once
before anything is checked, so a loop written this way with a count of 0 runs once and then counts
down through every negative number. When the count can be zero, test it before you enter:

```
    beqz $t1, loop_end
loop:
    ...
```

Counting down also means the counter is no longer the index. When the body needs to know which pass
it is on, either count up and pay for the comparison, or keep a second register.

## Nested loops

Nothing new: an inner loop sits between two lines of the outer one, with its own counter in its own
register, reset at the top of every outer pass.

```mips|playground
.text
main:
    li $t0, 0               # total = 0
    li $t1, 3               # rows left
outer:
    li $t2, 4               # columns left, reset on every outer pass
inner:
    addi $t0, $t0, 1        # total++
    addi $t2, $t2, -1
    bnez $t2, inner
    addi $t1, $t1, -1
    bnez $t1, outer
```

`$t0` comes out at 12, which is 3 times 4. The `li $t2, 4` has to be **inside** the outer loop: move
it above `outer:` and the inner counter is 0 on the second pass, so the first `addi` takes it to -1
and the loop runs four billion times. Try it and watch the Playground stop, silently, when its two
million instructions run out.

That silence is what an accidental infinite loop looks like here. There is no message: the program
simply stops where it had got to, and the registers panel shows a counter at some enormous number.

## Walking an array

A loop over memory does not need a counter at all. Put a label after the last element, load its
address, and run until the pointer reaches it.

```mips|playground|memory
.data
numbers: .word 10, 20, 30, 40, 50
end:

.text
main:
    la $t0, numbers         # p = numbers
    la $t1, end             # the address one past the last element
    li $t2, 0               # sum = 0
loop:
    beq $t0, $t1, done      # while(p != end)
    lw $t3, 0($t0)          # *p
    add $t2, $t2, $t3       # sum += *p
    addi $t0, $t0, 4        # p++
    j loop
done:
```

`$t2` comes out at `00000096`, which is 150, and `$t0` and `$t1` are both `10010014`, twenty bytes
past the start. `end:` is a label with nothing under it, so it is the address the next thing would
have gone at, which is one past the array. Add a sixth number to the `.word` line and the loop adds
it without a single other change, which is what the counted version cannot do.

`beq` between two pointers is exact, since the pointer lands on `end` and not past it. A `blt`
against a length would work too, and `bltu` is the one to use there, because addresses are unsigned.

## Your turn

Add up the numbers from 1 to 10 with a loop and leave 55 in `$t0`. Both directions work; the one
counting down is three instructions a pass.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": 55 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t0, 0               # sum = 0
    li $t1, 10              # n = 10
loop:
    add $t0, $t0, $t1       # sum += n
    addi $t1, $t1, -1       # n--
    bnez $t1, loop
```

</details>

The second one starts `$t0` at 64 and asks how many times it can be halved before it reaches 1.
Leave that count in `$t1`, which for 64 is 6, and use a shift for the halving.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": 64 },
    "expectedRegisters": { "$t1": 6 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t1, 0               # count = 0
loop:
    ble $t0, 1, done        # while(n > 1)
    srl $t0, $t0, 1         # n /= 2
    addi $t1, $t1, 1        # count++
    j loop
done:
```

</details>
