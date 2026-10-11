# jp, jr and the conditions

Until a jump changes the plan, the CPU executes instructions in their written order. After one instruction,
it moves to the next; `halt` stops execution in this editor. Indentation makes source easier for
people to read, but it does not control what the CPU does. A jump chooses a different next
instruction.

A **label** names the address where the following instruction is placed. Labels such as `smaller`
and `done` below are therefore targets that a jump can name.

## A choice after a comparison

Suppose `a` starts at 50. We want to put 100 in `a` when it is at least 10, and 200 in `a` when it
is smaller. `cp 10` compares unsigned `a` with 10. It leaves `a` alone and records the comparison
in the flags: `C` is 1 when `a` is smaller.

`jr c, smaller` is a **conditional jump**. It looks at `C`: when `C` is 1, the next instruction is
the one at `smaller`; when `C` is 0, execution continues with the next written instruction.

```z80|playground
    .org 0x8000
    ld a, 50
    cp 10
    jr c, smaller   ; choose the smaller-number sequence when C is 1
    ld a, 100
    jr done         ; choose the instruction after the other sequence
smaller:
    ld a, 200
done:
    halt
```

There are two possible instruction sequences:

```text
    ld a, 50
    cp 10
    jr c, smaller  ---- C = 1 ----> smaller: ld a, 200
         |                                      |
         C = 0                                  v
         v                                    done: halt
    ld a, 100
    jr done ----------------------------------->
```

The unconditional `jr done` is part of the two-way choice. On the at-least-10 path, it selects
`done` as the next instruction. Without it, execution would continue into `smaller` and replace
100 with 200.

The comparison must be used while its flags are still current. `ld` does not change flags, so the
loads in this example are safe. Arithmetic and logic instructions can replace the flags, so put the
conditional jump straight after the test when possible.

## The conditions used here

Both `jp` and `jr` can be unconditional, as in `jr done`, or conditional, as in `jr c, smaller`.
This lesson uses these four conditions:

| Condition | Jumps when | After `cp value`, this means                 |
| --------- | ---------- | -------------------------------------------- |
| `z`       | `Z` is 1   | `a` equals `value`                           |
| `nz`      | `Z` is 0   | `a` does not equal `value`                   |
| `c`       | `C` is 1   | unsigned `a` is smaller than `value`         |
| `nc`      | `C` is 0   | unsigned `a` is at least as large as `value` |

For an unsigned three-way comparison, test equality first, then the smaller case. If neither jump
is taken, `a` is larger:

```z80
    cp b
    jr z, equal
    jr c, smaller
    ; a is larger than b here
```

The first jump matters because equal values leave `C` clear. A jump on `nc` would include the equal
case as well as the larger case.

`or a` gives a different kind of test you already know. It keeps `a` unchanged and sets `Z` when
`a` is zero. A conditional jump can use that flag immediately:

```z80|playground
    .org 0x8000
    ld a, 0
    or a
    jr nz, nonzero
    ld b, 1         ; a was zero
    jr done
nonzero:
    ld b, 2
done:
    halt
```

Here `a` is zero, so `Z` is 1 and `jr nz, nonzero` is not taken. The next instruction puts 1 in
`b`.

## `jr` and `jp`

Both instructions take a label. The assembler finds the address named by that label and writes the
right value into the instruction. The difference is how far the jump can reach.

| Instruction | Target            | Range                                     |
| ----------- | ----------------- | ----------------------------------------- |
| `jp label`  | an address        | anywhere in the Z80's 64 KB address space |
| `jr label`  | a signed distance | 128 bytes backward to 127 bytes forward   |

For `jr`, the distance is measured from the address immediately after the `jr` instruction. You do
not calculate that distance yourself: write the label and let the assembler do it. Use `jr` when
the target is nearby, as the labels in the examples are. Use `jp` when the target is farther away.

The same conditions work with either spelling:

```z80
    jp z, finished
    jr nc, enough
```

These instructions make the choice in the same way; the distance to the label decides which form
fits.

## Try it yourself

The runner starts `a` at 200. Leave 1 in `b` if unsigned `a` is 100 or more, and leave 2 in `b` if
it is smaller. Use one `cp` and one conditional jump.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": 200 },
    "expectedRegisters": { "bc": "0x0100" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    cp 100
    jr c, less
    ld b, 1
    jr done
less:
    ld b, 2
done:
    halt
```

</details>

The runner starts `a` at 0. Leave 1 in `c` when `a` is zero and 2 when it is not. Keep `a`
unchanged. Use `or a` to set `Z`, then a conditional jump.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": 0 },
    "expectedRegisters": { "a": 0, "bc": "0x0001" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    or a
    jr nz, nonzero
    ld c, 1
    jr done
nonzero:
    ld c, 2
done:
    halt
```

</details>
