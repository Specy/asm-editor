A playable flappy bird. The bird falls all the time, one tap of the space bar gives it one flap
upwards, and the pipes scroll in from the right with their gaps in a different place every game. It
ends the moment the bird touches a pipe or the ground, the ground turns dark red to say so, and
another tap starts the next one.

**Click the Screen panel before you press a key**, the same as in Move a square with the keyboard.

**You need to know:** everything above it on the ladder. The keyboard is polled the way Move a square
with the keyboard polls it, only what changed is redrawn the way A bouncing ball does it, and the
pipes are an array of records walked with a pointer. What is new is the **state machine** a game is,
the **sixteenths of a row** the bird's height is measured in, because a bird that can only move in
whole rows cannot accelerate smoothly, and a grid painted **one column at a time** out of the world
the program keeps in memory.

```riscv|playground|open-screen|console|no-registers|allow-open
# @screen unit=4 width=256 height=256 base=display
.eqv MMIO, 0xffff0000
.eqv SIDE, 64               # the grid, in words across and down
.eqv GROUNDY, 56            # the first row of ground
.eqv GRASSB, 58             # and the first row of sand under the grass
.eqv BIRDX, 12              # the bird only ever moves up and down
.eqv BIRDW, 6
.eqv BIRDH, 5
.eqv BIRDR, 18              # BIRDX + BIRDW, the column after the bird
.eqv PIPEW, 8               # and -PIPEW is where a pipe is recycled
.eqv HALFGAP, 9
.eqv SPACING, 24            # between one pipe and the next
.eqv CYCLE, 72              # SPACING * 3, what a recycled pipe jumps by
.eqv FIRSTX, 62
.eqv GAPMIN, 13             # the highest the middle of a gap goes
.eqv GAPSPAN, 26            # and how far below that it can be
.eqv GRAV, 3                # sixteenths of a row, per frame, per frame
.eqv FLAPV, -26             # the speed one flap gives, upwards
.eqv MAXFALL, 26
.eqv STARTY, 320            # 20 * 16, where the bird waits
.eqv RESTY, 816             # (GROUNDY - BIRDH) * 16, where a dead bird lands
.eqv FRAME, 80              # milliseconds a frame
.eqv READY, 0
.eqv PLAYING, 1
.eqv DEAD, 2
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
    blt t1, t2, ht_sky
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

# random_gap(): the middle of the next gap, in a0, from a 32 bit xorshift.
# It destroys a0 and t6 and nothing else.
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
# fill_span(col, from, to, colour): rows from to to-1 of one column, in one
# colour, and never a row outside the window in t3 and t4. It destroys t0 and
# t1 and nothing else.
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

# world_column(col): the sky, the pipe standing in this column if one does, and
# the ground, in as much of the column as the window allows. A column off either
# side of the grid draws nothing.
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
    li a1, GROUNDY
    li a2, GRASSB
    jal fill_span
    li a3, SAND
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

# paint_ground(colour): the eight rows of ground, right across the grid
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

A game is always in one of three states, and `s4` says which: `READY` while the bird hangs still
waiting for the first flap, `PLAYING`, and `DEAD` while it drops to the ground. The frame loop reads
the input once, branches on the state, and every branch ends at `draw`, so one frame is one pass and
the three states differ only in what they do to the bird and the pipes in between.

The read at the top takes **every** character waiting, not one. The receiver's Ready bit stays set
while the queue has anything in it, so `read_key` loops until it is clear and `s10` remembers whether
any of them was a flap. A player who taps three times while one frame is being drawn gets three
characters and one flap, and a player who holds the key down gets the auto repeat the terminal sends,
which is a flap a few times a second.

Every one of those comparisons costs a `li` first. A RISC-V branch compares two registers and takes
no immediate, so `li t2, ' '` and then `beq t1, t2, flapped` is what the MIPS version of this game
writes as one `beq $t1, ' ', flapped`, and the same pair turns up in front of `ble`, `blt` and `bge`
all through the program.

`s2` is the bird's height and it counts **sixteenths of a row**. Gravity adds `GRAV`, which is 3, to
`s3` every frame, and a flap sets `s3` to -26: in whole rows those would be 0 and -1, and the bird
would drop at one speed or not accelerate at all. `srli s9, s2, 4` is what turns the sixteenths back
into the row the bird is drawn at, and the low four bits that get shifted away are the fractional part
the next frame keeps.

Three pipes make an endless course. `move_pipes` slides each one one column to the left, and a pipe
whose left edge has gone past `-PIPEW`, which is one pipe width off the left of the grid, jumps
`CYCLE` to the right and asks `random_gap` for a new gap. `CYCLE` is `SPACING * 3`, so the pipe lands
exactly where a fourth pipe would have been and the spacing never drifts. The third word of a pipe's
record is whether it has been counted, and it goes up the score, and prints a line, when the pipe's
right edge passes `BIRDX`.

Nothing is stored about the picture. `world_column` is given a column and works out from the pipe
records what colour every row of it should be: the pipe down from the top, the gap, the pipe down to
the ground, then the grass and the sand. That is what makes a frame cheap, because only two columns
per pipe can have changed, the one the pipe has just come into and the one it has just left, and
`move_pipes` repaints exactly those two.

The bird's six columns are repainted in full every frame, and the order they are painted in is the
whole reason the bird does not flicker. `fill_span` clips every span to a **window**, the two rows in
`t3` and `t4`, so `draw_bird` can ask for the world above the bird, then the bird, then the world
below it, and every word of the column is written once with the colour it ends the frame in. Erasing
the band first and drawing the bird into it afterwards would write half of those words twice, and the
display is the picture, so a reader whose browser repainted in between would see the gap.

The window is why `draw_bird` keeps the bird's top row in `s9`. `world_column` uses `t0` to `t2`,
`t5` and `t6`, `fill_span` uses `t0` and `t1`, and the window takes `t3` and `t4`, so all seven
temporaries are spoken for and a value that has to live across a call needs a saved register. RISC-V
has twelve of those, which is why `s8`, `s9` and `s10` are free to be locals here at all, and each
subroutine that takes one still saves it next to `ra` on the way in.

The score goes to the console because there is nowhere else to put it. The M68K version of this game
draws it onto the screen with a task that puts text at a pixel position, and the bitmap display has
no text of any kind, which is also why the end of a game is the ground turning `DEADGROUND` and not
the words GAME OVER.

`random_gap` is a 32 bit **xorshift**. Three shifts and three `xor` instructions turn a number into
the next one of a sequence, its high bits are the ones worth using, and `remu` by `GAPSPAN` puts the
middle of a gap somewhere in the band `GAPMIN` starts. The seed comes from service 30 on the frame
the first flap happens, so the course depends on when you started playing instead of on a number
written into the program.

Try changing `.eqv HALFGAP, 9` to `6` and playing again. A gap is measured from its middle in both
directions, by the drawing and by the hit test alike, so that one number is the whole of the
difficulty.
