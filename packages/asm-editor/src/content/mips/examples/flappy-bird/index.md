A small Flappy Bird game on a 64 × 64 cell Screen. Tap Space, lowercase `w`, or Enter to flap. The
bird falls between taps, pipes move left, and passing one adds a point in the Console. A collision
turns the ground dark red; another tap resets the game.

Select **Open in editor**, then **Build** and **Run**. Click the **Screen** before typing; click it
again after returning to the editor. The fixed `testcase` below supplies no keys, so it checks the
waiting screen, not flaps or collisions. Screen cells are words in `display`.

Here is a map for the longer program. Read `frame` through `draw` first, then `new_pipes`,
`move_pipes`, and `hit_test`; leave the drawing helpers until you want to see how the picture is
painted.

- `$s4` is `READY` (waiting) → `PLAYING` (moving) → `DEAD` (falling and waiting for a reset).
  A flap in `DEAD` jumps to `new_game`, returning to `READY`; the next flap starts play.
- `$s2` is bird height and `$s3` is vertical speed, both in sixteenths of a row. A smaller row
  number is higher on the Screen.
- `pipes` holds three 12-byte records: left edge `x` at offset 0, gap middle at offset 4, and a
  counted flag at offset 8. The initial left edges are 62, 86, and 110.
- Rows are 0–63; ground begins at row 56. A bird at top row `top` occupies
  `[top, top + BIRDH)`, and a pipe at `x` occupies `[x, x + PIPEW)`. With gap middle `m`, the open
  rows are `[m - HALFGAP, m + HALFGAP)`. The right endpoint is excluded in each interval.
- Each frame drains the waiting keys, handles the current state, draws the bird, waits `FRAME`
  milliseconds, and repeats. While playing, it updates speed and height, moves pipes, checks
  collisions, then draws. A reset from `DEAD` starts again at `new_game` instead of finishing
  that old frame.

```mips|playground|open-screen|console|no-registers|allow-open
# @screen unit=4 width=256 height=256 base=display
.eqv MMIO 0xffff0000
.eqv SIDE 64                # the grid, in words across and down
.eqv GROUNDY 56             # the first row of ground
.eqv GRASSB 58              # and the first row of sand under the grass
.eqv BIRDX 12               # the bird only ever moves up and down
.eqv BIRDW 6
.eqv BIRDH 5
.eqv BIRDR 18               # BIRDX + BIRDW
.eqv PIPEW 8                # and -PIPEW is where a pipe is recycled
.eqv HALFGAP 9
.eqv SPACING 24             # between one pipe and the next
.eqv CYCLE 72               # SPACING * 3, what a recycled pipe jumps by
.eqv FIRSTX 62
.eqv GAPMIN 13              # the highest the middle of a gap goes
.eqv GAPSPAN 26             # and how far below that it can be
.eqv GRAV 3                 # sixteenths of a row, per frame, per frame
.eqv FLAPV -26              # the speed one flap gives, upwards
.eqv MAXFALL 26
.eqv STARTY 320             # 20 * 16, where the bird waits
.eqv RESTY 816              # (GROUNDY - BIRDH) * 16, where a dead bird lands
.eqv FRAME 80               # milliseconds a frame
.eqv READY 0
.eqv PLAYING 1
.eqv DEAD 2
.eqv SKY 0x004EC0E8
.eqv PIPE 0x0058BB39
.eqv GRASS 0x0074C458
.eqv SAND 0x00DED895
.eqv DEADGROUND 0x00B03028
.eqv BODY 0x00FACE3E
.eqv BEAK 0x00F08228
.eqv INK 0x00201810

.data
display: .space 16384       # SIDE * SIDE words, four bytes each
pipes:   .word 62, 20, 0    # its left edge, the middle of its gap, counted yet
         .word 86, 28, 0
         .word 110, 16, 0
pipes_end:
seed:    .word 0x1F123BB5
label:   .asciz "Score: "
over:    .asciz "Game over. Score: "
bestmsg: .asciz ", best: "

.text
.globl main
main:
    la $s1, display
    li $s7, MMIO
    li $s6, 0               # the best score of the session

new_game:
    li $s2, STARTY          # the bird, in sixteenths of a row
    li $s3, 0               # and how fast it is falling
    li $s4, READY
    li $s5, 0               # the score
    jal new_pipes
    jal paint_grid

frame:
# --- every character typed since the last frame, and only the flaps count ----
    li $t8, 0
read_key:
    lw $t0, 0($s7)          # the receiver control register
    andi $t0, $t0, 1        # the Ready bit
    beqz $t0, keys_read
    lw $t1, 4($s7)          # the receiver data, which takes the character
    andi $t1, $t1, 0xFF
    beq $t1, ' ', flapped
    beq $t1, 'w', flapped
    bne $t1, 10, read_key   # and Enter, which arrives as a newline
flapped:
    li $t8, 1               # a flap began this frame
    j read_key
keys_read:
    beq $s4, PLAYING, playing
    beq $s4, DEAD, dead

# --- waiting to start: the bird hangs still until the first flap -------------
    beqz $t8, draw
    li $v0, 30              # service 30: milliseconds since the run started
    syscall
    sw $a0, seed            # starting time changes the gap sequence
    jal new_pipes
    jal paint_grid
    li $s4, PLAYING
    li $s3, FLAPV
    j draw

# --- playing -----------------------------------------------------------------
playing:
    beqz $t8, fall
    li $s3, FLAPV           # one tap is one flap, however fast you tap
fall:
    addi $s3, $s3, GRAV
    ble $s3, MAXFALL, capped
    li $s3, MAXFALL
capped:
    add $s2, $s2, $s3
    bgez $s2, in_sky
    li $s2, 0               # the top of the grid is a bump, not a death
    li $s3, 0
in_sky:
    jal move_pipes
    jal hit_test
    beqz $v0, draw
    li $s4, DEAD
    li $a3, DEADGROUND      # the ground turns, since there is no text here
    jal paint_ground
    ble $s5, $s6, say_over
    move $s6, $s5
say_over:
    li $v0, 4
    la $a0, over
    syscall
    li $v0, 1
    move $a0, $s5
    syscall
    li $v0, 4
    la $a0, bestmsg
    syscall
    li $v0, 1
    move $a0, $s6
    syscall
    li $v0, 11
    li $a0, '\n'
    syscall
    j draw

# --- dead: the bird drops to the ground, then waits for a flap ---------------
dead:
    bnez $t8, new_game
    addi $s3, $s3, GRAV
    ble $s3, MAXFALL, dcapped
    li $s3, MAXFALL
dcapped:
    add $s2, $s2, $s3
    ble $s2, RESTY, draw
    li $s2, RESTY
    li $s3, 0

draw:
    jal draw_bird
    li $v0, 32              # service 32: a frame of program time
    li $a0, FRAME
    syscall
    j frame

#-----------------------------------------------------------------------------
# The world
#-----------------------------------------------------------------------------
# new_pipes(): three pipes off to the right, each with a gap of its own
new_pipes:
    addi $sp, $sp, -4
    sw $ra, 0($sp)
    la $t7, pipes
    li $t6, FIRSTX
    li $t5, 3
np_next:
    sw $t6, 0($t7)          # where its left edge is
    jal random_gap
    sw $v0, 4($t7)          # the middle of its gap
    sw $zero, 8($t7)        # and it has not been counted yet
    addi $t6, $t6, SPACING
    addi $t7, $t7, 12
    addi $t5, $t5, -1
    bnez $t5, np_next
    lw $ra, 0($sp)
    addi $sp, $sp, 4
    jr $ra

# move_pipes(): everything scrolls one column to the left. A pipe that has left
# the grid jumps a whole cycle to the right with a new gap, which is why three
# pipes are an endless course.
move_pipes:
    addi $sp, $sp, -8
    sw $ra, 4($sp)
    sw $s0, 0($sp)
    la $s0, pipes
mp_next:
    lw $t7, 0($s0)
    addi $t7, $t7, -1
    bge $t7, -PIPEW, mp_moved
    addi $t7, $t7, CYCLE
    jal random_gap
    sw $v0, 4($s0)
    sw $zero, 8($s0)
mp_moved:
    sw $t7, 0($s0)

    lw $t6, 8($s0)          # already counted?
    bnez $t6, mp_counted
    addi $t6, $t7, PIPEW
    bge $t6, BIRDX, mp_counted
    li $t6, 1
    sw $t6, 8($s0)
    addi $s5, $s5, 1        # its right edge has passed the bird
    li $v0, 4
    la $a0, label
    syscall
    li $v0, 1
    move $a0, $s5
    syscall
    li $v0, 11
    li $a0, '\n'
    syscall
mp_counted:
    lw $a0, 0($s0)          # the column it has just come into
    jal paint_column
    lw $a0, 0($s0)
    addi $a0, $a0, PIPEW    # and the one it has just left
    jal paint_column

    addi $s0, $s0, 12
    la $t7, pipes_end
    blt $s0, $t7, mp_next
    lw $s0, 0($sp)
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra

# hit_test(): 1 in $v0 when the bird is touching a pipe or the ground
hit_test:
    srl $t0, $s2, 4         # the bird's top row
    addi $t1, $t0, BIRDH    # and one past its bottom one
    ble $t1, GROUNDY, ht_sky # bottom edge at row 56 is still above ground
    li $v0, 1
    jr $ra
ht_sky:
    la $t2, pipes
    li $t3, 3
ht_next:
    lw $t4, 0($t2)
    bge $t4, BIRDR, ht_skip # this pipe is still to the right of the bird
    addi $t5, $t4, PIPEW
    ble $t5, BIRDX, ht_skip # and this one is already behind it
    lw $t6, 4($t2)
    addi $t7, $t6, -HALFGAP
    blt $t0, $t7, ht_hit    # above the gap
    addi $t7, $t6, HALFGAP
    bgt $t1, $t7, ht_hit    # below it
ht_skip:
    addi $t2, $t2, 12
    addi $t3, $t3, -1
    bnez $t3, ht_next
    li $v0, 0
    jr $ra
ht_hit:
    li $v0, 1
    jr $ra

# random_gap(): the middle of the next gap, in $v0, from a 32 bit xorshift.
# It changes $v0, $t9, and HI/LO.
random_gap:
    lw $v0, seed
    bnez $v0, rg_step       # zero would remain zero after every shift and xor
    li $v0, 0x1F123BB5
rg_step:
    sll $t9, $v0, 13
    xor $v0, $v0, $t9       # x = x ^ (x << 13)
    srl $t9, $v0, 17
    xor $v0, $v0, $t9       # x = x ^ (x >> 17)
    sll $t9, $v0, 5
    xor $v0, $v0, $t9       # x = x ^ (x << 5)
    sw $v0, seed
    srl $v0, $v0, 8         # its high bits are the ones worth using
    li $t9, GAPSPAN
    divu $v0, $t9
    mfhi $v0
    addi $v0, $v0, GAPMIN
    jr $ra

#-----------------------------------------------------------------------------
# Drawing
#-----------------------------------------------------------------------------
# fill_span(col, from, to, colour): rows from to to-1 of one column, in one
# colour, and never a row outside the window in $t8 and $t9. It also changes
# $a1 and $a2 when clipping, plus $t0 and $t1.
fill_span:
    bge $a1, $t8, fs_top
    move $a1, $t8
fs_top:
    ble $a2, $t9, fs_rows
    move $a2, $t9
fs_rows:
    sub $t1, $a2, $a1
    blez $t1, fs_done       # a span the window has closed draws nothing
    sll $t0, $a1, 6         # row * SIDE
    add $t0, $t0, $a0       # + col
    sll $t0, $t0, 2         # four bytes a word
    add $t0, $t0, $s1
fs_next:
    sw $a3, 0($t0)
    addi $t0, $t0, 256      # SIDE * 4, straight down to the next row
    addi $t1, $t1, -1
    bnez $t1, fs_next
fs_done:
    jr $ra

# world_column(col): the sky, the pipe standing in this column if one does, and
# the ground, in as much of the column as the window allows. A column off either
# side of the grid draws nothing.
world_column:
    bltz $a0, wc_done
    bge $a0, SIDE, wc_done
    addi $sp, $sp, -4
    sw $ra, 0($sp)

    la $t2, pipes           # is a pipe standing in this column
    li $t3, 3
    li $t4, -1
wc_find:
    lw $t5, 0($t2)
    blt $a0, $t5, wc_skip
    addi $t6, $t5, PIPEW
    bge $a0, $t6, wc_skip
    lw $t4, 4($t2)          # the middle of its gap
wc_skip:
    addi $t2, $t2, 12
    addi $t3, $t3, -1
    bnez $t3, wc_find

    bltz $t4, wc_sky
    li $a3, PIPE
    li $a1, 0
    addi $a2, $t4, -HALFGAP
    jal fill_span           # from the top of the grid down to the gap
    li $a3, SKY
    addi $a1, $t4, -HALFGAP
    addi $a2, $t4, HALFGAP
    jal fill_span           # the gap itself
    li $a3, PIPE
    addi $a1, $t4, HALFGAP
    li $a2, GROUNDY
    jal fill_span           # and from the gap down to the ground
    j wc_ground
wc_sky:
    li $a3, SKY
    li $a1, 0
    li $a2, GROUNDY
    jal fill_span
wc_ground:
    li $a3, GRASS
    li $a1, GROUNDY
    li $a2, GRASSB
    jal fill_span
    li $a3, SAND
    li $a1, GRASSB
    li $a2, SIDE
    jal fill_span
    lw $ra, 0($sp)
    addi $sp, $sp, 4
wc_done:
    jr $ra

# paint_column(col): the whole of one column of the world
paint_column:
    li $t8, 0
    li $t9, SIDE
    j world_column          # which returns to paint_column's own caller

# paint_grid(): every column, which is the one full repaint a game has
paint_grid:
    addi $sp, $sp, -8
    sw $ra, 4($sp)
    sw $s0, 0($sp)
    li $s0, 0
pg_next:
    move $a0, $s0
    jal paint_column
    addi $s0, $s0, 1
    blt $s0, SIDE, pg_next
    lw $s0, 0($sp)
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra

# paint_ground(colour): the eight rows of ground, right across the grid
paint_ground:
    addi $sp, $sp, -4
    sw $ra, 0($sp)
    li $t8, 0
    li $t9, SIDE
    li $a0, 0
pd_next:
    li $a1, GROUNDY
    li $a2, SIDE
    jal fill_span
    addi $a0, $a0, 1
    blt $a0, SIDE, pd_next
    lw $ra, 0($sp)
    addi $sp, $sp, 4
    jr $ra

# draw_bird(): in each bird column, paint the world above, the body, then the
# world below. The eye and beak then replace a few body cells.
draw_bird:
    addi $sp, $sp, -8
    sw $ra, 4($sp)
    sw $s0, 0($sp)
    srl $t7, $s2, 4         # the bird's top row, which world_column leaves alone
    li $s0, BIRDX
db_next:
    move $a0, $s0
    li $t8, 0
    move $t9, $t7
    jal world_column        # the world above the bird

    move $a0, $s0
    li $t8, 0
    li $t9, SIDE
    li $a3, BODY
    move $a1, $t7
    addi $a2, $t7, BIRDH
    jal fill_span           # the bird itself

    move $a0, $s0
    addi $t8, $t7, BIRDH
    li $t9, SIDE
    jal world_column        # and the world below it

    addi $s0, $s0, 1
    blt $s0, BIRDR, db_next

    li $t8, 0
    li $t9, SIDE
    li $a3, INK             # an eye
    li $a0, 16
    addi $a1, $t7, 1
    addi $a2, $t7, 2
    jal fill_span
    li $a3, BEAK            # and a beak, over the body's last column
    li $a0, 17
    addi $a1, $t7, 2
    addi $a2, $t7, 4
    jal fill_span

    lw $s0, 0($sp)
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra
```

```testcase
{ "runFor": 200000 }
```

### Follow one frame

`read_key` checks the keyboard receiver's Ready bit. Reading its data register consumes one
character, so the loop keeps reading until the queue is empty. Space, lowercase `w`, and Enter
(newline 10) set `$t8` to 1. Several flap characters collected during one frame still make one
flap. In `READY`, that flap initializes the pipes and sets speed to `FLAPV`; movement begins on the
next `PLAYING` frame. In `DEAD`, a flap jumps to `new_game`, which waits for another flap.

During `PLAYING`, a flap sets speed `$s3` to `-26`. Gravity then adds 3, the speed is limited to
`MAXFALL`, and that speed is added to height `$s2`. Starting at `STARTY = 320` (row 20), the first
playing frame after a flap makes speed `-26 + 3 = -23` and height `320 - 23 = 297`. The drawn top
row is `297 >> 4 = 18`. With no flap on the next frame, speed becomes `-20`, height becomes `277`,
and the drawn top row is 17. The lower four bits of height remain stored, so small changes can
accumulate even when the drawn row stays the same. Reaching the top clamps height and speed to 0.

`move_pipes` moves each left edge one column left. Once an edge moves past `-PIPEW` (`-8`), it adds
`CYCLE` (`72`), chooses a new gap, and clears that record's counted flag. Since there are three
pipes spaced 24 columns apart, `CYCLE = 3 × SPACING` keeps their spacing. When a pipe's right edge
is strictly left of `BIRDX` (12), its flag changes to 1 and the Console prints the new score.

`hit_test` compares edges using the half-open intervals in the map. For example, with gap middle
20 and `HALFGAP = 9`, open rows are `[11, 29)`, meaning rows 11 through 28. A bird with top row
24 occupies `[24, 29)` and fits vertically; top row 25 occupies `[25, 30)` and touches the lower
pipe if their columns overlap. Ground begins at row 56, so a bird occupying `[51, 56)` is still
clear, while `[52, 57)` touches it. A collision changes `$s4` to `DEAD`, paints the ground red,
and prints the final and best scores. The dead bird then falls to its resting height.

### Read the drawing helpers

`world_column` computes sky, pipe, gap, grass, and sand from a column number and the three pipe
records. `fill_span` paints rows in `[from, to)` within the clipping window `$t8` to `$t9`. When
it clips a span it changes `$a1` or `$a2`; it also uses `$t0` and `$t1`. For each moving pipe,
`move_pipes` repaints the column it entered and the column it left. `paint_grid` paints the full
Screen at the start of a game.

`draw_bird` repaints its six columns in three bands: world above, yellow body, world below. It
then puts the eye and beak over some body cells, so those cells receive another write. Painting
these bands avoids a separate erase pass for the bird. Screen updates can still be visible while
they happen; the code does not promise flicker-free display.

The screen contains coloured cells, not text. Scores therefore go to the Console, while red
ground marks a collision on the Screen. `new_pipes`, `move_pipes`, `paint_grid`, and `draw_bird`
save `$ra` because they call other routines; the loops that use `$s0` save and restore it too.
`random_gap` changes `$v0` and `$t9`, as well as the division's HI and LO registers. That leaves
the pipe's left edge in `$t7` available across the call.

`random_gap` advances a stored number with shifts and `xor`, then divides by `GAPSPAN` to obtain
a remainder from 0 through 25. Adding `GAPMIN` gives a middle row from 13 through 38. Service 30
supplies a starting time on the first flap, which changes this repeatable sequence according to
when play starts. If that time is zero, the generator uses its nonzero fallback seed; zero would
stay zero through every xorshift step.

### Try it

Change `.eqv HALFGAP 9` to `6`. Before running, predict the open rows for a pipe whose middle is
20: `[20 - 6, 20 + 6) = [14, 26)`, or rows 14 through 25. Build and Run to see narrower gaps.
Both drawing and collision checking use the same constant, so a bird at top row 22 occupies
`[22, 27)` and no longer fits in that example gap.

Restore `HALFGAP` to 9, then change `.eqv FLAPV -26` to `-16`. Predict the first playing frame
after a starting flap: speed becomes `-16 + 3 = -13`, height becomes `320 - 13 = 307`, and the
drawn top row is `307 >> 4 = 19`. Build and Run, tap once, and watch for a gentler rise. The
starting flap still draws the waiting bird at row 20 before that playing frame.
