The string at `0x10010000` is turned back to front where it lies, with no second copy of it anywhere.
`t0` stays at the left end while `t1` first scans for the zero byte. Then `t1` backs up to the right
end, and the two pointers walk towards each other, swapping the bytes they point at until they meet
or cross.

```riscv|playground|memory|allow-open
.data
text: .asciz "Assembly"

.text
main:
    la t0, text         # the left pointer
    mv t1, t0           # the right one, still at the start
find_end:
    lb t2, 0(t1)
    beqz t2, at_end     # walk it to the terminator
    addi t1, t1, 1
    j find_end
at_end:
    beq t1, t0, done    # an empty string has no last character
    addi t1, t1, -1     # back onto the last character
swap_loop:
    bgeu t0, t1, done   # stop once they have met or crossed
    lb t2, 0(t0)
    lb t3, 0(t1)
    sb t3, 0(t0)        # each byte into the other's place
    sb t2, 0(t1)
    addi t0, t0, 1
    addi t1, t1, -1
    j swap_loop
done:
```

The program only knows where the string starts, so the right pointer has to be found first. Both
pointers begin at the start; `t1` becomes the right pointer only after the scan. The scan stops on
the terminator, which is one byte past the last character, and `addi t1, t1, -1` backs it onto a
real letter. The empty-string check comes first because an empty string has no real letter to back
onto.

Here is the string after the first two passes and after the last one, with the addresses held still
and only the contents moving:

```
      t0                                   t1
      v                                    v
      A   s   s   e   m   b   l   y    0        start
   10010000                        10010007

          t0                   t1
          v                    v
      y   s   s   e   m   b   l   A    0        after one swap

                  t0  t1
                  v   v
      y   l   s   e   m   b   s   A    0        after two

                    t1  t0
                    v   v
      y   l   b   m   e   s   s   A    0        they have crossed
```

When the pointers meet or cross, `bgeu t0, t1, done` is true and the loop is over. A string with an
odd number of characters leaves its middle one untouched, which is correct: a character swapped
with itself is the same character. A one-character string reaches the same check with both pointers
on that character, so it also needs no swap. For an empty string, the check at `at_end` jumps to
`done` before `t1` is moved or either pointer is used by a load or store.

The swap itself needs both bytes read before either is written, which is why there are two loads
before the two stores. Write `sb` into the left position first and you have destroyed the byte you
were about to copy out of it.

`bgeu` is the **unsigned** comparison, which is the family for addresses. Addresses are not signed
numbers, so the comparison must not treat an address whose top bit is set as negative.

Run it with the memory panel on `10010000`. The eight bytes read `79 6C 62 6D 65 73 73 41`, and the
panel's text button draws them as `ylbmessA`.

## Your turn: reverse it safely

Complete the scan and swap loops so `phrase` becomes `reward`. Keep the zero byte at the end, and
keep the empty-string check before the instruction that backs up `t1`.

```riscv|playground|memory|exercise
.data
phrase: .asciz "drawer"

.text
main:
    la t0, phrase
    mv t1, t0
find_end:
    # load the byte at t1; advance until it is zero
at_end:
    # stop now if the string is empty, then back up t1
swap_loop:
    # stop if the pointers have met or crossed
    # load both bytes before storing either one
    # move both pointers inward and repeat
done:
```

```testcase
{
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x10010000", "bytes": 1,
          "expected": [114, 101, 119, 97, 114, 100, 0] }
    ]
}
```

For four boundary checks, return to the opening runnable program and change its `.asciz` string to
each of `""`, `"Q"`, `"cat"`, and `"desk"`, one at a time. Before each run, predict the bytes
including the final zero, then inspect them in the memory panel. These inputs check the empty,
one-character, odd-length, and even-length cases without changing the fixed `"drawer"` exercise.

<details>
<summary>Show expected bytes</summary>

| Input    | Bytes after running |
| -------- | ------------------- |
| `""`     | `00`                |
| `"Q"`    | `51 00`             |
| `"cat"`  | `74 61 63 00`       |
| `"desk"` | `6B 73 65 64 00`    |

</details>

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
phrase: .asciz "drawer"

.text
main:
    la t0, phrase
    mv t1, t0
find_end:
    lb t2, 0(t1)
    beqz t2, at_end
    addi t1, t1, 1
    j find_end
at_end:
    beq t1, t0, done
    addi t1, t1, -1
swap_loop:
    bgeu t0, t1, done
    lb t2, 0(t0)
    lb t3, 0(t1)
    sb t3, 0(t0)
    sb t2, 0(t1)
    addi t0, t0, 1
    addi t1, t1, -1
    j swap_loop
done:
```

</details>
