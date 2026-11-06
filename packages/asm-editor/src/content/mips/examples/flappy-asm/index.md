Build a Flappy ASM game with moving pipes, an animated bird and a score at the top of the Screen.
Tap Space, lowercase `w`, or Enter to flap. The bird falls between taps, and passing a pipe adds a
point. After a collision, tap once to reset the game and again to start.

Select **Open in editor**, then **Build** and **Run**. Click the **Screen** before typing. Click it
again after returning to the editor. The `testcase` below supplies no keys, so it checks only the
waiting screen. Play the game to try the controls and collisions.

The Screen is a grid of 192 × 256 words. The `@screen` line asks for a 384 × 512 pixel display with
`unit=2`, so each word is drawn as a 2 × 2 square. Word `(x, y)` is at
`display + (y * 192 + x) * 4`, and adding `ROWBYTES`, 768, moves straight down one row.

Use this map as you read the program. Read `frame` through `draw` first, then `new_pipes`,
`move_pipes`, and `hit_test`. Leave the drawing helpers until you want to see how the picture is
painted. The colour tables and the sprites are at the end, in a second `.data` section.

- `$s4` is `READY` (waiting) → `PLAYING` (moving) → `DEAD` (falling and waiting for a reset).
  A flap in `DEAD` calls `new_game`, returning to `READY`. The next flap starts play.
- `$s2` is bird height and `$s3` is vertical speed, both in sixteenths of a row. A smaller row
  number is higher on the Screen. `$s5` is the score, `$s6` the best score, `$s7` counts frames,
  and `$s1` holds the address of `display`.
- `pipes` holds three 12-byte records: the cap's left edge `x` at offset 0, gap middle at offset 4,
  and a counted flag at offset 8. Each game starts them at 216, 320 and 424, off the right edge.
- Rows are 0–255, and the ground begins at row 216. A bird at top row `top` occupies
  `[top, top + BIRDH)`, and a pipe at `x` occupies `[x, x + PIPEW)`. With gap middle `m`, the open
  rows are `[m - HALFGAP, m + HALFGAP)`. The right endpoint is excluded in each interval. The pipes
  test a box `HITIN`, 2 pixels, inside the bird's picture: columns `[HITX, HITR)`, which is
  `[50, 63)`, and rows `[top + 2, top + 10)`.
- Each frame reads all queued characters and handles the current state. While playing, it updates
  speed and height, moves the pipe records and checks collisions. Then it paints what changed,
  each pixel once: the pipe columns the move changed, the grass stripes, the bird and the score.
  Last, it sleeps until the next frame is due.

```mips|playground|open-screen|console|no-registers|allow-open
# @screen unit=2 width=384 height=512 base=display
.eqv MMIO 0xffff0000
# The grid: 192 x 256 words, each drawn as a 2 x 2 square
.eqv WIDTH 192
.eqv HEIGHT 256
.eqv ROWBYTES 768           # WIDTH * 4, from one row to the next
.eqv GROUNDY 216            # the first row of ground
.eqv GRASSY 217             # its light top row
.eqv STRIPEY 218            # the eight rows of striped grass
.eqv STRIPEEND 226          # and the dark row under them
.eqv SANDY 227
# The scenery behind the pipes
.eqv CLOUDY 150             # the base the clouds rise from
.eqv CITYY 204              # and the buildings
.eqv BUSHY 204              # and the bushes
# The bird
.eqv BIRDX 48               # the bird only ever moves up and down
.eqv BIRDW 17
.eqv BIRDH 12
.eqv BIRDR 65               # BIRDX + BIRDW, the column after the bird
.eqv HITX 50                # the box the pipes test, 2 inside the picture:
.eqv HITR 63                # its columns [HITX, HITR)
.eqv HITIN 2                # and its rows, HITIN inside the picture's
.eqv BIRDSTRIDE 68          # BIRDW * 4, from one row of its sprite to the next
.eqv BIRDBYTES 816          # BIRDW * BIRDH * 4, one picture of it
# Pipes and gaps
.eqv PIPEW 30               # the cap's width; the body is 2 narrower each side
.eqv CAPH 12
.eqv CAPLAST 11             # CAPH - 1, the cap's bottom edge row
.eqv HALFGAP 40
.eqv SPACING 104            # between one pipe and the next
.eqv CYCLE 312              # SPACING * 3, what a recycled pipe jumps by
.eqv FIRSTX 216             # WIDTH + 24, just off the right edge
.eqv GAPMIN 92              # the highest the middle of a gap goes
.eqv GAPSPAN 49             # and how far below that it can be
# Physics and timing
.eqv GRAV 5                 # sixteenths of a row, per frame, per frame
.eqv FLAPV -80              # the speed one flap gives, upwards
.eqv MAXFALL 112
.eqv STARTY 1600            # 100 * 16, where the bird waits
.eqv RESTY 3264             # (GROUNDY - BIRDH) * 16, where a dead bird lands
.eqv FRAME 20               # milliseconds a frame
# The score
.eqv DIGITW 12
.eqv DIGITH 16
.eqv DIGITSTRIDE 48         # DIGITW * 4
.eqv DIGITBYTES 768         # DIGITW * DIGITH * 4, one digit
.eqv SCOREY 20
.eqv SCOREEND 36            # SCOREY + DIGITH
# Game states
.eqv READY 0
.eqv PLAYING 1
.eqv DEAD 2
# Colours
.eqv NONE 0                 # no body in a pipe column; see-through in a sprite
.eqv SKY 0x004EC0CA
.eqv CLOUD 0x00E9FCD9
.eqv CITY 0x00A8DFB5
.eqv WINDOW 0x00D2F3DC
.eqv BUSH 0x005EE270
.eqv BUSHEDGE 0x0047BF5A
.eqv EDGE 0x00543847        # the dark outline of pipes and ground
.eqv PIPEHI 0x00E4FD8B
.eqv PIPELIGHT 0x009CE659
.eqv PIPEMID 0x0073BF2E
.eqv PIPEDARK 0x00558022
.eqv SAND 0x00DED895

.data
display:  .space 196608     # WIDTH * HEIGHT words, four bytes each
backdrop: .space 165888     # WIDTH * GROUNDY words: the scenery, worked out once
pipes:    .word 0, 0, 0     # three records: cap's left x, gap middle, counted
          .word 0, 0, 0
          .word 0, 0, 0
pipes_end:
seed:          .word 0x1F123BB5
next_frame:    .word 0      # the time the next frame starts at
pipes_moved:   .word 0      # this frame, so their changed columns need painting
shown_y:       .word 100    # the bird's top row on the Screen
shown_score:   .word -1     # the score on the Screen, -1 for none yet
score_left:    .word 0      # the columns the score takes this frame
score_right:   .word 0
score_covered: .word 0      # a pipe column went around the score this frame
digit_buf:     .space 12    # the score's digits, highest first, then 255
over:    .asciiz "Game over. Score: "
bestmsg: .asciiz ", best: "

.text
.globl main
main:
    la $s1, display
    li $s6, 0               # the best score of the session
    li $s7, 0               # frames since the program started
    jal make_backdrop
    jal new_game
    li $v0, 30              # service 30: milliseconds since the run started
    syscall
    sw $a0, next_frame      # the first frame starts now

frame:
    sw $zero, pipes_moved
# --- every character typed since the last frame, and only the flaps count ----
    li $t7, MMIO
    li $t8, 0
read_key:
    lw $t0, 0($t7)          # the receiver control register
    andi $t0, $t0, 1        # the Ready bit
    beqz $t0, keys_read
    lw $t1, 4($t7)          # the receiver data, which takes the character
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

# --- waiting to start: the bird bobs until the first flap --------------------
    bnez $t8, start
    andi $t0, $s7, 31       # up for 16 frames, then down for 16
    blt $t0, 16, bob
    li $t1, 31
    sub $t0, $t1, $t0
bob:
    sll $t0, $t0, 2         # a quarter of a row a frame
    addi $s2, $t0, STARTY
    j draw
start:
    li $v0, 30
    syscall
    bnez $a0, seeded        # a zero seed would stay zero after every shift and xor
    li $a0, 0x1F123BB5
seeded:
    sw $a0, seed            # starting time changes the gap sequence
    jal new_pipes           # off to the right, so there is nothing to repaint
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
    beqz $t8, dead_fall
    jal new_game
    j draw
dead_fall:
    addi $s3, $s3, GRAV
    ble $s3, MAXFALL, dcapped
    li $s3, MAXFALL
dcapped:
    add $s2, $s2, $s3
    ble $s2, RESTY, draw
    li $s2, RESTY
    li $s3, 0

# --- the frame: everything that changed, each word painted once --------------
draw:
    beq $s4, DEAD, counted  # a dead bird's world stands still
    addi $s7, $s7, 1
counted:
    jal place_score
    lw $t0, pipes_moved
    beqz $t0, pipes_painted
    jal repaint_pipes
pipes_painted:
    beq $s4, DEAD, ground_painted
    jal slide_stripes
ground_painted:
    jal draw_bird
    jal draw_score
    jal wait_frame
    j frame

#-----------------------------------------------------------------------------
# The game
#-----------------------------------------------------------------------------
# new_game(): the bird waiting, a score of 0, and the whole Screen repainted
new_game:
    addi $sp, $sp, -4
    sw $ra, 0($sp)
    li $s2, STARTY          # the bird, in sixteenths of a row
    li $s3, 0               # and how fast it is falling
    li $s4, READY
    li $s5, 0               # the score
    jal new_pipes
    jal paint_world
    lw $ra, 0($sp)
    addi $sp, $sp, 4
    jr $ra

# new_pipes(): three pipes off to the right, each with a gap of its own
new_pipes:
    addi $sp, $sp, -4
    sw $ra, 0($sp)
    la $t7, pipes
    li $t6, FIRSTX
    li $t5, 3
np_next:
    sw $t6, 0($t7)          # where its cap's left edge is
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
# pipes are an endless course. The Screen catches up later, in repaint_pipes.
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
    jal random_gap          # which leaves $t7 alone
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
mp_counted:
    addi $s0, $s0, 12
    la $t7, pipes_end
    blt $s0, $t7, mp_next
    li $t0, 1
    sw $t0, pipes_moved
    lw $s0, 0($sp)
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra

# hit_test(): 1 in $v0 when the bird is touching a pipe or the ground. The
# ground stops the bird's picture; the pipes stop a box 2 pixels inside it,
# which leaves out its see-through corners and forgives a near miss.
hit_test:
    sra $t0, $s2, 4         # the bird's top row
    addi $t1, $t0, BIRDH    # and one past its bottom one
    ble $t1, GROUNDY, ht_sky # bottom edge at GROUNDY is still above ground
    li $v0, 1
    jr $ra
ht_sky:
    addi $t0, $t0, HITIN    # the box's top row
    addi $t1, $t1, -HITIN   # and one past its bottom one
    la $t2, pipes
    li $t3, 3
ht_next:
    lw $t4, 0($t2)
    bge $t4, HITR, ht_skip  # this pipe is still to the right of the bird
    addi $t5, $t4, PIPEW
    ble $t5, HITX, ht_skip  # and this one is already behind it
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

# wait_frame(): sleep until the next frame is due, so frames start every FRAME
# milliseconds however long their drawing took. It always sleeps, for at least
# a millisecond, since a sleep is when the Screen shows the frame.
wait_frame:
    li $v0, 30
    syscall                 # $a0 = now
    lw $t0, next_frame
    sub $t1, $t0, $a0       # how long until the next frame is due
    bge $t1, 1, wf_sleep
    li $t1, 1               # running late: start the schedule again from now
    move $t0, $a0
wf_sleep:
    addi $t0, $t0, FRAME
    sw $t0, next_frame
    move $a0, $t1
    li $v0, 32              # service 32: a0 milliseconds of program time
    syscall
    jr $ra

#-----------------------------------------------------------------------------
# Drawing. Every routine stores a word only when its colour changes, and each
# frame paints every word at most once, with the colour it ends the frame in:
# a frame shown before it is finished never shows a bird or a score missing.
#-----------------------------------------------------------------------------
# make_backdrop(): the scenery, into backdrop: sky, clouds, buildings with
# windows and bushes, from the top of each column down to the ground.
make_backdrop:
    li $t0, 0               # the column
mb_column:
    andi $t1, $t0, 63
    lbu $t1, cloud_rise($t1)
    li $t3, CLOUDY
    sub $t3, $t3, $t1       # $t3 = the clouds' top row in this column
    srl $t1, $t0, 3         # which building: one every eight columns,
    li $t2, 12
    divu $t1, $t2
    mfhi $t1                # and twelve of them over and over
    lbu $t1, towers($t1)
    li $t4, CITYY
    sub $t4, $t4, $t1       # $t4 = the buildings' top row
    andi $t1, $t0, 31
    lbu $t1, bush_rise($t1)
    li $t5, BUSHY
    sub $t5, $t5, $t1       # $t5 = the bushes' top row
    andi $t6, $t0, 7        # $t6 = the column within its building
    la $t1, backdrop
    sll $t2, $t0, 2
    add $t1, $t1, $t2       # $t1 = this column's word in the top row
    li $t2, 0               # the row
mb_row:
    bge $t2, $t5, mb_bush   # nearest first: bushes, buildings, clouds
    bge $t2, $t4, mb_city
    li $a1, CLOUD
    bge $t2, $t3, mb_put
    li $a1, SKY
    j mb_put
mb_bush:
    li $a1, BUSH
    bne $t2, $t5, mb_put
    li $a1, BUSHEDGE        # the bushes' top row is darker
    j mb_put
mb_city:
    li $a1, CITY            # windows in columns 2 and 5 of each building,
    andi $a2, $t2, 3        # every fourth row, below the top two
    bne $a2, 2, mb_put
    addi $a2, $t4, 2
    ble $t2, $a2, mb_put
    beq $t6, 2, mb_window
    bne $t6, 5, mb_put
mb_window:
    li $a1, WINDOW
mb_put:
    sw $a1, 0($t1)
    addi $t1, $t1, ROWBYTES
    addi $t2, $t2, 1
    blt $t2, GROUNDY, mb_row
    addi $t0, $t0, 1
    blt $t0, WIDTH, mb_column
    jr $ra

# fill_span(col, from, to, colour): rows from to to-1 of one column, in one
# colour, and never a row outside the window in $t8 and $t9. It also changes
# $a1 and $a2 when clipping, plus $t0, $t1 and $t2.
fill_span:
    bge $a1, $t8, fs_top
    move $a1, $t8
fs_top:
    ble $a2, $t9, fs_rows
    move $a2, $t9
fs_rows:
    bge $a1, $a2, fs_done   # a span the window has closed draws nothing
    mul $t1, $a2, WIDTH
    mul $t0, $a1, WIDTH     # row * WIDTH
    add $t0, $t0, $a0       # + col
    sll $t0, $t0, 2         # four bytes a word
    add $t0, $t0, $s1
    add $t1, $t1, $a0
    sll $t1, $t1, 2
    add $t1, $t1, $s1       # and the word just past the last row
fs_next:
    lw $t2, 0($t0)
    beq $t2, $a3, fs_same   # already that colour: no store
    sw $a3, 0($t0)
fs_same:
    addi $t0, $t0, ROWBYTES # straight down to the next row
    bne $t0, $t1, fs_next
fs_done:
    jr $ra

# body_span(col, from, to, colour): fill_span, or backdrop_span for a NONE
# colour, where only a pipe's cap reaches
body_span:
    beqz $a3, backdrop_span
    j fill_span

# backdrop_span(col, from, to): as fill_span, with the backdrop's own
# colours. It also changes $t3 and $t4.
backdrop_span:
    bge $a1, $t8, bs_top
    move $a1, $t8
bs_top:
    ble $a2, $t9, bs_rows
    move $a2, $t9
bs_rows:
    sub $t1, $a2, $a1
    blez $t1, bs_done
    mul $t0, $a1, WIDTH
    add $t0, $t0, $a0
    sll $t0, $t0, 2
    la $t3, backdrop
    add $t3, $t3, $t0       # the word in the backdrop
    add $t0, $t0, $s1       # and the one on the Screen
bs_next:
    lw $t4, 0($t3)
    lw $t2, 0($t0)
    beq $t2, $t4, bs_same
    sw $t4, 0($t0)
bs_same:
    addi $t3, $t3, ROWBYTES
    addi $t0, $t0, ROWBYTES
    addi $t1, $t1, -1
    bnez $t1, bs_next
bs_done:
    jr $ra

# cap_span(col, first row, -, colour in $v1): a cap's column, an edge row,
# ten shaded rows and another edge row, or the backdrop for a NONE colour,
# just past the pipe's right edge. It changes $a1 to $a3 and $t0 to $t5.
cap_span:
    addi $sp, $sp, -4
    sw $ra, 0($sp)
    move $t5, $a1
    bnez $v1, cs_cap
    addi $a2, $t5, CAPH
    jal backdrop_span
    j cs_done
cs_cap:
    li $a3, EDGE
    addi $a2, $t5, 1
    jal fill_span
    move $a3, $v1
    addi $a1, $t5, 1
    addi $a2, $t5, CAPLAST
    jal fill_span
    li $a3, EDGE
    addi $a1, $t5, CAPLAST
    addi $a2, $t5, CAPH
    jal fill_span
cs_done:
    lw $ra, 0($sp)
    addi $sp, $sp, 4
    jr $ra

# world_column(col): the backdrop and any pipe standing in this column, above
# the ground, in as much of the column as the window in $t8 and $t9 allows. A
# column off either side of the grid, or an empty window, draws nothing. It
# changes $a1 to $a3, $v0, $v1 and $t0 to $t7, and leaves $a0, $t8 and $t9
# alone.
world_column:
    bge $t8, $t9, wc_done
    bltz $a0, wc_done
    bge $a0, WIDTH, wc_done
    addi $sp, $sp, -4
    sw $ra, 0($sp)

    la $t0, pipes           # is a pipe standing in this column
    la $t1, pipes_end
wc_find:
    lw $t2, 0($t0)
    sub $t2, $a0, $t2       # the column within that pipe
    bltz $t2, wc_skip
    blt $t2, PIPEW, wc_pipe
wc_skip:
    addi $t0, $t0, 12
    blt $t0, $t1, wc_find
    li $a1, 0               # no pipe: backdrop all the way down
    li $a2, GROUNDY
    jal backdrop_span
    j wc_return

wc_pipe:
    sll $t2, $t2, 2
    lw $v0, body_shade($t2) # $v0 = the body's colour in this column
    lw $v1, cap_shade($t2)  # $v1 = the caps' colour
    lw $t1, 4($t0)          # the middle of its gap
    addi $t6, $t1, -HALFGAP # $t6 = the gap's top row
    addi $t7, $t1, HALFGAP  # $t7 = one past its bottom row
    li $a1, 0
    addi $a2, $t6, -CAPH
    move $a3, $v0
    jal body_span           # from the top of the grid down to the upper cap
    addi $a1, $t6, -CAPH
    jal cap_span            # the upper cap, just above the gap
    move $a1, $t6
    move $a2, $t7
    jal backdrop_span       # the gap itself
    move $a1, $t7
    jal cap_span            # the lower cap
    addi $a1, $t7, CAPH
    li $a2, GROUNDY
    move $a3, $v0
    jal body_span           # and from the lower cap down to the ground
wc_return:
    lw $ra, 0($sp)
    addi $sp, $sp, 4
wc_done:
    jr $ra

# paint_world(): every column, then the ground, which is the one full repaint
# a game has. The score has to be drawn again after it.
paint_world:
    addi $sp, $sp, -8
    sw $ra, 4($sp)
    sw $s0, 0($sp)
    li $t8, 0
    li $t9, GROUNDY
    li $s0, 0
pw_sky:
    move $a0, $s0
    jal world_column
    addi $s0, $s0, 1
    blt $s0, WIDTH, pw_sky

    li $t8, 0
    li $t9, HEIGHT
    li $s0, 0
pw_ground:
    move $a0, $s0
    li $a1, GROUNDY
    li $a2, GRASSY
    li $a3, EDGE
    jal fill_span           # the outline along the top of the ground
    li $a1, GRASSY
    li $a2, STRIPEY
    li $a3, PIPEHI
    jal fill_span
    li $a1, STRIPEEND
    li $a2, SANDY
    li $a3, PIPEDARK
    jal fill_span
    li $a1, SANDY
    li $a2, HEIGHT
    li $a3, SAND
    jal fill_span
    addi $s0, $s0, 1
    blt $s0, WIDTH, pw_ground
    jal paint_stripes       # and the grass between them
    li $t0, -1
    sw $t0, shown_score
    lw $s0, 0($sp)
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra

# paint_stripes(): the grass, diagonal stripes four columns wide: bit 2 of
# x + row + frames picks the light or the dark green
paint_stripes:
    li $t1, STRIPEY         # the row
ps_row:
    mul $t3, $t1, ROWBYTES
    add $t3, $t3, $s1       # its first word
    addi $t4, $t3, ROWBYTES # and the one past its last
    add $t5, $t1, $s7       # x + row + frames, starting from x = 0
ps_word:
    andi $t2, $t5, 4
    li $a3, PIPELIGHT
    beqz $t2, ps_put
    li $a3, PIPEMID
ps_put:
    lw $t2, 0($t3)
    beq $t2, $a3, ps_same
    sw $a3, 0($t3)
ps_same:
    addi $t3, $t3, 4
    addi $t5, $t5, 1
    blt $t3, $t4, ps_word
    addi $t1, $t1, 1
    blt $t1, STRIPEEND, ps_row
    jr $ra

# slide_stripes(): one frame later, a stripe's colour has changed only in every
# fourth column, where x + row + frames is a multiple of 4: the light green
# becomes dark there, and the dark green light. Only those words are stored.
slide_stripes:
    li $t1, STRIPEY         # the row
ss_row:
    add $t2, $t1, $s7
    sub $t2, $zero, $t2
    andi $t2, $t2, 3        # the first such column
    mul $t3, $t1, WIDTH
    add $t3, $t3, $t2
    sll $t3, $t3, 2
    add $t3, $t3, $s1       # its word
    mul $t4, $t1, ROWBYTES
    add $t4, $t4, $s1
    addi $t4, $t4, ROWBYTES # the end of the row
    add $t5, $t1, $s7
    add $t5, $t5, $t2       # x + row + frames there
ss_word:
    andi $t2, $t5, 4
    li $a3, PIPELIGHT
    beqz $t2, ss_put
    li $a3, PIPEMID
ss_put:
    sw $a3, 0($t3)
    addi $t3, $t3, 16       # four columns on
    addi $t5, $t5, 4
    blt $t3, $t4, ss_word
    addi $t1, $t1, 1
    blt $t1, STRIPEEND, ss_row
    jr $ra

# repaint_pipes(): the columns the pipes' move changed. A pipe moved one column
# left changes its column k only where its shading differs from column k - 1:
# the body rows where body_shade does, the cap rows where cap_shade does. The
# NONE words around the tables are the columns just outside the pipe, so k
# runs from 0 to PIPEW, the column just past its right edge. The rows the
# bird or the score takes this frame are left for draw_bird and draw_score.
# k lives in the stack frame, at 4($sp), since pipe_rows changes most
# temporary registers.
repaint_pipes:
    addi $sp, $sp, -16
    sw $ra, 12($sp)
    sw $s0, 0($sp)
    la $s0, pipes
rp_pipe:
    sw $zero, 4($sp)        # the column within the pipe, 0 to PIPEW
rp_column:
    lw $t0, 4($sp)
    lw $a0, 0($s0)
    add $a0, $a0, $t0       # the Screen column
    bltz $a0, rp_next
    bge $a0, WIDTH, rp_next
    sll $t1, $t0, 2
    la $t0, body_shade
    add $t0, $t0, $t1
    lw $t2, 0($t0)
    lw $t0, -4($t0)
    bne $t2, $t0, rp_changed # the body's colour changed
    la $t0, cap_shade
    add $t0, $t0, $t1
    lw $t2, 0($t0)
    lw $t0, -4($t0)
    beq $t2, $t0, rp_next   # and neither did the caps'
rp_changed:
    li $t8, GROUNDY         # $t8 to $t9: the rows to leave alone, none so far
    li $t9, GROUNDY
    blt $a0, BIRDX, rp_score
    bge $a0, BIRDR, rp_score
    sra $t8, $s2, 4         # the bird's rows
    addi $t9, $t8, BIRDH
    j rp_paint
rp_score:
    lw $t0, score_left
    blt $a0, $t0, rp_paint
    lw $t0, score_right
    bge $a0, $t0, rp_paint
    li $t8, SCOREY          # the score's rows
    li $t9, SCOREEND
    li $t0, 1
    sw $t0, score_covered
rp_paint:
    sw $t9, 8($sp)
    move $t9, $t8
    li $t8, 0
    lw $a1, 4($sp)
    jal pipe_rows           # above the rows left alone
    lw $t8, 8($sp)
    li $t9, GROUNDY
    bge $t8, $t9, rp_next
    lw $a1, 4($sp)
    jal pipe_rows           # and below them
rp_next:
    lw $t0, 4($sp)
    addi $t0, $t0, 1
    sw $t0, 4($sp)
    ble $t0, PIPEW, rp_column
    addi $s0, $s0, 12
    la $t0, pipes_end
    blt $s0, $t0, rp_pipe
    lw $s0, 0($sp)
    lw $ra, 12($sp)
    addi $sp, $sp, 16
    jr $ra

# pipe_rows(col, k): the rows of the column that changed when the pipe at $s0
# moved, k being the column within the pipe, within the window $t8 to $t9. It
# leaves $a0, $t8 and $t9 alone.
pipe_rows:
    addi $sp, $sp, -8
    sw $ra, 4($sp)
    sw $a1, 0($sp)
    lw $t0, 4($s0)
    addi $t6, $t0, -HALFGAP # $t6 = the gap's top row
    addi $t7, $t0, HALFGAP  # $t7 = one past its bottom row
    sll $t1, $a1, 2
    la $t0, body_shade
    add $t0, $t0, $t1
    lw $v0, 0($t0)          # $v0 = the body's colour in this column
    lw $t0, -4($t0)
    beq $v0, $t0, pr_caps
    li $a1, 0
    addi $a2, $t6, -CAPH
    move $a3, $v0
    jal body_span           # above the upper cap
    addi $a1, $t7, CAPH
    li $a2, GROUNDY
    move $a3, $v0
    jal body_span           # below the lower cap
pr_caps:
    lw $t1, 0($sp)
    sll $t1, $t1, 2
    la $t0, cap_shade
    add $t0, $t0, $t1
    lw $v1, 0($t0)          # $v1 = the caps' colour in this column
    lw $t0, -4($t0)
    beq $v1, $t0, pr_done
    addi $a1, $t6, -CAPH
    jal cap_span
    move $a1, $t7
    jal cap_span
pr_done:
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra

# sprite_column(col, from, to, sprite): rows from to to-1 of the column, the
# sprite's colour where it is drawn and not see-through, the world everywhere
# else. $a3 is the sprite's word for this column in its top row, $t5 the
# sprite's top row, $t6 its height and $t7 the bytes in a row of it. It leaves
# $a0 alone. The stack frame keeps the arguments, and at 8($sp) the first row
# the world still has to be painted from.
sprite_column:
    addi $sp, $sp, -36
    sw $ra, 0($sp)
    sw $s0, 4($sp)
    sw $a1, 8($sp)
    sw $a2, 12($sp)
    sw $a3, 16($sp)
    sw $t5, 20($sp)
    sw $t6, 24($sp)
    sw $t7, 28($sp)
    move $s0, $a1           # $s0 = the row
sc_row:
    lw $t0, 12($sp)
    bge $s0, $t0, sc_done
    lw $t1, 20($sp)
    sub $t1, $s0, $t1       # the row within the sprite
    bltz $t1, sc_next
    lw $t0, 24($sp)
    bge $t1, $t0, sc_next
    lw $t0, 28($sp)
    mul $t1, $t1, $t0
    lw $t0, 16($sp)
    add $t1, $t1, $t0
    lw $t2, 0($t1)          # its colour
    beqz $t2, sc_next       # see-through
    lw $t8, 8($sp)
    bge $t8, $s0, sc_put
    sw $t2, 32($sp)
    move $t9, $s0
    jal world_column        # the world above it, down to this row
    lw $t2, 32($sp)
sc_put:
    mul $t0, $s0, WIDTH
    add $t0, $t0, $a0
    sll $t0, $t0, 2
    add $t0, $t0, $s1
    lw $t1, 0($t0)
    beq $t1, $t2, sc_same
    sw $t2, 0($t0)
sc_same:
    addi $t0, $s0, 1
    sw $t0, 8($sp)
sc_next:
    addi $s0, $s0, 1
    j sc_row
sc_done:
    lw $t8, 8($sp)
    lw $t9, 12($sp)
    jal world_column        # the world below the sprite's last row
    lw $s0, 4($sp)
    lw $ra, 0($sp)
    addi $sp, $sp, 36
    jr $ra

# draw_bird(): the bird's columns, from the higher of its old and new top rows
# to the lower of their bottoms: the bird where it is now, with its wing up,
# level, down, level, four frames each, and the world where it was. The stack
# frame keeps the picture at 8($sp), its top row at 12($sp), and the rows to
# paint, from 16($sp) to 20($sp).
draw_bird:
    addi $sp, $sp, -24
    sw $ra, 0($sp)
    sw $s0, 4($sp)
    li $t0, 1               # the level wing, once it is dead
    beq $s4, DEAD, db_frame
    srl $t0, $s7, 2
    andi $t0, $t0, 3
    bne $t0, 3, db_frame
    li $t0, 1
db_frame:
    mul $t0, $t0, BIRDBYTES
    la $t1, bird_sprites
    add $t0, $t0, $t1
    sw $t0, 8($sp)          # the picture
    sra $t0, $s2, 4
    sw $t0, 12($sp)         # its top row now
    lw $t1, shown_y
    move $t2, $t0           # from the higher top
    ble $t0, $t1, db_from
    move $t2, $t1
db_from:
    sw $t2, 16($sp)
    bge $t0, $t1, db_to     # to the lower bottom
    move $t0, $t1
db_to:
    addi $t0, $t0, BIRDH
    sw $t0, 20($sp)
    li $s0, BIRDX
db_column:
    move $a0, $s0
    lw $a1, 16($sp)
    lw $a2, 20($sp)
    addi $t0, $s0, -BIRDX
    sll $t0, $t0, 2
    lw $a3, 8($sp)
    add $a3, $a3, $t0
    lw $t5, 12($sp)
    li $t6, BIRDH
    li $t7, BIRDSTRIDE
    jal sprite_column
    addi $s0, $s0, 1
    blt $s0, BIRDR, db_column
    lw $t0, 12($sp)
    sw $t0, shown_y
    lw $s0, 4($sp)
    lw $ra, 0($sp)
    addi $sp, $sp, 24
    jr $ra

# place_score(): the score's digits, highest first, into digit_buf, and the
# columns they take this frame, centred at the top. A score only grows during
# a game, so it always covers the columns of the one before it.
place_score:
    move $t0, $s5
    li $t2, 10
    li $t3, 0               # how many digits
ps_split:
    divu $t0, $t2
    mfhi $t4
    addi $sp, $sp, -4
    sw $t4, 0($sp)          # lowest first onto the stack,
    addi $t3, $t3, 1
    mflo $t0
    bnez $t0, ps_split
    la $t1, digit_buf
    move $t4, $t3
ps_order:
    lw $t0, 0($sp)          # and off it highest first
    addi $sp, $sp, 4
    sb $t0, 0($t1)
    addi $t1, $t1, 1
    addi $t4, $t4, -1
    bnez $t4, ps_order
    li $t0, 255
    sb $t0, 0($t1)          # the end of the digits
    mul $t0, $t3, DIGITW
    li $t1, WIDTH
    sub $t1, $t1, $t0
    sra $t1, $t1, 1
    sw $t1, score_left
    add $t1, $t1, $t0
    sw $t1, score_right
    sw $zero, score_covered
    jr $ra

# draw_score(): the score, when it has changed or a pipe column went around
# it. The next digit's place in digit_buf lives at 8($sp).
draw_score:
    lw $t0, shown_score
    bne $t0, $s5, ds_draw
    lw $t0, score_covered
    bnez $t0, ds_draw
    jr $ra
ds_draw:
    addi $sp, $sp, -16
    sw $ra, 0($sp)
    sw $s0, 4($sp)
    sw $zero, 8($sp)        # the first digit
    lw $s0, score_left      # $s0 = the column
ds_column:
    lw $t1, 8($sp)
    lbu $t0, digit_buf($t1)
    beq $t0, 255, ds_done   # past the last digit
    mul $t0, $t0, DIGITBYTES
    la $t2, digit_sprites
    add $t0, $t0, $t2       # that digit's picture
    mul $t1, $t1, DIGITW
    lw $t2, score_left
    add $t1, $t1, $t2       # its left column
    sub $t1, $s0, $t1
    sll $t1, $t1, 2
    add $a3, $t0, $t1       # its word for this column
    move $a0, $s0
    li $a1, SCOREY
    li $a2, SCOREEND
    li $t5, SCOREY
    li $t6, DIGITH
    li $t7, DIGITSTRIDE
    jal sprite_column
    addi $s0, $s0, 1
    lw $t0, score_left
    sub $t0, $s0, $t0
    li $t1, DIGITW
    divu $t0, $t1
    mfhi $t0
    bnez $t0, ds_column
    lw $t1, 8($sp)
    addi $t1, $t1, 1        # the next digit starts here
    sw $t1, 8($sp)
    j ds_column
ds_done:
    sw $s5, shown_score
    lw $s0, 4($sp)
    lw $ra, 0($sp)
    addi $sp, $sp, 16
    jr $ra

#-----------------------------------------------------------------------------
# Colours and pictures
#-----------------------------------------------------------------------------
.data
.align 2
# A pipe's colours, column by column across its cap. The body is two columns
# narrower on each side, so its table starts and ends with NONE. The NONE
# words around the tables are the columns just left and right of the pipe.
          .word NONE
body_shade:
          .word NONE, NONE, EDGE, PIPELIGHT, PIPELIGHT, PIPELIGHT, PIPELIGHT, PIPEMID
          .word PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID
          .word PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEDARK, PIPEDARK, PIPEDARK, PIPEDARK
          .word PIPEDARK, PIPEDARK, PIPEDARK, EDGE, NONE, NONE
          .word NONE
cap_shade:
          .word EDGE, PIPELIGHT, PIPELIGHT, PIPEHI, PIPEHI, PIPEHI, PIPELIGHT, PIPELIGHT
          .word PIPELIGHT, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID
          .word PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEDARK, PIPEDARK, PIPEDARK
          .word PIPEDARK, PIPEDARK, PIPEDARK, PIPEDARK, PIPEDARK, EDGE
          .word NONE

# How far the clouds and the bushes rise above their base, column by column,
# and the heights of the buildings, eight columns each.
cloud_rise:
          .byte 5, 5, 6, 6, 7, 7, 7, 7, 7, 7, 7, 8, 8, 9, 9, 10
          .byte 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 9, 8, 8, 7, 6
          .byte 6, 6, 6, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 9, 9
          .byte 8, 8, 8, 7, 7, 6, 5, 5, 6, 6, 6, 5, 5, 5, 4, 3
bush_rise:
          .byte 3, 4, 4, 5, 5, 5, 5, 5, 4, 4, 5, 6, 6, 6, 6, 6
          .byte 6, 6, 6, 6, 5, 4, 4, 5, 5, 5, 5, 5, 4, 4, 3, 0
towers:   .byte 26, 40, 32, 48, 22, 36, 44, 30, 52, 28, 38, 24

# The sprites: three pictures of the bird, its wing up, level and down, and the
# ten digits, one 0x00RRGGBB word a pixel, row by row. Black (0) is see-through.
          .align 2
bird_sprites:
# wing up
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0x543847
          .word 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0
          .word 0, 0x543847, 0x543847, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0x543847
          .word 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0x543847
          .word 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A
          .word 0xF8C82A, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0
          .word 0, 0x543847, 0x543847, 0x543847, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0xF8C82A
          .word 0x543847, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0x543847, 0
          .word 0, 0, 0x543847, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C
          .word 0x543847, 0xF25C3C, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0
          .word 0, 0, 0x543847, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C
          .word 0xF09A2C, 0x543847, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0x543847, 0
          .word 0, 0, 0, 0x543847, 0x543847, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C
          .word 0xF09A2C, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0, 0, 0, 0, 0, 0, 0
# wing level
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0x543847
          .word 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0
          .word 0, 0x543847, 0x543847, 0x543847, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0x543847
          .word 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0x543847, 0xF8C82A, 0xF8C82A, 0x543847
          .word 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0x543847, 0xF8C82A, 0xF8C82A
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xF8C82A, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xF8C82A, 0x543847, 0xF8C82A, 0xF8C82A
          .word 0xF8C82A, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0
          .word 0, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A
          .word 0xF8C82A, 0x543847, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0x543847
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C
          .word 0x543847, 0xF25C3C, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0
          .word 0, 0, 0x543847, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C
          .word 0xF09A2C, 0x543847, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0x543847, 0
          .word 0, 0, 0, 0x543847, 0x543847, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C
          .word 0xF09A2C, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0, 0, 0, 0, 0, 0, 0
# wing down
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0x543847
          .word 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0
          .word 0, 0, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0x543847
          .word 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0xF8C82A, 0x543847
          .word 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xF8C82A, 0xF8C82A, 0xF8C82A
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0x543847, 0xF8C82A, 0xF8C82A
          .word 0xF8C82A, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0
          .word 0x543847, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0x543847, 0xF8C82A, 0xF8C82A
          .word 0x543847, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0x543847, 0
          .word 0, 0x543847, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0xFAEE9C, 0x543847, 0xF09A2C, 0xF09A2C
          .word 0x543847, 0xF25C3C, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0xF09A2C, 0xF09A2C, 0xF09A2C
          .word 0xF09A2C, 0x543847, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0xF25C3C, 0x543847, 0
          .word 0, 0, 0, 0x543847, 0x543847, 0xF09A2C, 0xF09A2C, 0xF09A2C, 0xF09A2C
          .word 0xF09A2C, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0, 0, 0, 0, 0, 0, 0
digit_sprites:
# 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
# 1
          .word 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
# 2
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847
# 3
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
# 4
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
# 5
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0, 0, 0, 0, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0, 0, 0, 0, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
# 6
          .word 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0, 0
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0, 0
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
# 7
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0, 0
# 8
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
# 9
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847
          .word 0, 0, 0, 0, 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0x543847, 0x543847, 0, 0
          .word 0, 0, 0x543847, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x543847, 0, 0, 0, 0
          .word 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0
```

```testcase
{ "runFor": 3000000 }
```

### Follow one frame

`read_key` checks the keyboard receiver's Ready bit. Reading its data register consumes one
character, so the loop keeps reading until the queue is empty. Space, lowercase `w`, and Enter
(newline 10) set `$t8` to 1. Several flap characters collected during one frame still make one
flap. In `READY`, the bird bobs a few rows up and down until that flap, which initializes the pipes
and sets speed to `FLAPV`. Movement begins on the next `PLAYING` frame. In `DEAD`, a flap calls
`new_game`, which repaints the whole Screen and waits for another flap.

During `PLAYING`, a flap sets speed `$s3` to `-80`. Gravity then adds 5, the speed is limited to
`MAXFALL`, and that speed is added to height `$s2`. Starting at height 1600 (row 100), the first
playing frame after a flap makes speed `-80 + 5 = -75` and height `1600 - 75 = 1525`. The drawn top
row is `1525 >> 4 = 95`. With no flap on the next frame, speed becomes `-70`, height becomes `1455`,
and the drawn top row is 90. The lower four bits of height remain stored, so small changes can
accumulate even when the drawn row stays the same. Reaching the top clamps height and speed to 0.

`move_pipes` moves each left edge one column left. Once an edge moves past `-PIPEW` (`-30`), it
adds `CYCLE` (`312`), chooses a new gap, and clears that record's counted flag. Since there are
three pipes spaced 104 columns apart, `CYCLE = 3 × SPACING` keeps their spacing. When a pipe's
right edge is strictly left of `BIRDX` (48), its flag changes to 1 and the score goes up. It only
changes the records: `repaint_pipes` paints the move later in the frame.

`hit_test` compares edges using the half-open intervals in the map. For example, with gap middle
120 and `HALFGAP = 40`, open rows are `[80, 160)`, meaning rows 80 through 159. A bird with top row
150 has the box `[152, 160)` and fits vertically. Top row 151 gives `[153, 161)`, which touches the
lower pipe if their columns overlap. The box leaves out the picture's see-through corners and
forgives a near miss. The ground stops the whole picture: it begins at row 216, so a bird occupying
`[204, 216)` is still clear, while `[205, 217)` touches it. A collision changes `$s4` to `DEAD` and prints the
final and best scores in the Console. The dead bird then falls to its resting height.

`wait_frame` targets one frame every 20 milliseconds. It stores the next frame's deadline in
`next_frame`, reads the current time with service 30, and sleeps for the remaining time with
service 32. It adds `FRAME` to the deadline for the following frame. If there is no time left to
wait, it resets the schedule from the current time.

The routine always sleeps for at least a millisecond, giving the Screen time to show the drawing.
The Screen can also refresh between sleeps, while a frame is still being drawn. Because each pixel
is painted once, with the colour it ends the frame in, such a frame is only an earlier version of
the picture: the bird and the score never disappear from it. Drawing time and browser scheduling
affect the actual time between frames.

### Read the drawing helpers

The sky, clouds, buildings and bushes stay still, so `make_backdrop` draws them once into
`backdrop`, before the first frame. Three small tables supply repeating heights: `cloud_rise` for
clouds, `bush_rise` for bushes, and `towers` for buildings, one every eight columns. At each row,
the nearest layer supplies the colour: bushes cover buildings, buildings cover clouds, and clouds
cover sky. Buildings have windows in columns 2 and 5 every fourth row. `backdrop` has the same
layout as `display`, so the same offset reaches a cell in both arrays.

`world_column` repaints one column of the world above the ground: backdrop, or a pipe's body, its
upper cap, the gap, its lower cap and its body again. The pipe's shading comes from two tables with
one colour for each of its 30 columns, `body_shade` and `cap_shade`. The body is two columns
narrower on each side, so `body_shade` starts and ends with `NONE`, and `body_span` copies the
backdrop there. Every span routine paints rows in `[from, to)` within the clipping window `$t8` to
`$t9`. Clipping a span changes `$a1` or `$a2`.

Stores to display memory trigger Screen updates, and a frame has only about 20 milliseconds for
all of its work. Every drawing routine therefore loads the current colour and skips the store if
it already matches (`beq $t2, $a3, fs_same` in `fill_span`).

When a pipe moves one column left, its column `k` shows what column `k - 1` showed before, so a
Screen column changes only where the pipe's shading differs from the column to its left, or where
its right edge uncovers the backdrop. The `NONE` words just before and after each shading table
represent the columns outside the pipe, so `repaint_pipes` can compare entry `k` with entry
`k - 1`. With these tables 13 of the 31 columns change, and `pipe_rows` repaints only what changed
in each: the body rows where `body_shade` changes, the cap rows where `cap_shade` does. The body
has few colour changes because each repaints about 110 rows; each cap change repaints only 24.
`slide_stripes` moves the grass stripes the same way: one frame later only every fourth word of a
stripe row has changed colour, so only those are stored. `paint_world` paints the full Screen at
the start of a game.

The bird and the score are drawn over the world, and each pixel is painted once a frame. So
`repaint_pipes` leaves out the rows the bird takes this frame, in the bird's columns, and the
score's rows in the score's columns, noting in `score_covered` that the score needs drawing again.
`sprite_column` then paints one column of a sprite and the world around it: walking down the rows,
it paints the world with `world_column` up to each pixel of the sprite that is not see-through,
then that pixel. `draw_bird` calls it for the bird's 17 columns, from the higher of its old and new
top rows to the lower of their bottoms, so the world is painted where the bird was and the bird
where it is. `shown_y` records where it was drawn.

The bird and the digits are sprites: blocks of words in the Screen's own `0x00RRGGBB` format, one
per pixel, row after row. `bird_sprites` holds three pictures of 17 × 12 words, for the wing up,
level and down, and `digit_sprites` ten digits of 12 × 16. A word of 0, black, is see-through.
`draw_bird` picks a picture from the frame count, so the wing goes up, level, down, level.
`place_score` puts the score's digits into `digit_buf`, highest first, and works out the columns
they take this frame. `draw_score` draws them when the score has changed or a pipe column went
around it. In the Flappy ASM example Project, the sprites are the BMP pictures `assets/bird.bmp`
and `assets/digits.bmp` instead, which the program reads with the file services when it starts
and which you can edit in the Pixels view.

`move_pipes`, `paint_world`, `repaint_pipes`, `sprite_column`, `draw_bird` and `draw_score` save
`$ra` because they call other routines. The loops that use `$s0` save and restore it too.
`world_column` changes every temporary register except `$t8` and `$t9`, so `repaint_pipes` keeps
the column within the pipe in its stack frame, and `sprite_column` and `draw_bird` keep their
arguments there. `random_gap` changes `$v0` and `$t9`, as well as the division's HI and LO
registers. That leaves the pipe's left edge in `$t7` available across the call.

`random_gap` advances a stored number with shifts and `xor`, then divides by `GAPSPAN` to obtain
a remainder from 0 through 48. Adding `GAPMIN` gives a middle row from 92 through 140. Service 30
supplies the seed on the first flap, so the sequence depends on when play starts. If that time is
zero, `start` uses a nonzero fallback seed. Zero would stay zero through every xorshift step.

### Try it

Change `.eqv HALFGAP 40` to `30`. Before running, predict the open rows for a pipe whose middle is
120: `[120 - 30, 120 + 30) = [90, 150)`, or rows 90 through 149. Build and Run to see narrower gaps.
Both drawing and collision checking use the same constant, so a bird at top row 145, whose box is
`[147, 155)`, no longer fits in that example gap.

Restore `HALFGAP` to 40, then change `.eqv FLAPV -80` to `-60`. Predict the first playing frame
after a flap from height 1600: speed becomes `-60 + 5 = -55`, height becomes `1600 - 55 = 1545`,
and the drawn top row is `1545 >> 4 = 96`. Build and Run, tap once, and watch for a gentler rise.

Then change the sprites: in `bird_sprites`, replace every `0xF25C3C` of the beak with another
colour, such as `0xF09A2C`, or edit `towers` for a different skyline.
