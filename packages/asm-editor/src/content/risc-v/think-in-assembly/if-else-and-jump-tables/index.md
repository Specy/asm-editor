This page returns to **RV32**, the 32-bit RISC-V mode used before the RV64 introduction. A branch
can choose between two paths, and a table of addresses can extend the same idea to several paths.

## Lay out an if/else

Suppose `t0` holds `x`, and we want to express this decision:

```text
if x > 10:
    x = 100
else:
    x = 200
```

A branch has two outcomes: it jumps to its label when its condition is true, or falls through to
the next instruction when its condition is false. One useful layout is to branch to `else` when
the original condition `x > 10` is false:

```riscv|playground
.text
main:
    li  t0, 50
    li  t1, 10
    ble t0, t1, else    # if x <= 10, continue at else
    li  t0, 100         # the x > 10 body
    j   done
else:
    li  t0, 200         # the x <= 10 body
done:
```

With `x` equal to 50, `ble` falls through, `t0` becomes 100, and `j done` skips the `else` body.
With `x` equal to 0, `ble` is taken and execution continues at `else`, where `t0` becomes 200.
Both paths meet at `done`.

The unconditional `j done` is essential on the first path. Without it, execution would continue
straight into the `else` body and replace 100 with 200.

The assembler accepts `ble` and `j` as **pseudo-instructions**. It rewrites them using real RV32I
instructions:

```riscv
ble t0, t1, else       # assembler convenience
bge t1, t0, else       # real branch with the same meaning

j done                 # assembler convenience
jal zero, done         # real instruction with the same effect
```

For `ble`, reversing the registers turns `t0 <= t1` into the equivalent question `t1 >= t0`.
For `j`, writing the destination as `zero` discards the address produced by `jal`, leaving a plain
unconditional jump.

This gives a reusable shape:

```riscv
    branch-if-condition-is-false else
    # instructions for the true path
    j done
else:
    # instructions for the false path
done:
```

## Real branches and convenient spellings

The six real comparison branches from the introduction are `beq`, `bne`, `blt`, `bge`, `bltu` and
`bgeu`. The assembler provides extra spellings by exchanging operands or using the `zero` register.

| question        | convenient source spelling | real branch used by the assembler |
| --------------- | -------------------------- | --------------------------------- |
| `a == b`        | `beq a, b, label`          | `beq a, b, label`                 |
| `a != b`        | `bne a, b, label`          | `bne a, b, label`                 |
| signed `a < b`  | `blt a, b, label`          | `blt a, b, label`                 |
| signed `a >= b` | `bge a, b, label`          | `bge a, b, label`                 |
| signed `a > b`  | `bgt a, b, label`          | `blt b, a, label`                 |
| signed `a <= b` | `ble a, b, label`          | `bge b, a, label`                 |
| `a == 0`        | `beqz a, label`            | `beq a, zero, label`              |
| signed `a < 0`  | `bltz a, label`            | `blt a, zero, label`              |

The unsigned ordering branches follow the same pattern. For example, `bgtu a, b, label` is a
convenient spelling of `bltu b, a, label`, and `bleu a, b, label` becomes `bgeu b, a, label`.

Each line in this table assembles to one real branch instruction. The convenient spelling gives
the assembler a clearer way to express the question in the source code.

## Chain tests for several ranges

A branch compares two registers. To compare a value with a constant such as 90, first place that
constant in a register with `li`.

Here is a grading decision with three possible results:

```text
90 or above -> A
60 or above -> B
below 60    -> C
```

Test from the highest boundary downward. The first branch whose condition is true selects the
answer:

```riscv|playground
.text
main:
    li  t0, 75          # score

    li  t1, 90
    bge t0, t1, grade_a

    li  t1, 60
    bge t0, t1, grade_b

    li  t2, 'C'         # both tests fell through
    j   done
grade_a:
    li  t2, 'A'
    j   done
grade_b:
    li  t2, 'B'
done:
```

For a score of 75, the first test falls through and the second test branches to `grade_b`. The
register `t2` finishes with `0x00000042`, the character code for `B`.

This pattern works well when different ranges need different paths: arrange the tests in a useful
order, branch when one matches, and have every completed path meet at the same ending label.

## From a branch chain to a jump table

Suppose an index in `t0` selects one of three cases: 0 selects `case0`, 1 selects `case1`, and 2
selects `case2`. A branch chain can ask about each value in turn:

```riscv|playground
.text
main:
    li  t0, 2           # selected case
    beq t0, zero, case0
    li  t2, 1
    beq t0, t2, case1
    li  t2, 2
    beq t0, t2, case2
    j   out_of_range

case0:
    li  t1, 10
    j   done
case1:
    li  t1, 20
    j   done
case2:
    li  t1, 30
    j   done
out_of_range:
    li  t1, -1
done:
```

Each additional case adds another comparison. When the cases are consecutive numbers beginning
at zero, a **jump table** can store their destination addresses in the same order. The index then
selects an entry directly.

```riscv|playground|memory
.eqv CASE_COUNT, 3

.data
table: .word case0, case1, case2

.text
main:
    li   t0, 2           # selected case

    li   t5, CASE_COUNT
    bgeu t0, t5, out_of_range

    la   t2, table
    slli t3, t0, 2       # byte offset = index * 4
    add  t3, t2, t3      # address of table[index]
    lw   t4, 0(t3)       # load the selected case address
    jr   t4              # continue at that address

case0:
    li   t1, 10
    j    done
case1:
    li   t1, 20
    j    done
case2:
    li   t1, 30
    j    done
out_of_range:
    li   t1, -1
done:
```

There are three valid indices, so the valid range is 0 through 2. The `bgeu` checks `t0` against
the table length before any address is calculated. An index of 3 or more branches to
`out_of_range`. A negative RV32 value has a large unsigned interpretation, so it follows that same
safe path.

For a valid index, the lookup reuses the word-array calculation:

1. `la` places the address of `table` in `t2`.
2. `slli` multiplies the index by 4 because every RV32 table entry is one four-byte word.
3. `add` finds the address of the selected table entry.
4. `lw` reads the case address stored in that entry.
5. `jr` continues execution at the address in `t4`.

The labels `case0`, `case1` and `case2` stand for addresses. In the data section, the assembler
places those addresses into the three `.word` entries. The exact numeric addresses depend on where
the program is assembled; the code uses labels throughout, so it remains independent of those
numbers.

`jr t4` is another pseudo-instruction. The assembler rewrites it as `jalr zero, t4, 0`. In this
program its practical meaning is simply “continue at the instruction address held in `t4`.”

## Your turn: classify a signed value

Leave the sign of `t0` in `t1`: -1 for a negative value, 0 for zero, and 1 for a positive value.
The three tests run the same code with one value from each path.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": -7 },
    "expectedRegisters": { "t1": -1 }
}
```

```testcase
{
    "startingRegisters": { "t0": 0 },
    "expectedRegisters": { "t1": 0 }
}
```

```testcase
{
    "startingRegisters": { "t0": 12 },
    "expectedRegisters": { "t1": 1 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    blt t0, zero, negative
    blt zero, t0, positive
    li  t1, 0           # reaching here means t0 is zero
    j   done
negative:
    li  t1, -1
    j   done
positive:
    li  t1, 1
done:
```

</details>

## Your turn: complete a checked jump table

The range check and three cases are already present. Complete the four lookup steps so that a valid
index selects its case. The second test also checks that an index outside the table reaches
`out_of_range` before the lookup.

```riscv|playground|memory|exercise
.eqv CASE_COUNT, 3

.data
table: .word case0, case1, case2

.text
main:
    li   t5, CASE_COUNT
    bgeu t0, t5, out_of_range

    la   t2, table
    # calculate the entry address, load the case address and jump to it

case0:
    li   t1, 10
    j    done
case1:
    li   t1, 20
    j    done
case2:
    li   t1, 30
    j    done
out_of_range:
    li   t1, -1
done:
```

```testcase
{
    "startingRegisters": { "t0": 1 },
    "expectedRegisters": { "t1": 20 }
}
```

```testcase
{
    "startingRegisters": { "t0": 5 },
    "expectedRegisters": { "t1": -1 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.eqv CASE_COUNT, 3

.data
table: .word case0, case1, case2

.text
main:
    li   t5, CASE_COUNT
    bgeu t0, t5, out_of_range

    la   t2, table
    slli t3, t0, 2
    add  t3, t2, t3
    lw   t4, 0(t3)
    jr   t4

case0:
    li   t1, 10
    j    done
case1:
    li   t1, 20
    j    done
case2:
    li   t1, 30
    j    done
out_of_range:
    li   t1, -1
done:
```

</details>

An `if/else` uses a conditional branch, fall-through and an unconditional jump to arrange two
paths. A chain repeats that idea for several tests. A jump table handles consecutive case numbers
by checking the index, loading the selected label address and jumping through the register.
