A binary search looks for an unsigned byte in an ascending array. Instead of checking every byte,
it probes the middle of the part that could still contain the target. This program searches the
twelve bytes below for `91`. It leaves the matching index in `e`; if no byte matches, it leaves
`FF` in `e`.

Open the program in the editor, choose **Build**, then use **Step** for the first two probes or
choose **Run** to finish it. The register panel shows hexadecimal values. With the supplied target,
`e` ends as `09`; `d` still holds `5B`, so `de` is `5B09`. Open the memory panel at `9000` to see
the array.

```z80|playground|memory|no-flags|allow-open
count equ 12

    .org 0x8000
    ld d, 91            ; the value we are looking for
    ld b, 0             ; low = 0
    ld c, count         ; high = count, one past the last element
    ld e, 0xFF          ; found = -1, meaning not there
search:
    ld a, b
    cp c
    jr nc, search_done  ; while(low < high)
    add a, c            ; low + high
    srl a               ; mid = (low + high) / 2
    push af             ; mid, kept while a is used for the element
    ld hl, numbers
    add a, l
    ld l, a
    jr nc, addressed
    inc h               ; the carry into the high byte
addressed:
    ld a, (hl)          ; numbers[mid]
    cp d                ; numbers[mid] - target
    jr z, hit
    jr c, go_right      ; it was too small, look above it
    pop af              ; mid back
    ld c, a             ; high = mid
    jr search
go_right:
    pop af
    inc a
    ld b, a             ; low = mid + 1
    jr search
hit:
    pop af
    ld e, a             ; found = mid
search_done:
    halt

    .org 0x9000
numbers: .db 2, 5, 8, 12, 16, 23, 38, 56, 72, 91, 100, 127
```

The live range is **half-open**: `[low, high)`. `low` is included and `high` is one past the last
possible index, so the initial range is `[0, 12)`. That makes the three outcomes after a probe
direct:

| Comparison of `numbers[mid]` with the target | Next range          |
| -------------------------------------------- | ------------------- |
| Too small                                    | `low = mid + 1`     |
| Too large                                    | `high = mid`        |
| Equal                                        | return `mid` in `e` |

`cp d` subtracts the target from the probed byte without keeping the result. C is set when that
byte is smaller, so `jr c, go_right` takes the first case. A larger byte falls through to
`high = mid`. The loop stops when `low` catches `high`: `[9, 9)`, for example, contains no index.

For the supplied search for `91`, the two probes are:

| `low` | `high` | `mid` | Probed byte | Result |
| ---: | ---: | ---: | --- |
| 0 | 12 | 6 | 38 | too small; `low = 7` |
| 7 | 12 | 9 | 91 | match; `e = 09` |

Change `ld d, 91` to `ld d, 90`, build, and run again. The complete no-match path is short:

| `low` | `high` | `mid` | Probed byte | Result |
| ---: | ---: | ---: | --- |
| 0 | 12 | 6 | 38 | too small; `low = 7` |
| 7 | 12 | 9 | 91 | too large; `high = 9` |
| 7 | 9 | 8 | 72 | too small; `low = 9` |

Now `low` and `high` are both 9, so the loop ends without reaching `hit`. `e` was initialized to
`FF` and was never changed, making `de` `5AFF`. `FF` is safe as the not-found marker here because
the valid indices are only `00` through `0B`.

`srl a` divides the sum by two, rounding down, to make the middle index. This exact program uses a
one-byte count and indices, and it forms `low + high` in the one-byte register `a`; keep `count` at
128 or less so that sum cannot overflow. The twelve-byte demo is well inside that limit. Its inputs
must be ascending unsigned bytes, and `d` is an unsigned byte target. `de` is simply two adjacent
registers here: target in `d`, result in `e`.

The address calculation starts with `hl = numbers` and adds the index to its low byte. If that
addition carries, `inc h` completes the pointer addition. In this listing `numbers` is visibly at
`9000`, but the carry-handling code also stays correct if the array is moved near the end of a page.

Finally, `a` needs to hold both the middle index and the byte read from memory. `push af` saves the
index before the read, and each branch uses `pop af` exactly once before either updating a bound or
returning the result. That balance keeps the stack where it started.
