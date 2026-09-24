A playable Flappy Bird. The bird falls while you play; Space, `w`, or Enter gives it an upward
flap. Pipes scroll in from the right, with gaps chosen from a changing sequence. A collision ends
the run, and another accepted key starts a new one.

**Click the Screen panel before you press a key**, the same as in Move a square with the keyboard.

This capstone combines the frame loop, keyboard input, screen addresses, and the supplied xorshift
helper from The snake game. Its new ideas are a three-state game, fractional movement, pipe records,
half-open collision ranges, and repainting selected screen columns.

Before reading the program, keep this map nearby. Most values describe the game between frames.
`s10` holds frame-loop input state, while `s8` and `s9` are saved-register locals borrowed by
particular helpers.

| Register | Meaning                                                    |
| -------- | ---------------------------------------------------------- |
| `s0`     | address of the first display word                          |
| `s2`     | bird top position, in sixteenths of a row                  |
| `s3`     | bird velocity, also in sixteenths of a row per frame       |
| `s4`     | current state: `READY`, `PLAYING`, or `DEAD`               |
| `s5`     | score for this run                                         |
| `s6`     | best score in this execution                               |
| `s7`     | keyboard MMIO base address                                 |
| `s10`    | whether this frame received at least one accepted flap key |
| `s8`     | pipe pointer or column counter inside a helper             |
| `s9`     | displayed bird row inside `draw_bird`                      |

Each pipe occupies three adjacent words:

```text
pipe record
+0             +4                 +8
left x          gap middle         counted
62              20                 0
```

`counted` becomes 1 after that pipe passes the bird, so it cannot add to the score twice. The three
records are allocated as zeroes in `.data`; `new_pipes` supplies all meaningful initial values.

The state changes are small enough to see at once:

```text
READY --accepted key--> PLAYING --collision--> DEAD
  ^                                           |
  +---------------accepted key---------------+
```

One frame does the following:

1. Drain the keyboard queue and remember whether any accepted key appeared.
2. Run the update for the current state.
3. Repaint the bird and the world in its six columns.
4. Wait `FRAME` milliseconds and repeat.

Here are three concrete details to look for in the listing:

- In `READY`, no key leaves the bird at `STARTY`. The value 320 means row `320 >> 4`, or row 20.
  The first key starts the game and sets the upward velocity; PLAYING physics begins next frame.
- A pipe at `x = 62` moves to 61. Its new covered interval is `[61, 69)`. Column 61 has just
  entered the pipe, while column 69 has just left it, so those are the two columns to repaint.
- If the bird covers rows `[20, 25)`, one bird column is painted as three bands: world `[0, 20)`,
  body `[20, 25)`, and world `[25, 64)`. Clipping makes each call paint only its own band.

```riscv|playground|open-screen|console|no-registers|allow-open
# @screen unit=4 width=256 height=256 base=display
.eqv MMIO, 0xffff0000
# Grid and bird
.eqv SIDE, 64               # the grid, in words across and down
.eqv GROUNDY, 56            # the first row of ground
.eqv GRASSB, 58             # and the first row of sand under the grass
.eqv BIRDX, 12              # the bird only ever moves up and down
.eqv BIRDW, 6
.eqv BIRDH, 5
.eqv BIRDR, 18              # BIRDX + BIRDW, the column after the bird
# Pipes and gaps
.eqv PIPEW, 8               # and -PIPEW is where a pipe is recycled
.eqv HALFGAP, 9
.eqv SPACING, 24            # between one pipe and the next
.eqv CYCLE, 72              # SPACING * 3, what a recycled pipe jumps by
.eqv FIRSTX, 62
.eqv GAPMIN, 13             # the highest the middle of a gap goes
.eqv GAPSPAN, 26            # and how far below that it can be
# Physics and timing
.eqv GRAV, 3                # add this many sixteenths to velocity each frame
.eqv FLAPV, -26             # the speed one flap gives, upwards
.eqv MAXFALL, 26
.eqv STARTY, 320            # 20 * 16, where the bird waits
.eqv RESTY, 816             # (GROUNDY - BIRDH) * 16, where a dead bird lands
.eqv FRAME, 80              # milliseconds a frame
# Game states
.eqv READY, 0
.eqv PLAYING, 1
.eqv DEAD, 2
# Colours
.eqv SKY, 0x004EC0E8
.eqv PIPE, 0x0058BB39
.eqv GRASS, 0x0074C458
.eqv SAND, 0x00DED895
.eqv DEADGROUND, 0x00B03028
.eqv BODY, 0x00FACE3E
.eqv BEAK, 0x00F08228
.eqv INK, 0x00201810

.data
display: .space 16384       # SIDE * SIDE words, four bytes each
pipes:   .word 0, 0, 0      # three records: left x, gap middle, counted
         .word 0, 0, 0
         .word 0, 0, 0
pipes_end:
seed:    .word 0x1F123BB5
label:   .asciz "Score: "
over:    .asciz "Game over. Score: "
bestmsg: .asciz ", best: "

.text
.globl main
main:
    addi sp, sp, -12        # Playground starts 12 mod 16; align before any call
    la s0, display
    li s7, MMIO
    li s6, 0                # the best score of the session

new_game:
    li s2, STARTY           # the bird, in sixteenths of a row
    li s3, 0                # and how fast it is falling
    li s4, READY
    li s5, 0                # the score
    jal new_pipes
    jal paint_grid

frame:
# --- every character typed since the last frame, and only the flaps count ----
    li s10, 0
read_key:
    lw t0, 0(s7)            # the receiver control register
    andi t0, t0, 1          # the Ready bit
    beqz t0, keys_read
    lw t1, 4(s7)            # the receiver data, which takes the character
    andi t1, t1, 0xFF
    li t2, ' '
    beq t1, t2, flapped
    li t2, 'w'
    beq t1, t2, flapped
    li t2, 10               # and Enter, which arrives as a newline
    bne t1, t2, read_key
flapped:
    li s10, 1               # a flap began this frame
    j read_key
keys_read:
    li t0, PLAYING
    beq s4, t0, playing
    li t0, DEAD
    beq s4, t0, dead

# --- waiting to start: the bird hangs still until the first flap -------------
    beqz s10, draw
    li a7, 30               # service 30: milliseconds since the run started
    ecall
    sw a0, seed, t0         # so the course depends on when the player began
    jal new_pipes
    jal paint_grid
    li s4, PLAYING
    li s3, FLAPV
    j draw

# --- playing -----------------------------------------------------------------
playing:
    beqz s10, fall
    li s3, FLAPV            # one tap is one flap, however fast you tap
fall:
    addi s3, s3, GRAV
    li t0, MAXFALL
    ble s3, t0, capped
    mv s3, t0
capped:
    add s2, s2, s3
    bgez s2, in_sky
    li s2, 0                # the top of the grid is a bump, not a death
    li s3, 0
in_sky:
    jal move_pipes
    jal hit_test
    beqz a0, draw
    li s4, DEAD
    li a3, DEADGROUND       # the ground turns, since there is no text here
    jal paint_ground
    ble s5, s6, say_over
    mv s6, s5
say_over:
    li a7, 4
    la a0, over
    ecall
    li a7, 1
    mv a0, s5
    ecall
    li a7, 4
    la a0, bestmsg
    ecall
    li a7, 1
    mv a0, s6
    ecall
    li a7, 11
    li a0, '\n'
    ecall
    j draw

# --- dead: the bird drops to the ground, then waits for a flap ---------------
dead:
    bnez s10, new_game
    addi s3, s3, GRAV
    li t0, MAXFALL
    ble s3, t0, dcapped
    mv s3, t0
dcapped:
    add s2, s2, s3
    li t0, RESTY
    ble s2, t0, draw
    mv s2, t0
    li s3, 0

draw:
    jal draw_bird
    li a7, 32               # service 32: a frame of program time
    li a0, FRAME
    ecall
    j frame

#-----------------------------------------------------------------------------
# The world
#-----------------------------------------------------------------------------
# new_pipes(): three pipes off to the right, each with a gap of its own
new_pipes:
    addi sp, sp, -16
    sw ra, 0(sp)
    la t3, pipes
    li t4, FIRSTX
    la t5, pipes_end
np_next:
    sw t4, 0(t3)            # where its left edge is
    jal random_gap
    sw a0, 4(t3)            # the middle of its gap
    sw zero, 8(t3)          # and it has not been counted yet
    addi t4, t4, SPACING
    addi t3, t3, 12
    blt t3, t5, np_next
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# move_pipes(): everything scrolls one column to the left. A pipe that has left
# the grid jumps a whole cycle to the right with a new gap, which is why three
# pipes are an endless course.
move_pipes:
    addi sp, sp, -16
    sw ra, 0(sp)
    sw s8, 4(sp)
    la s8, pipes
mp_next:
    lw t0, 0(s8)
    addi t0, t0, -1
    li t1, -PIPEW
    bge t0, t1, mp_moved
    addi t0, t0, CYCLE
    jal random_gap          # which leaves t0 alone
    sw a0, 4(s8)
    sw zero, 8(s8)
mp_moved:
    sw t0, 0(s8)

    lw t1, 8(s8)            # already counted?
    bnez t1, mp_counted
    addi t1, t0, PIPEW
    li t2, BIRDX
    bge t1, t2, mp_counted
    li t1, 1
    sw t1, 8(s8)
    addi s5, s5, 1          # its right edge has passed the bird
    li a7, 4
    la a0, label
    ecall
    li a7, 1
    mv a0, s5
    ecall
    li a7, 11
    li a0, '\n'
    ecall
mp_counted:
    lw a0, 0(s8)            # the column it has just come into
    jal paint_column
    lw a0, 0(s8)
    addi a0, a0, PIPEW      # and the one it has just left
    jal paint_column

    addi s8, s8, 12
    la t0, pipes_end
    blt s8, t0, mp_next
    lw s8, 4(sp)
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# hit_test(): 1 in a0 when the bird is touching a pipe or the ground
hit_test:
    srli t0, s2, 4          # the bird's top row
    addi t1, t0, BIRDH      # and one past its bottom one
    li t2, GROUNDY
    ble t1, t2, ht_sky      # [top, bottom) ends before the first ground row
    li a0, 1
    ret
ht_sky:
    la t2, pipes
    la t3, pipes_end
ht_next:
    lw t4, 0(t2)
    li t5, BIRDR
    bge t4, t5, ht_skip     # this pipe is still to the right of the bird
    addi t5, t4, PIPEW
    li t6, BIRDX
    ble t5, t6, ht_skip     # and this one is already behind it
    lw t5, 4(t2)
    addi t6, t5, -HALFGAP
    blt t0, t6, ht_hit      # above the gap
    addi t6, t5, HALFGAP
    bgt t1, t6, ht_hit      # below it
ht_skip:
    addi t2, t2, 12
    blt t2, t3, ht_next
    li a0, 0
    ret
ht_hit:
    li a0, 1
    ret

# random_gap(): the middle of the next gap, in a0, from a supplied 32 bit
# xorshift. Besides ra set by jal, it changes only a0 and t6.
random_gap:
    lw a0, seed
    slli t6, a0, 13
    xor a0, a0, t6          # x = x ^ (x << 13)
    srli t6, a0, 17
    xor a0, a0, t6          # x = x ^ (x >> 17)
    slli t6, a0, 5
    xor a0, a0, t6          # x = x ^ (x << 5)
    sw a0, seed, t6
    srli a0, a0, 8          # its high bits are the ones worth using
    li t6, GAPSPAN
    remu a0, a0, t6
    addi a0, a0, GAPMIN
    ret

#-----------------------------------------------------------------------------
# Drawing
#-----------------------------------------------------------------------------
# fill_span(a0=col, a1=from, a2=to, a3=colour): paint the half-open row range
# [from, to), clipped to the window [t3, t4). It changes t0 and t1; t3 and t4
# survive the call.
fill_span:
    bge a1, t3, fs_top
    mv a1, t3
fs_top:
    ble a2, t4, fs_rows
    mv a2, t4
fs_rows:
    sub t1, a2, a1
    blez t1, fs_done        # a span the window has closed draws nothing
    slli t0, a1, 6          # row * SIDE
    add t0, t0, a0          # + col
    slli t0, t0, 2          # four bytes a word
    add t0, t0, s0
fs_next:
    sw a3, 0(t0)
    addi t0, t0, 256        # SIDE * 4, straight down to the next row
    addi t1, t1, -1
    bnez t1, fs_next
fs_done:
    ret

# world_column(a0=col, t3=window start, t4=window end): paint the sky, any pipe,
# and the ground within [t3, t4). It preserves the window because fill_span
# preserves t3 and t4. A column outside the grid draws nothing.
world_column:
    bltz a0, wc_done
    li t2, SIDE
    bge a0, t2, wc_done
    addi sp, sp, -16
    sw ra, 0(sp)

    la t2, pipes            # is a pipe standing in this column
    la t6, pipes_end
    li t5, -1
wc_find:
    lw t1, 0(t2)
    blt a0, t1, wc_skip
    addi t1, t1, PIPEW
    bge a0, t1, wc_skip
    lw t5, 4(t2)            # the middle of its gap
wc_skip:
    addi t2, t2, 12
    blt t2, t6, wc_find

    bltz t5, wc_sky
    li a3, PIPE
    li a1, 0
    addi a2, t5, -HALFGAP
    jal fill_span           # from the top of the grid down to the gap
    li a3, SKY
    addi a1, t5, -HALFGAP
    addi a2, t5, HALFGAP
    jal fill_span           # the gap itself
    li a3, PIPE
    addi a1, t5, HALFGAP
    li a2, GROUNDY
    jal fill_span           # and from the gap down to the ground
    j wc_ground
wc_sky:
    li a3, SKY
    li a1, 0
    li a2, GROUNDY
    jal fill_span
wc_ground:
    li a3, GRASS
    li t2, DEAD
    bne s4, t2, wc_ground_colour
    li a3, DEADGROUND       # bird-column redraws keep dead ground red
wc_ground_colour:
    li a1, GROUNDY
    li a2, GRASSB
    jal fill_span
    li a3, SAND
    li t2, DEAD
    bne s4, t2, wc_sand_colour
    li a3, DEADGROUND
wc_sand_colour:
    li a1, GRASSB
    li a2, SIDE
    jal fill_span
    lw ra, 0(sp)
    addi sp, sp, 16
wc_done:
    ret

# paint_column(col): the whole of one column of the world
paint_column:
    li t3, 0
    li t4, SIDE
    j world_column          # which returns to paint_column's own caller

# paint_grid(): every column, which is the one full repaint a game has
paint_grid:
    addi sp, sp, -16
    sw ra, 0(sp)
    sw s8, 4(sp)
    li s8, 0
pg_next:
    mv a0, s8
    jal paint_column
    addi s8, s8, 1
    li t0, SIDE
    blt s8, t0, pg_next
    lw s8, 4(sp)
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# paint_ground(a3=colour): the eight rows of ground, right across the grid
paint_ground:
    addi sp, sp, -16
    sw ra, 0(sp)
    li t3, 0
    li t4, SIDE
    li a0, 0
pd_next:
    li a1, GROUNDY
    li a2, SIDE
    jal fill_span           # which leaves a0, the column, alone
    addi a0, a0, 1
    li t2, SIDE
    blt a0, t2, pd_next
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# draw_bird(): the six columns the bird flies down, each painted in one pass:
# the world above it, the bird, the world below it. Every word is written once
# with the colour it ends the frame in, so the bird is never half erased.
draw_bird:
    addi sp, sp, -16
    sw ra, 0(sp)
    sw s8, 4(sp)
    sw s9, 8(sp)
    srli s9, s2, 4          # the bird's top row
    li s8, BIRDX
db_next:
    mv a0, s8
    li t3, 0
    mv t4, s9
    jal world_column        # the world above the bird

    mv a0, s8
    li t3, 0
    li t4, SIDE
    li a3, BODY
    mv a1, s9
    addi a2, s9, BIRDH
    jal fill_span           # the bird itself

    mv a0, s8
    addi t3, s9, BIRDH
    li t4, SIDE
    jal world_column        # and the world below it

    addi s8, s8, 1
    li t0, BIRDR
    blt s8, t0, db_next

    li t3, 0
    li t4, SIDE
    li a3, INK              # an eye
    li a0, 16
    addi a1, s9, 1
    addi a2, s9, 2
    jal fill_span
    li a3, BEAK             # and a beak, over the body's last column
    li a0, 17
    addi a1, s9, 2
    addi a2, s9, 4
    jal fill_span

    lw s9, 8(sp)
    lw s8, 4(sp)
    lw ra, 0(sp)
    addi sp, sp, 16
    ret
```

```testcase
{ "runFor": 200000 }
```

## Frame and states

`s4` selects one of three update paths. In `READY`, the bird stays at its starting height. The first
accepted key seeds the gap sequence, creates the pipes, changes the state to `PLAYING`, and sets
`s3` to `FLAPV`. The bird is drawn at the starting height in that frame; gravity and movement begin
on the next frame. In `PLAYING`, the program updates velocity and position, moves the pipes, and
checks for a collision. After a collision, `DEAD` lets the bird continue falling until it rests on
the ground.

The input loop reads every queued character. The receiver Ready bit remains set while a character
is waiting, so `read_key` continues until the queue is empty. `s10` records a yes-or-no result for
the frame: three accepted characters still produce one flap.

An ordinary conditional branch compares two registers. That is why the nonzero character constant
in `li t2, ' '` must be loaded before `beq t1, t2, flapped`. Thresholds work the same way: the code
loads `MAXFALL` into `t0` before comparing `s3` and `t0`. By contrast, the zero-branch forms
`beqz s10, draw` and `bnez s10, new_game` need no loaded zero, and `bgez s2, in_sky` compares
directly with zero as well.

`main` begins with `addi sp, sp, -12`. The Playground starts `sp` at `0x7fffeffc`, which is 12
modulo 16: four bytes before the next 16-byte boundary. Subtracting 12 produces `0x7fffeff0`, so
this one-time adjustment aligns the stack before the first `jal`. Every helper then allocates a
multiple of 16 bytes and keeps that alignment. `main` never returns, so it has no later caller for
which it must restore the 12 bytes.

## Bird physics

`s2` stores the bird's top position in **sixteenths of a row**, and `s3` stores its velocity in the
same units per frame. Gravity adds 3 to the velocity. A flap replaces the velocity with -26, where a
negative value means upward movement. `MAXFALL` limits the downward velocity.

The position can retain a fraction even though the screen uses whole rows. For example, starting
from 320 with velocity 0, three frames without a flap give these values:

| Frame | velocity after gravity | position | displayed row (`position >> 4`) |
| ----: | ---------------------: | -------: | ------------------------------: |
|     1 |                      3 |      323 |                              20 |
|     2 |                      6 |      329 |                              20 |
|     3 |                      9 |      338 |                              21 |

The low four bits remain in `s2` for the next update. Drawing discards them with a shift.

## Pipe records and scoring

`move_pipes` subtracts one from each pipe's left edge. When that edge moves past `-PIPEW`, the pipe
is completely off-screen. Adding `CYCLE`, which is three times `SPACING`, moves the same record to
the next evenly spaced position on the right. It receives a new gap and its `counted` word returns
to zero.

The score increases after a pipe's right edge passes the bird's left edge. Setting `counted` to 1
ensures that later frames do not score the same pipe again.

Treat `random_gap` as a supplied helper, as in the Snake game. Its useful contract is: it returns a
gap middle in `a0`, and, besides the link address created by `jal`, it changes only `a0` and `t6`.
Service 30 supplies an elapsed-millisecond seed when play begins, while xorshift deterministically
produces the following values. This gives variation, not a guarantee that every run has a unique
course.

## Collision ranges

The hit test uses **half-open intervals**: the first position belongs to the object and the position
after the end does not. Horizontally, the bird occupies `[BIRDX, BIRDR)` and a pipe occupies
`[left, left + PIPEW)`.

```text
no overlap                 overlap
bird [12,18) pipe [18,26)  bird [12,18)
             ^ touching        pipe [17,25)
             edges only             ^ shared column 17
```

There is no horizontal overlap when the pipe starts at or beyond `BIRDR`, or when its right edge is
at or before `BIRDX`. That explains the `bge` and `ble` branches in `hit_test`.

The same convention applies vertically. If the top row is 20 and `BIRDH` is 5, the bird occupies
`[20, 25)`. A gap with middle 28 and `HALFGAP` 9 occupies `[19, 37)`, so the bird fits. The test uses
strict `blt` and `bgt` for the pipe edges: equality means the bird still fits exactly. The ground
starts at `GROUNDY`; a bottom-exclusive edge equal to `GROUNDY` is still safe, which is why the
ground test branches with `ble`.

## Painting one column

`fill_span` has this contract:

```text
a0 = column   a1 = from row   a2 = to row   a3 = colour
t3 = window start             t4 = window end
```

It paints `[a1, a2)`, clipped to `[t3, t4)`. For example, a request for `[8, 20)` with the window
`[12, 17)` paints rows 12 through 16. It changes `t0` and `t1`; the window in `t3` and `t4` survives.

`world_column` examines the pipe records and reconstructs one column: sky or pipe above the gap,
the gap, pipe down to the ground, and then the ground. Its inputs are the column in `a0` and the
clipping window in `t3` and `t4`. In the dead state, it selects `DEADGROUND`, so repainting the
world around the falling bird keeps every ground column red.

For a pipe that moves from `[62, 70)` to `[61, 69)`, the changed columns are:

```text
old:  62 63 64 65 66 67 68 69
new:  61 62 63 64 65 66 67 68
      ^^                      ^^
      newly covered           newly uncovered
```

`paint_column` establishes a full-height window and uses `j world_column`. That jump does not create
a new link address. `world_column` therefore returns through the `ra` supplied by
`paint_column`'s caller, directly to that caller.

`draw_bird` paints each of the bird's six columns in three main bands:

```text
[0, top)                 world above
[top, top + BIRDH)       bird body
[top + BIRDH, SIDE)      world below
```

The bands do not overlap, so the body/background pass writes each word in the column once. After
that pass, the eye and beak deliberately overwrite a few body words to add detail.

## Saved registers across calls

A value needed after a helper call cannot be left in a temporary register that the helper changes.
This program uses saved registers for those longer-lived values. The non-returning frame loop owns
`s10`, so every called helper must preserve it. `move_pipes` and `paint_grid` borrow `s8` and save it
in their stack frames. `draw_bird` borrows both `s8` and `s9` and saves both. Each returning helper
also saves `ra` when it makes nested calls.

The score is printed in the console. The screen signals a collision by turning the ground dark red.

## Try it

1. Change `FRAME` or `GRAV`. Before running the program, calculate the first three velocities,
   positions, and displayed rows for a bird starting at `STARTY` with velocity zero.
2. Move the bird by changing `BIRDX`. Update `BIRDR` so that `[BIRDX, BIRDR)` remains exactly
   `BIRDW` columns wide.
3. Remove `w` as a flap key, or replace it with another character. Space and Enter should continue
   to work.
4. Trace a pipe whose left edge is `-PIPEW - 1`. After recycling, what left edge does it receive?
   Then trace its `counted` word.
5. For intervals `[12, 18)` and `[x, x + 8)`, show that there is no overlap when either `x >= 18`
   or `x + 8 <= 12`. Test both alternatives with `x = 18`, `x = 17`, and `x = 4`.
6. Change `HALFGAP` to 6. Calculate the resulting gap height and check that drawing and collision
   use the same two boundaries.
7. Harder: change the dead-state ground colour. Find both places that participate in keeping that
   colour consistent: the full ground repaint and later `world_column` redraws.
