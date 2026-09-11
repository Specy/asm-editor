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
    sw $a0, seed            # so the course depends on when the player began
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
    blt $t1, GROUNDY, ht_sky
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
# It destroys $v0 and $t9 and nothing else.
random_gap:
    lw $v0, seed
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
# colour, and never a row outside the window in $t8 and $t9. It destroys $t0
# and $t1 and nothing else.
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

# draw_bird(): the six columns the bird flies down, each painted in one pass:
# the world above it, the bird, the world below it. Every word is written once
# with the colour it ends the frame in, so the bird is never half erased.
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

A game is always in one of three states, and `$s4` says which: `READY` while the bird hangs still
waiting for the first flap, `PLAYING`, and `DEAD` while it drops to the ground. The frame loop reads
the input once, branches on the state, and every branch ends at `draw`, so one frame is one pass and
the three states differ only in what they do to the bird and the pipes in between.

The read at the top takes **every** character waiting, not one. The receiver's Ready bit stays set
while the queue has anything in it, so `read_key` loops until it is clear and `$t8` remembers whether
any of them was a flap. A player who taps three times while one frame is being drawn gets three
characters and one flap, and a player who holds the key down gets the auto repeat the terminal sends,
which is a flap a few times a second.

`$s2` is the bird's height and it counts **sixteenths of a row**. Gravity adds `GRAV`, which is 3, to
`$s3` every frame, and a flap sets `$s3` to -26: in whole rows those would be 0 and -1, and the bird
would drop at one speed or not accelerate at all. `srl $t7, $s2, 4` is what turns the sixteenths back
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
`$t8` and `$t9`, so `draw_bird` can ask for the world above the bird, then the bird, then the world
below it, and every word of the column is written once with the colour it ends the frame in. Erasing
the band first and drawing the bird into it afterwards would write half of those words twice, and the
display is the picture, so a reader whose browser repainted in between would see the gap.

`fill_span` promises to destroy `$t0` and `$t1` and nothing else, and `random_gap` promises `$v0` and
`$t9`, which is what lets `move_pipes` keep a pipe's new left edge in `$t7` across a call to the
generator. `$s0` is the one saved register the loops have left, so the three subroutines that need a
pointer of their own save it on the stack next to `$ra` and put it back, which is the calling
convention doing the job it is there for.

The score goes to the console because there is nowhere else to put it. The M68K version of this game
draws it onto the screen with a task that puts text at a pixel position, and the bitmap display has
no text of any kind, which is also why the end of a game is the ground turning `DEADGROUND` and not
the words GAME OVER.

`random_gap` is a 32 bit **xorshift**. Three shifts and three `xor` instructions turn a number into
the next one of a sequence, its high bits are the ones worth using, and the remainder of a `divu` by
`GAPSPAN` puts the middle of a gap somewhere in the band `GAPMIN` starts. The seed comes from service
30 on the frame the first flap happens, so the course depends on when you started playing instead of
on a number written into the program.

Try changing `.eqv HALFGAP 9` to `6` and playing again. A gap is measured from its middle in both
directions, by the drawing and by the hit test alike, so that one number is the whole of the
difficulty.
