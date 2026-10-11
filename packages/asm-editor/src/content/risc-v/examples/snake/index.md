This program brings the earlier screen, keyboard, array, loop, and subroutine examples together in a
small game. A snake crosses a 32 by 32 board. The `w`, `a`, `s`, and `d` keys steer it, food makes it
grow, and the game ends when the head reaches a wall or the snake's body.

**Click the Screen panel before you press a key.** The Screen panel receives keyboard input only
while it has focus. Press Run again to start a new game.

## The game state

The program numbers columns and rows from 0 through 31. It packs one cell into a word, with the
unused upper bits set to zero:

```text
cell 0x0000050C
             ^^-- row 12 (0x0C)
           ^^---- column 5
```

Thus `body[0] = 0x050C` means that the head occupies column 5, row 12. `draw_cell` performs the
conversion to a display address:

```text
display address = display + 4 * (row * 32 + column)
```

| Memory name | Meaning                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| `body`      | Up to 64 packed cells; `body[0]` is the head and `body[length - 1]` is the tail |
| `length`    | Number of cells currently used in `body`                                        |
| `dx`, `dy`  | Horizontal and vertical movement, each `-1`, `0`, or `1`                        |
| `food`      | Packed cell containing the food                                                 |
| `score`     | Number of pieces of food eaten                                                  |
| `seed`      | State used to produce the next deterministic food position                      |

| Register   | Meaning                                                            |
| ---------- | ------------------------------------------------------------------ |
| `s0`       | Display base address                                               |
| `s1`       | Colour for the next drawing call                                   |
| `s2`       | Keyboard-device base address                                       |
| `s3`       | Old tail cell saved for the current frame                          |
| `s4`       | New head cell calculated for the current frame                     |
| `s5`       | One-frame flag: 1 when growth means the old tail must remain drawn |
| `s7`       | Largest valid coordinate, 31                                       |
| `s8`–`s11` | Character codes for `a`, `d`, `w`, and `s`                         |

Mutable game state lives in memory so helpers can load it by name. Saved registers hold
configuration and current-frame values that are needed across calls.

Each trip through `frame` does these jobs:

1. Read at most one key and accept a safe change of direction.
2. Save the old tail cell, then shift the body from tail toward head.
3. Calculate the new head and check the walls and body.
4. If the head reached food, update the score, grow if there is room, and place new food.
5. Erase the old tail unless growth kept it, then draw the head and food.
6. Wait 120 milliseconds.

The helpers have interface comments immediately above their labels. Those comments identify their
inputs and the registers they change.

```riscv|playground|open-screen|console|no-registers|allow-open
# @screen unit=16 width=512 height=512 base=display
.eqv MMIO, 0xffff0000
.eqv SIDE, 32
.eqv LAST, 31
.eqv CELLS, 1024
.eqv MAXLEN, 64
.eqv FRAME, 120
.eqv BACKGROUND, 0x00101820
.eqv SNAKE, 0x0040D040
.eqv FOOD, 0x00FF4000
.eqv DEAD, 0x00400810

.data
display: .space 4096
body:    .word 0x050C, 0x040C, 0x030C
         .space 244         # room for MAXLEN segments in all
length:  .word 3
dx:      .word 1
dy:      .word 0
score:   .word 0
seed:    .word 0x1F123BB5
food:    .word 0x140C       # column 20, row 12
label:   .asciz "Score: "
over:    .asciz "Game over. Score: "

.text
.globl main
main:
    addi sp, sp, -12        # align the Playground stack before calls
    la s0, display
    li s2, MMIO
    li s5, 0
    li s7, LAST
    li s8, 'a'
    li s9, 'd'
    li s10, 'w'
    li s11, 's'

    li s1, BACKGROUND
    jal fill_grid
    li s1, SNAKE
    la t2, body
    lw t3, length
start_body:
    lw a0, 0(t2)
    jal draw_cell
    addi t2, t2, 4
    addi t3, t3, -1
    bnez t3, start_body
    li s1, FOOD
    lw a0, food
    jal draw_cell

frame:
    lw t0, 0(s2)            # receiver control register
    andi t0, t0, 1          # Ready bit
    beqz t0, no_key
    lw t1, 4(s2)            # reading receiver data takes the character
    andi t1, t1, 0xFF
    bne t1, s8, not_a
    li a0, -1
    li a1, 0
    jal try_direction
not_a:
    bne t1, s9, not_d
    li a0, 1
    li a1, 0
    jal try_direction
not_d:
    bne t1, s10, not_w
    li a0, 0
    li a1, -1
    jal try_direction
not_w:
    bne t1, s11, no_key
    li a0, 0
    li a1, 1
    jal try_direction
no_key:

    lw t0, length
    slli t0, t0, 2
    la t1, body
    add t1, t1, t0
    addi t1, t1, -4         # &body[length - 1]
    lw s3, 0(t1)            # old tail cell
    lw t2, length
    addi t2, t2, -1
    beqz t2, moved
shift:
    lw t3, -4(t1)           # body[i] = body[i - 1]
    sw t3, 0(t1)
    addi t1, t1, -4
    addi t2, t2, -1
    bnez t2, shift
moved:

    lw t0, body             # old head: x in high byte, y in low byte
    srli t1, t0, 8
    andi t2, t0, 0xFF
    lw t3, dx
    add t1, t1, t3
    lw t3, dy
    add t2, t2, t3
    bltz t1, game_over
    bgt t1, s7, game_over
    bltz t2, game_over
    bgt t2, s7, game_over
    slli t1, t1, 8
    or s4, t1, t2
    la t0, body
    sw s4, 0(t0)

    la t1, body
    addi t1, t1, 4
    lw t2, length
    addi t2, t2, -1
    beqz t2, no_bite
bite:
    lw t3, 0(t1)
    beq t3, s4, game_over
    addi t1, t1, 4
    addi t2, t2, -1
    bnez t2, bite
no_bite:

    lw t3, food
    bne t3, s4, no_meal
    lw t4, score
    addi t4, t4, 1
    la t0, score
    sw t4, 0(t0)
    lw t4, length
    li t5, MAXLEN
    bge t4, t5, no_room
    slli t5, t4, 2
    la t6, body
    add t6, t6, t5
    sw s3, 0(t6)
    addi t4, t4, 1
    la t0, length
    sw t4, 0(t0)
    li s5, 1                # skip the tail erase once
no_room:
    jal place_food
    jal print_score
no_meal:

    beqz s5, erase_tail
    li s5, 0
    j tail_done
erase_tail:
    li s1, BACKGROUND
    mv a0, s3
    jal draw_cell
tail_done:
    li s1, SNAKE
    mv a0, s4
    jal draw_cell
    li s1, FOOD
    lw a0, food
    jal draw_cell

    li a7, 32
    li a0, FRAME
    ecall
    j frame

game_over:
    li s1, DEAD
    jal fill_grid
    li a7, 4
    la a0, over
    ecall
    li a7, 1
    lw a0, score
    ecall
    li a7, 11
    li a0, '\n'
    ecall
    li a7, 10
    ecall

# fill_grid(): paint every grid word with s1.
# Reads s0 and s1; changes only t0 and t1.
fill_grid:
    mv t0, s0
    li t1, CELLS
fill_next:
    sw s1, 0(t0)
    addi t0, t0, 4
    addi t1, t1, -1
    bnez t1, fill_next
    ret

# draw_cell(c): paint packed cell a0 with colour s1.
# Reads s0 and s1; changes only t0 and t1.
draw_cell:
    srli t0, a0, 8
    andi t1, a0, 0xFF
    slli t1, t1, 5
    add t0, t0, t1
    slli t0, t0, 2
    add t0, t0, s0
    sw s1, 0(t0)
    ret

# try_direction(nx, ny): use a0,a1 unless that direction is directly backward.
# Changes only t6.
try_direction:
    lw t6, dx
    add t6, t6, a0
    bnez t6, take_it
    lw t6, dy
    add t6, t6, a1
    beqz t6, no_turn
take_it:
    la t6, dx
    sw a0, 0(t6)
    la t6, dy
    sw a1, 0(t6)
no_turn:
    ret

# place_food(): choose a deterministic free cell and store it in food.
# Calls next_random; changes a0 and t0-t6.
place_food:
    addi sp, sp, -16
    sw ra, 0(sp)
food_retry:
    jal next_random
    andi t0, a0, LAST
    slli t0, t0, 8
    jal next_random
    andi t1, a0, LAST
    or t0, t0, t1
    la t2, body
    lw t3, length
food_scan:
    lw t4, 0(t2)
    beq t4, t0, food_retry
    addi t2, t2, 4
    addi t3, t3, -1
    bnez t3, food_scan
    la t2, food
    sw t0, 0(t2)
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# next_random(): update seed and return the next deterministic value in a0.
# Changes only a0 and t6.
next_random:
    lw a0, seed
    slli t6, a0, 13
    xor a0, a0, t6
    srli t6, a0, 17
    xor a0, a0, t6
    slli t6, a0, 5
    xor a0, a0, t6
    la t6, seed
    sw a0, 0(t6)
    ret

# print_score(): print the label, score, and newline; changes a0 and a7.
print_score:
    li a7, 4
    la a0, label
    ecall
    li a7, 1
    lw a0, score
    ecall
    li a7, 11
    li a0, '\n'
    ecall
    ret
```

```testcase
{ "runFor": 100000 }
```

## Trace two frames

Suppose the body is `[0x050C, 0x040C, 0x030C]` and the snake is moving right.

1. `s3` saves `0x030C`, the old tail.
2. The backward shift produces `[0x050C, 0x050C, 0x040C]`. Copying backward preserves each value
   until the segment behind it has read it.
3. The old head at column 5, row 12 moves to column 6, row 12, so `s4` becomes `0x060C`.
4. Storing that cell at `body[0]` produces `[0x060C, 0x050C, 0x040C]`.
5. No food was eaten, so `s5` is 0. The drawing code paints `0x030C` with the background and
   `0x060C` with the snake colour.

The shift changes the array; it does not erase a pixel. The later call to `draw_cell` explicitly
paints the old tail cell with the background.

For an eating frame, imagine `[0x130C, 0x120C, 0x110C]` moving right toward food at `0x140C`.
After the shift and new-head store, the array is `[0x140C, 0x130C, 0x120C]`. The program appends the
saved tail `0x110C`, increases `length`, and sets `s5` to 1. That one-frame flag skips erasing
`0x110C`, so the visible snake grows to four cells.

## Choosing a direction

`try_direction` receives its requested direction in the normal argument registers: `a0 = nx` and
`a1 = ny`. If the snake is moving right, its current direction is `(1, 0)`. A request to move
left is `(-1, 0)`, so both component sums are zero:

```text
dx + nx = 1 + -1 = 0
dy + ny = 0 +  0 = 0
```

That request is refused. A request for up, `(0, -1)`, leaves nonzero sums and is accepted. The two
sums are both zero only when the requested direction is the exact opposite.

`draw_cell` uses `a0` for its ordinary argument, while also reading `s0` and `s1`. Those saved
registers are program-local parts of this helper's contract. They do not replace the general
calling-convention rule that ordinary subroutine arguments go in `a` registers.

## Food, growth, and the supplied generator

`next_random` is a supplied **xorshift** helper. Given `seed`, it applies the fixed shift counts
13, 17, and 5, stores the next seed, and returns that value in `a0`. Its contract is enough to use
it; the mathematical choice of constants is outside this example. The sequence is deterministic,
so the same starting seed produces the same values on every run.

`place_food` calls the helper twice. Masking a result with 31 retains five bits, giving a value
from 0 through 31 for one coordinate. After packing the candidate cell, the helper scans `body`.
An occupied candidate is discarded and another pair is tried, so food never appears under the
snake.

The body array has room for 64 segments. At that cap, eating still increases the score and places
new food, while `length` stays 64. This keeps the fixed-size array safe and allows play to continue.

The stores to named state use the familiar address form:

```riscv
la t0, score
sw t4, 0(t0)
```

The assembler also accepts a shorter label form such as `sw t4, score, t0`, where the last
temporary register helps form the address. This program spells out `la` and `sw` so the memory
operation remains visible.

## Drawing and calls

Most frames change two visible cells: the old tail becomes background and the new head becomes
green. The food is drawn again to cover the frame in which a meal placed it somewhere new. On a
growth frame, `s5` skips the tail erase once. Updating these few cells avoids clearing and
redrawing the whole board every 120 milliseconds.

The score uses console `ecall`s because the bitmap display contains pixels. The other `ecall`s
wait for the next frame and exit after a collision.

At startup, `main` subtracts 12 from the Playground's initial stack pointer to align it before the
first call. `place_food` then uses a 16-byte frame, saves `ra` because it calls `next_random`,
and restores both `ra` and `sp` before returning.

## Exercises

1. Make the initial snake move left. Reverse the starting body cells so the head is `0x030C`, then
   change `dx` to `-1`. Predict the first new head cell: `0x020C`.
2. Move the fixed starting food to grid cell column 10, row 8. These are cell coordinates, not
   display-pixel coordinates. Pack them as `0x0A08`, update `food`, and find the cell in the Screen
   panel.
3. Write `same_cell`: it receives packed cells in `a0` and `a1`, and returns 1 in `a0` when
   they match or 0 otherwise. Use `beq` to choose between `li a0, 0` and `li a0, 1`, then `ret`.
   Test it in a separate tiny program: load equal values into `a0` and `a1`, use `jal same_cell`,
   and inspect `a0`; then repeat with unequal values.
