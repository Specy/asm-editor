Two unsigned numbers are in `b` and `c`. This program leaves the larger one in `d` and the
distance between them in `e`. A subtraction that needs to borrow tells the program which route to
take.

Open the program in the editor, choose **Build**, then use **Step**. Watch whether each `jr nc`
jumps, which value reaches `d`, and whether `neg` runs.

```z80|playground|no-flags|allow-open
    .org 0x8000
    ld b, 37        ; x = 37
    ld c, 64        ; y = 64

    ld a, b
    cp c
    jr nc, x_is_at_least_y
    ld d, c         ; x was smaller, so y is the larger value
    jr done
x_is_at_least_y:
    ld d, b         ; x was larger, or the two values were equal
done:

    ld a, b
    sub c
    jr nc, positive_distance
    neg
positive_distance:
    ld e, a
    halt
```

`cp c` subtracts `c` from `a` to set the flags, then keeps the value already in `a`. Put `b` into
`a` first, so the comparison is `x - y`. A **borrow** is needed when the first unsigned byte is
smaller than the second. In that case the C flag is set. `jr nc` means “jump if there was no
borrow,” so it jumps to `x_is_at_least_y` when `x` is at least `y`.

With the values shown, `b` is `25` and `c` is `40` in the registers panel. `cp c` needs a borrow,
so the first `jr nc` falls through to `ld d, c`; `d` becomes `40`. The following `jr done` skips
the labelled `x` route. Without that jump, `ld d, b` would run next and replace the answer.

The distance calculation performs a real subtraction with `sub c`. It also starts with `a = 25`.
Subtracting `40` gives `E5`, the one-byte wrapped form of 37 minus 64, and sets C because it
borrowed. The second `jr nc` falls through to `neg`. `neg` calculates `0 - a`, changing `E5` to
`1B`, which is 27. Finally `ld e, a` copies that distance into `e`. The panel therefore ends with
`d = 40`, `e = 1B`, and `de = 401B`.

When `x` is greater than or equal to `y`, each subtraction has no borrow. The first jump goes to
the labelled `x` route, and the second jump goes straight to `positive_distance`, leaving `neg`
skipped. Equal values use that same route and leave a distance of zero.

Try these changes one at a time. Predict the final `d` and `e`, then build and run to check.

- Set `b` to 70 and `c` to 20. Both `jr nc` instructions jump, and `neg` is skipped.
- Set both `b` and `c` to 42. Both `jr nc` instructions jump, and `neg` is skipped.

<details>
<summary>Check your answers</summary>

With 70 and 20, `d = 46` and `e = 32`. With 42 in both registers, `d = 2A` and `e = 00`.

</details>
