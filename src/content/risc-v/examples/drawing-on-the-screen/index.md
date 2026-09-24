The bitmap display is a 32 by 32 grid of words. Writing a colour word to one of those words changes
one cell on the Screen panel. A rectangle is a set of horizontal runs, and a disc is a set of cells
selected by a distance test.

This page uses two drawing subroutines. Here is their contract before we call either one:

| Routine        | Inputs                                    | Shared values       | Scratch registers |
| -------------- | ----------------------------------------- | ------------------- | ----------------- |
| `fill_rect_32` | `a0=x`, `a1=y`, `a2=width`, `a3=height`   | reads `s0` and `s1` | `t0`–`t3`         |
| `fill_disc_32` | `a0=centre x`, `a1=centre y`, `a2=radius` | reads `s0` and `s1` | `t0`–`t6`         |

In both rows, `s0` is the display address and `s1` is the current colour. The routines read those
saved registers but do not change them. Their names end in `_32` because their address calculation
assumes a display 32 cells wide. Use a radius of zero or greater for `fill_disc_32` (radius zero
draws nothing because the distance test is strict). Neither helper clips coordinates at the display
edges, so callers normally keep every shape within columns 0–31
and rows 0–31. An out-of-range coordinate may wrap into another row or address memory outside the
display.

`jal fill_rect_32` calls the rectangle routine, and `ret` returns to the instruction after the call.
The `a` registers carry inputs into a call. The `t` registers are temporary: a caller must expect a
subroutine to overwrite them. Saved registers such as `s0` and `s1` survive a call.

## From one cell to one horizontal run

For a cell at column `x` and row `y`, the word address is

```text
display base + (y * 32 + x) * 4
```

Multiplying by 32 selects a row, adding `x` selects a cell, and multiplying by 4 changes the word
index into a byte offset. Once we have the first address, each following cell is four bytes farther
on:

```riscv
# Inputs: a0=x, a1=y, a2=width
# Shared: s0=display base, s1=colour
slli t0, a1, 5             # y * 32
add  t0, t0, a0            # + x
slli t0, t0, 2             # byte offset
add  t0, t0, s0            # address of (x, y)
mv   t1, a2                 # cells left in this run
blez t1, run_done           # zero or negative width draws nothing
run:
    sw s1, 0(t0)
    addi t0, t0, 4
    addi t1, t1, -1
    bnez t1, run
run_done:
```

A rectangle repeats that run for several rows. `fill_rect_32` uses `t0` as the current row and `t1`
as the row just after the rectangle. At each row it calculates a fresh address in `t2`; then `t3`
counts the cells still to draw across that row.

For example, `fill_rect_32(1, 2, 3, 2)` means `a0=1`, `a1=2`, `a2=3`, `a3=2`:

| Current row `t0` | First cell address  | Stores made               | `t3` counts |
| ---------------- | ------------------- | ------------------------- | ----------- |
| 2                | `s0 + (2*32 + 1)*4` | `(1,2)`, `(2,2)`, `(3,2)` | 3, 2, 1     |
| 3                | `s0 + (3*32 + 1)*4` | `(1,3)`, `(2,3)`, `(3,3)` | 3, 2, 1     |

After row 3, `t0` becomes 4. That equals the one-past limit in `t1`, so the outer loop stops.

## Building the picture from calls

With the helper available, drawing the top twenty rows is argument setup followed by a call:

```riscv
li s1, SKY
li a0, 0                   # x
li a1, 0                   # y
li a2, 32                  # width
li a3, 20                  # height
jal fill_rect_32
```

The roof uses six one-row rectangles. On row number `s2`, its left edge moves right by one, its
`y` coordinate moves up by one, and its width shrinks by two:

```text
row 0: x=10, y=15, width=12
row 1: x=11, y=14, width=10
row 2: x=12, y=13, width=8
...
```

The loop counter and limit live in `s2` and `s3` because each call may overwrite every `t` register.

The sun needs one more idea. `fill_disc_32` scans the square from `cx-r` through `cx+r` and from
`cy-r` through `cy+r`. For every candidate cell it calculates `dx*dx + dy*dy`. It stores the colour
only when that value is less than `r*r`; cells outside the disc are skipped. The coordinate loops
include both edges of the surrounding square, while the distance comparison uses a strict boundary.

Here is the complete picture. Press Run and open the Screen panel.

```riscv|playground|open-screen|no-registers|allow-open
# @screen unit=8 width=256 height=256 base=display
.eqv SIDE, 32
.eqv SKY, 0x0070B0E0
.eqv GRASS, 0x003C9648
.eqv SUN, 0x00FFD200
.eqv WALL, 0x00C07040
.eqv ROOF, 0x00A02020
.eqv DOOR, 0x00704020

.data
display: .space 4096        # 32 * 32 words, four bytes each

.text
.globl main

# a0=x, a1=y, a2=width, a3=height
# Reads s0=display base and s1=colour. Fixed for a 32-cell-wide display.
fill_rect_32:
    blez a2, rect_done
    blez a3, rect_done
    mv t0, a1               # current row
    add t1, a1, a3          # one-past the final row
rect_rows:
    slli t2, t0, 5          # row * 32
    add t2, t2, a0          # + x
    slli t2, t2, 2          # four bytes per word
    add t2, t2, s0          # first cell in this row
    mv t3, a2               # cells left across the row
rect_cols:
    sw s1, 0(t2)
    addi t2, t2, 4
    addi t3, t3, -1
    bnez t3, rect_cols
    addi t0, t0, 1
    blt t0, t1, rect_rows
rect_done:
    ret

# a0=cx, a1=cy, a2=radius
# Reads s0=display base and s1=colour. Fixed for a 32-cell-wide display.
fill_disc_32:
    mul t6, a2, a2          # radius squared
    sub t0, a1, a2          # first y: cy - radius
    add t1, a1, a2          # final y: cy + radius
disc_rows:
    sub t2, a0, a2          # first x: cx - radius
    add t3, a0, a2          # final x: cx + radius
disc_cols:
    sub t4, t2, a0          # dx
    sub t5, t0, a1          # dy
    mul t4, t4, t4
    mul t5, t5, t5
    add t4, t4, t5
    bge t4, t6, disc_next   # outside the disc: do not store
    slli t4, t0, 5
    add t4, t4, t2
    slli t4, t4, 2
    add t4, t4, s0
    sw s1, 0(t4)
disc_next:
    addi t2, t2, 1
    ble t2, t3, disc_cols
    addi t0, t0, 1
    ble t0, t1, disc_rows
    ret

main:
    la s0, display

    li s1, SKY
    li a0, 0
    li a1, 0
    li a2, SIDE
    li a3, 20
    jal fill_rect_32

    li s1, GRASS
    li a0, 0
    li a1, 20
    li a2, SIDE
    li a3, 12
    jal fill_rect_32

    li s1, SUN
    li a0, 26
    li a1, 6
    li a2, 4
    jal fill_disc_32

    li s1, WALL
    li a0, 10
    li a1, 16
    li a2, 12
    li a3, 10
    jal fill_rect_32

    li s1, ROOF
    li s2, 0                # roof row: 0 through 5
    li s3, 6
roof:
    li a0, 10
    add a0, a0, s2
    li a1, 15
    sub a1, a1, s2
    li a2, 12
    slli t0, s2, 1
    sub a2, a2, t0
    li a3, 1
    jal fill_rect_32
    addi s2, s2, 1
    blt s2, s3, roof

    li s1, DOOR
    li a0, 14
    li a1, 21
    li a2, 4
    li a3, 5
    jal fill_rect_32

    li a7, 10
    ecall
```

The screen directive makes each word an 8 by 8 block in a 256 by 256 display, giving 32 cells per
side. The `display` label names the first word. Its 4096 bytes are exactly `32 * 32 * 4`. Colours use
`0x00RRGGBB`; the six constants near the top are a compact palette for the picture.

## Exercises

1. Draw a three-cell-wide, two-cell-high window whose top-left cell is `(15, 17)`. Insert its call
   after the roof loop and before the door call so the window appears on top of the wall. Use a new
   pale-yellow colour, `0x00FFF0A0`. Decide what each of `a0` through `a3` must contain before
   `jal fill_rect_32`.

2. Complete the missing rectangle inner loop. Assume `a2` is positive. Keep `t2` as the address of
   the next cell and `t3` as the number of cells left. It must make exactly `a2` stores and finish
   when `t3` is zero.

    ```riscv
    mv t3, a2               # cells left
    rect_cols_practice:
        sw s1, 0(t2)
        # advance t2 to the next word
        # subtract one from t3
        # repeat while t3 is not zero
    ```

3. Change the roof to five rows with widths `10, 8, 6, 4, 2`. Keep it centred over the same house,
   keep every roof call one cell high, and do not change `fill_rect_32`. Choose the new starting `x`,
   starting `y`, width, and loop limit. As a first checkpoint, the lowest row should call
   `fill_rect_32` with `(x, y, width, height) = (11, 15, 10, 1)`. Run the program to check that every
   row remains centred.

As an optional extension, change the sun's centre from `x=26` to `x=29`. Some candidate cells then
pass column 31. Since the address calculation does not clip coordinates, column 32 is stored at the
same address as column 0 of the next row. The wrapped edge shows that the display is one linear block
of memory even though the Screen panel presents it as a grid.
