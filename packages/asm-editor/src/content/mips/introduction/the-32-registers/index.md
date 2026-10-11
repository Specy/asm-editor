MIPS has 32 registers, and each one holds 32 bits. The hardware identifies them by number, from
`$0` to `$31`. Programmers normally use names such as `$t0`, `$s0`, and `$sp` because the names are
easier to recognize.

A number and its usual name refer to the same storage location. For example, `$t0` and `$8` are two
names for register 8. Changing one changes the other.

The `add` and `sub` instructions put their result in the first register:

```text
add destination, left, right      # destination = left + right
sub destination, left, right      # destination = left - right
```

```mips|playground
.text
main:
    li $t0, 5
    add $8, $8, $8      # $8 is $t0, so this doubles 5
    li $9, 7            # $9 is $t1
    add $t2, $t1, $t1   # this doubles the 7 stored above
```

Build the program and step through it. After the second instruction, `$t0` contains 10 even though
that line uses the name `$8`. After the last instruction, `$t2` contains 14 because `$9` and `$t1`
refer to the same register.

You will usually write the named forms. The numbered forms are useful when a register panel,
documentation, or another program uses a different spelling.

## The register names

Here is the complete set of 32 registers. Use this table as a lookup; you do **not** need to memorize
it.

| number      | usual name  | practical meaning                                           |
| ----------- | ----------- | ----------------------------------------------------------- |
| `$0`        | `$zero`     | always reads as 0                                           |
| `$1`        | `$at`       | reserved for the assembler; leave it alone                  |
| `$2`–`$3`   | `$v0`–`$v1` | values returned by subroutines                              |
| `$4`–`$7`   | `$a0`–`$a3` | arguments passed to subroutines                             |
| `$8`–`$15`  | `$t0`–`$t7` | temporary values                                            |
| `$16`–`$23` | `$s0`–`$s7` | saved values                                                |
| `$24`–`$25` | `$t8`–`$t9` | two more temporary values                                   |
| `$26`–`$27` | `$k0`–`$k1` | reserved for the operating system; leave them alone         |
| `$28`       | `$gp`       | global pointer; used by a program-wide convention           |
| `$29`       | `$sp`       | stack pointer; introduced when the course reaches the stack |
| `$30`       | `$s8`/`$fp` | saved register or frame pointer, depending on the program   |
| `$31`       | `$ra`       | return address for a subroutine                             |

For the small, self-contained programs in this part of the course, use `$t0` through `$t9` for
values you choose yourself. They are the simplest safe default. In programs that do not call
subroutines yet, `$s0` through `$s7` can also hold your values; some exercises use them so their
names become familiar. The difference between **temporary** and **saved** matters when one part of
a program calls another, so the course will make that distinction concrete when it introduces
subroutines.

The other names are job labels used by common MIPS programming rules. They will become useful when
the corresponding jobs appear. For now, the practical cautions are enough: do not keep your own
values in `$at`, `$k0`, or `$k1`, and do not change `$sp` until you learn how the stack uses it.

## `$zero` always contains zero

Register `$0`, usually written `$zero`, is the one member of the 32 that the hardware treats
differently. Reading it always gives 0. An instruction may try to write to it, but the attempted
write is discarded.

That makes `$zero` useful in ordinary calculations. Step through this program:

```mips|playground
.text
main:
    li $t0, 5
    add $t1, $t0, $zero     # 5 + 0: copy $t0 into $t1
    sub $t2, $zero, $t0     # 0 - 5: put -5 in $t2
    li $t3, 9
    add $zero, $t3, $t3     # try to write 18 to $zero
    add $t4, $zero, $zero   # $zero still reads as 0
```

After stepping through it, `$t1` contains 5 and `$t2` contains -5. The attempted write to `$zero`
does not remain anywhere, so `$t4` receives 0 on the final line.

## A few names outside the 32

The registers panel also shows `hi`, `lo`, and `pc`. They are not extra general-purpose registers.
`pc` identifies the next instruction to run, while `hi` and `lo` are used by later arithmetic
instructions. You can leave all three alone for now.

## Your turn

The test starts `$t0` at 5. Leave a copy of it in `$s0` and its negation in `$s1`. Use `$zero` in
both instructions rather than a shorthand instruction.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": 5 },
    "expectedRegisters": { "$s0": 5, "$s1": -5 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    add $s0, $t0, $zero     # 5 + 0 copies the value
    sub $s1, $zero, $t0     # 0 - 5 negates the value
```

</details>
