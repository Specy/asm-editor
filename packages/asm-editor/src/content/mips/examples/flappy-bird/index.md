Build a Flappy Bird game with moving pipes, an animated bird and a score at the top of the Screen.
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
painted. The colour tables and the pictures are at the end, in a second `.data` section.

- `$s4` is `READY` (waiting) → `PLAYING` (moving) → `DEAD` (falling and waiting for a reset).
  A flap in `DEAD` calls `new_game`, returning to `READY`. The next flap starts play.
- `$s2` is bird height and `$s3` is vertical speed, both in sixteenths of a row. A smaller row
  number is higher on the Screen. `$s5` is the score, `$s6` the best score, `$s7` counts frames,
  and `$s1` holds the address of `display`.
- `pipes` holds three 12-byte records: the cap's left edge `x` at offset 0, gap middle at offset 4,
  and a counted flag at offset 8. Each game starts them at 216, 320 and 424, off the right edge.
- Rows are 0–255, and the ground begins at row 216. A bird at top row `top` occupies
  `[top, top + BIRDH)`, and a pipe at `x` occupies `[x, x + PIPEW)`. With gap middle `m`, the open
  rows are `[m - HALFGAP, m + HALFGAP)`. The right endpoint is excluded in each interval.
- Each frame reads all queued characters and handles the current state. While playing, it updates
  speed and height, moves pipes and checks collisions. Then it repaints the world where the bird
  was, draws the bird and the score, and sleeps until the next frame is due.

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
.eqv BIRDBYTES 204          # BIRDW * BIRDH, one picture of it
# Pipes and gaps
.eqv PIPEW 30               # the cap's width; the body is 2 narrower each side
.eqv CAPH 12
.eqv CAPLAST 11             # CAPH - 1, the cap's bottom edge row
.eqv HALFGAP 34
.eqv SPACING 104            # between one pipe and the next
.eqv CYCLE 312              # SPACING * 3, what a recycled pipe jumps by
.eqv FIRSTX 216             # WIDTH + 24, just off the right edge
.eqv GAPMIN 86              # the highest the middle of a gap goes
.eqv GAPSPAN 61             # and how far below that it can be
# Physics and timing
.eqv GRAV 6                 # sixteenths of a row, per frame, per frame
.eqv FLAPV -88              # the speed one flap gives, upwards
.eqv MAXFALL 120
.eqv STARTY 1600            # 100 * 16, where the bird waits
.eqv RESTY 3264             # (GROUNDY - BIRDH) * 16, where a dead bird lands
.eqv FRAME 20               # milliseconds a frame
# The score
.eqv DIGITW 12
.eqv DIGITH 16
.eqv DIGITBYTES 192         # DIGITW * DIGITH
.eqv SCOREY 20
.eqv SCOREEND 36            # SCOREY + DIGITH
# Game states
.eqv READY 0
.eqv PLAYING 1
.eqv DEAD 2
# Colours
.eqv NONE 0                 # in a pipe's shading: no body in this column
.eqv SKY 0x004EC0CA
.eqv CLOUD 0x00E9FCD9
.eqv CITY 0x00A8DFB5
.eqv WINDOW 0x00D2F3DC
.eqv BUSH 0x005EE270
.eqv BUSHEDGE 0x0047BF5A
.eqv EDGE 0x00543847        # the dark outline of pipes, ground and pictures
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
seed:        .word 0x1F123BB5
shown_y:     .word 100      # the bird's top row on the Screen
shown_score: .word -1       # and the score shown, -1 for none yet
next_frame:  .word 0        # the time the next frame starts at
digit_buf:   .space 12      # the score's digits, lowest first
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

# --- the frame: everything that moved, drawn over what was there -------------
draw:
    beq $s4, DEAD, still    # a dead bird's world stands still
    addi $s7, $s7, 1
    jal erase_bird
    jal paint_stripes
    j drawn
still:
    jal erase_bird
drawn:
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
# pipes are an endless course.
#
# Moving a pipe one column changes a column of the Screen only where the
# pipe's shading changes from one column to the next, plus the column just
# past its right edge, which goes back to backdrop. Those few columns are the
# ones repainted, and in each only the rows above and below the gap: the gap
# shows the backdrop before and after the move. The column within the pipe
# lives in the stack frame, at 4($sp), since world_column changes every
# temporary register.
move_pipes:
    addi $sp, $sp, -12
    sw $ra, 8($sp)
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
    sw $zero, 4($sp)        # the column within the pipe, 0 to PIPEW
mp_column:
    lw $t1, 4($sp)
    sll $t1, $t1, 2
    la $t0, body_shade
    add $t0, $t0, $t1
    lw $t2, 0($t0)          # this column's body colour
    lw $t0, -4($t0)         # and the one left of it
    bne $t2, $t0, mp_paint
    la $t0, cap_shade
    add $t0, $t0, $t1
    lw $t2, 0($t0)          # the same for the cap
    lw $t0, -4($t0)
    beq $t2, $t0, mp_same
mp_paint:
    lw $a0, 0($s0)
    lw $t0, 4($sp)
    add $a0, $a0, $t0       # the Screen column
    lw $t1, 4($s0)
    li $t8, 0
    addi $t9, $t1, -HALFGAP
    jal world_column        # above the gap, which leaves $a0 alone
    lw $t1, 4($s0)
    addi $t8, $t1, HALFGAP
    li $t9, GROUNDY
    jal world_column        # and below it
mp_same:
    lw $t0, 4($sp)
    addi $t0, $t0, 1
    sw $t0, 4($sp)
    ble $t0, PIPEW, mp_column

    addi $s0, $s0, 12
    la $t7, pipes_end
    blt $s0, $t7, mp_next
    lw $s0, 0($sp)
    lw $ra, 8($sp)
    addi $sp, $sp, 12
    jr $ra

# hit_test(): 1 in $v0 when the bird is touching a pipe or the ground
hit_test:
    sra $t0, $s2, 4         # the bird's top row
    addi $t1, $t0, BIRDH    # and one past its bottom one
    ble $t1, GROUNDY, ht_sky # bottom edge at GROUNDY is still above ground
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
# Drawing. Every routine stores a word only when its colour changes: the
# Screen's work, and so most of a frame's, is in the stores.
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
    sub $t1, $a2, $a1
    blez $t1, fs_done       # a span the window has closed draws nothing
    mul $t0, $a1, WIDTH     # row * WIDTH
    add $t0, $t0, $a0       # + col
    sll $t0, $t0, 2         # four bytes a word
    add $t0, $t0, $s1
fs_next:
    lw $t2, 0($t0)
    beq $t2, $a3, fs_same   # already that colour: no store
    sw $a3, 0($t0)
fs_same:
    addi $t0, $t0, ROWBYTES # straight down to the next row
    addi $t1, $t1, -1
    bnez $t1, fs_next
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
# ten shaded rows and another edge row. It changes $a1 to $a3, $t0 to $t2
# and $t5.
cap_span:
    addi $sp, $sp, -4
    sw $ra, 0($sp)
    move $t5, $a1
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
    lw $ra, 0($sp)
    addi $sp, $sp, 4
    jr $ra

# world_column(col): the backdrop and any pipe standing in this column, above
# the ground, in as much of the column as the window in $t8 and $t9 allows. A
# column off either side of the grid draws nothing. It changes $a1 to $a3,
# $v0, $v1 and $t0 to $t7, and leaves $a0, $t8 and $t9 alone.
world_column:
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
# a game has
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
    lw $s0, 0($sp)
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra

# paint_stripes(): the grass, diagonal stripes four columns wide, which slide
# one column to the left each frame along with the pipes
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

# draw_art(x, y, width, height, picture in $v1): a picture's opaque
# characters, row by row. It changes $a1, $a3, $v1, $t0 to $t2 and $t4 to $t6.
draw_art:
da_row:
    mul $t0, $a1, WIDTH
    add $t0, $t0, $a0
    sll $t0, $t0, 2
    add $t0, $t0, $s1       # the row's first word
    move $t1, $a2           # the characters left in the row
da_char:
    lbu $t5, 0($v1)
    addi $v1, $v1, 1
    beq $t5, '.', da_same   # see-through
    la $t4, palette_keys
    la $t6, palette
da_find:
    lbu $t2, 0($t4)
    beq $t2, $t5, da_found
    addi $t4, $t4, 1        # the next key,
    addi $t6, $t6, 4        # and its colour
    j da_find
da_found:
    lw $t6, 0($t6)
    lw $t2, 0($t0)
    beq $t2, $t6, da_same
    sw $t6, 0($t0)
da_same:
    addi $t0, $t0, 4
    addi $t1, $t1, -1
    bnez $t1, da_char
    addi $a1, $a1, 1
    addi $a3, $a3, -1
    bnez $a3, da_row
    jr $ra

# erase_bird(): the world where the bird was last drawn
erase_bird:
    addi $sp, $sp, -8
    sw $ra, 4($sp)
    sw $s0, 0($sp)
    lw $t8, shown_y
    addi $t9, $t8, BIRDH
    li $s0, BIRDX
eb_next:
    move $a0, $s0
    jal world_column        # which leaves $t8 and $t9 alone
    addi $s0, $s0, 1
    blt $s0, BIRDR, eb_next
    lw $s0, 0($sp)
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra

# draw_bird(): the bird at its row, its wing beating while it is alive: up,
# level, down, level, four frames each
draw_bird:
    li $t0, 1               # the level wing, once it is dead
    beq $s4, DEAD, db_frame
    srl $t0, $s7, 2
    andi $t0, $t0, 3
    bne $t0, 3, db_frame
    li $t0, 1
db_frame:
    mul $t0, $t0, BIRDBYTES
    la $v1, bird_art
    add $v1, $v1, $t0
    sra $a1, $s2, 4         # sixteenths of a row to rows
    sw $a1, shown_y
    li $a0, BIRDX
    li $a2, BIRDW
    li $a3, BIRDH
    j draw_art

# draw_score(): the score in the middle of the top. A pipe column repainted
# under it paints over it, so it is drawn every frame; when the number
# changes, the world is repainted under the old one first. The left edge
# lives at 4($sp) and the right edge of the wipe at 8($sp).
draw_score:
    addi $sp, $sp, -16
    sw $ra, 12($sp)
    sw $s0, 0($sp)
    move $t0, $s5
    li $s0, 0               # $s0 = how many digits
    li $t2, 10
ds_split:
    divu $t0, $t2
    mfhi $t3
    sb $t3, digit_buf($s0)  # the lowest digit left
    addi $s0, $s0, 1
    mflo $t0
    bnez $t0, ds_split

    mul $t0, $s0, DIGITW
    li $t1, WIDTH
    sub $t0, $t1, $t0
    sra $t0, $t0, 1
    sw $t0, 4($sp)          # the left edge, to centre the digits

    lw $t1, shown_score
    beq $t1, $s5, ds_draw
    sw $s5, shown_score
    addi $t1, $s0, 1
    mul $t1, $t1, DIGITW
    add $t1, $t1, $t0
    sw $t1, 8($sp)          # one digit's width past the right edge
    li $t8, SCOREY
    li $t9, SCOREEND
    addi $a0, $t0, -DIGITW  # from one digit's width before the left edge
ds_wipe:
    jal world_column        # which leaves $a0, $t8 and $t9 alone
    addi $a0, $a0, 1
    lw $t0, 8($sp)
    blt $a0, $t0, ds_wipe

ds_draw:
    addi $s0, $s0, -1       # the highest digit first
    lbu $t0, digit_buf($s0)
    mul $t0, $t0, DIGITBYTES
    la $v1, digit_art
    add $v1, $v1, $t0
    lw $a0, 4($sp)
    li $a1, SCOREY
    li $a2, DIGITW
    li $a3, DIGITH
    jal draw_art
    lw $t0, 4($sp)
    addi $t0, $t0, DIGITW
    sw $t0, 4($sp)
    bnez $s0, ds_draw
    lw $s0, 0($sp)
    lw $ra, 12($sp)
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
          .word NONE, NONE, EDGE, PIPELIGHT, PIPEHI, PIPEHI, PIPELIGHT, PIPELIGHT
          .word PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID
          .word PIPEMID, PIPEMID, PIPEDARK, PIPEMID, PIPEDARK, PIPEDARK, PIPEDARK, PIPEDARK
          .word PIPEDARK, PIPEDARK, PIPEDARK, EDGE, NONE, NONE
          .word NONE
cap_shade:
          .word EDGE, PIPELIGHT, PIPELIGHT, PIPEHI, PIPEHI, PIPEHI, PIPELIGHT, PIPELIGHT
          .word PIPELIGHT, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEMID
          .word PIPEMID, PIPEMID, PIPEMID, PIPEMID, PIPEDARK, PIPEMID, PIPEDARK, PIPEDARK
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

# Pictures, one character a pixel: '.' shows what is behind, and any other
# character is the colour at its place in palette_keys.
palette_keys: .ascii "Xywrol"
          .align 2
palette:  .word EDGE, 0x00F8C82A, 0x00FFFFFF, 0x00F25C3C, 0x00F09A2C, 0x00FAEE9C
bird_art:
# wing up
          .ascii "......XXXXXX....."
          .ascii "....XXyyyXwwX...."
          .ascii "...XyyyyXwwwwX..."
          .ascii ".XXXyyyyXwwwXwX.."
          .ascii "XlllXyyyXwwwXwX.."
          .ascii "XllllXyyyXwwwwX.."
          .ascii "XllllXyyyyXXXXXX."
          .ascii ".XXXXyyyyXrrrrrX."
          .ascii "..XooooooXrXXXXX."
          .ascii "..XoooooooXrrrrX."
          .ascii "...XXoooooXXXXX.."
          .ascii ".....XXXXX......."
# wing level
          .ascii "......XXXXXX....."
          .ascii "....XXyyyXwwX...."
          .ascii "...XyyyyXwwwwX..."
          .ascii ".XXXXyyyXwwwXwX.."
          .ascii "XllllXyyXwwwXwX.."
          .ascii "XlllllXyyXwwwwX.."
          .ascii "XylllyXyyyXXXXXX."
          .ascii ".XyyyXyyyyXrrrrrX"
          .ascii "..XXXooooXrXXXXX."
          .ascii "..XoooooooXrrrrX."
          .ascii "...XXoooooXXXXX.."
          .ascii ".....XXXXX......."
# wing down
          .ascii "......XXXXXX....."
          .ascii "....XXyyyXwwX...."
          .ascii "...XyyyyXwwwwX..."
          .ascii "..XyyyyyXwwwXwX.."
          .ascii ".XyyyyyyXwwwXwX.."
          .ascii ".XXXXXyyyXwwwwX.."
          .ascii "XlllllXyyyXXXXXX."
          .ascii "XlllllXyyXrrrrrX."
          .ascii ".XllllXooXrXXXXX."
          .ascii "..XXXXooooXrrrrX."
          .ascii "...XXoooooXXXXX.."
          .ascii ".....XXXXX......."
digit_art:
# 0
          .ascii "..XXXXXXXX.."
          .ascii "..XwwwwwwX.."
          .ascii "XXXwwwwwwXXX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XXXwwwwwwXXX"
          .ascii "..XwwwwwwX.."
          .ascii "..XXXXXXXX.."
# 1
          .ascii "....XXXX...."
          .ascii "....XwwX...."
          .ascii "..XXXwwX...."
          .ascii "..XwwwwX...."
          .ascii "..XwwwwX...."
          .ascii "..XXXwwX...."
          .ascii "....XwwX...."
          .ascii "....XwwX...."
          .ascii "....XwwX...."
          .ascii "....XwwX...."
          .ascii "....XwwX...."
          .ascii "....XwwX...."
          .ascii "..XXXwwXXX.."
          .ascii "..XwwwwwwX.."
          .ascii "..XwwwwwwX.."
          .ascii "..XXXXXXXX.."
# 2
          .ascii "..XXXXXXXX.."
          .ascii "..XwwwwwwX.."
          .ascii "XXXwwwwwwXXX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XwwX....XwwX"
          .ascii "XXXX....XwwX"
          .ascii "......XXXwwX"
          .ascii "......XwwXXX"
          .ascii "....XXXwwX.."
          .ascii "....XwwXXX.."
          .ascii "..XXXwwX...."
          .ascii "..XwwXXX...."
          .ascii "XXXwwXXXXXXX"
          .ascii "XwwwwwwwwwwX"
          .ascii "XwwwwwwwwwwX"
          .ascii "XXXXXXXXXXXX"
# 3
          .ascii "XXXXXXXXXXXX"
          .ascii "XwwwwwwwwwwX"
          .ascii "XwwwwwwwwwwX"
          .ascii "XXXXXXXwwXXX"
          .ascii "....XXXwwX.."
          .ascii "....XwwXXX.."
          .ascii "....XwwXXX.."
          .ascii "....XXXwwX.."
          .ascii "......XwwXXX"
          .ascii "......XXXwwX"
          .ascii "XXXX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XXXwwwwwwXXX"
          .ascii "..XwwwwwwX.."
          .ascii "..XXXXXXXX.."
# 4
          .ascii "......XXXX.."
          .ascii "......XwwX.."
          .ascii "....XXXwwX.."
          .ascii "....XwwwwX.."
          .ascii "..XXXwwwwX.."
          .ascii "..XwwXXwwX.."
          .ascii "XXXwwXXwwX.."
          .ascii "XwwXXXXwwX.."
          .ascii "XwwXXXXwwXXX"
          .ascii "XwwwwwwwwwwX"
          .ascii "XwwwwwwwwwwX"
          .ascii "XXXXXXXwwXXX"
          .ascii "......XwwX.."
          .ascii "......XwwX.."
          .ascii "......XwwX.."
          .ascii "......XXXX.."
# 5
          .ascii "XXXXXXXXXXXX"
          .ascii "XwwwwwwwwwwX"
          .ascii "XwwwwwwwwwwX"
          .ascii "XwwXXXXXXXXX"
          .ascii "XwwXXXXXXX.."
          .ascii "XwwwwwwwwX.."
          .ascii "XwwwwwwwwXXX"
          .ascii "XXXXXXXXXwwX"
          .ascii "........XwwX"
          .ascii "........XwwX"
          .ascii "XXXX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XXXwwwwwwXXX"
          .ascii "..XwwwwwwX.."
          .ascii "..XXXXXXXX.."
# 6
          .ascii "....XXXXXX.."
          .ascii "....XwwwwX.."
          .ascii "..XXXwwwwX.."
          .ascii "..XwwXXXXX.."
          .ascii "XXXwwX......"
          .ascii "XwwXXX......"
          .ascii "XwwXXXXXXX.."
          .ascii "XwwwwwwwwX.."
          .ascii "XwwwwwwwwXXX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XXXwwwwwwXXX"
          .ascii "..XwwwwwwX.."
          .ascii "..XXXXXXXX.."
# 7
          .ascii "XXXXXXXXXXXX"
          .ascii "XwwwwwwwwwwX"
          .ascii "XwwwwwwwwwwX"
          .ascii "XXXXXXXXXwwX"
          .ascii "......XXXwwX"
          .ascii "......XwwXXX"
          .ascii "....XXXwwX.."
          .ascii "....XwwXXX.."
          .ascii "..XXXwwX...."
          .ascii "..XwwXXX...."
          .ascii "..XwwX......"
          .ascii "..XwwX......"
          .ascii "..XwwX......"
          .ascii "..XwwX......"
          .ascii "..XwwX......"
          .ascii "..XXXX......"
# 8
          .ascii "..XXXXXXXX.."
          .ascii "..XwwwwwwX.."
          .ascii "XXXwwwwwwXXX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XXXwwwwwwXXX"
          .ascii "XXXwwwwwwXXX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XXXwwwwwwXXX"
          .ascii "..XwwwwwwX.."
          .ascii "..XXXXXXXX.."
# 9
          .ascii "..XXXXXXXX.."
          .ascii "..XwwwwwwX.."
          .ascii "XXXwwwwwwXXX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwX....XwwX"
          .ascii "XwwXXXXXXwwX"
          .ascii "XXXwwwwwwwwX"
          .ascii "..XwwwwwwwwX"
          .ascii "..XXXXXXXwwX"
          .ascii "......XXXwwX"
          .ascii "......XwwXXX"
          .ascii "..XXXXXwwX.."
          .ascii "..XwwwwXXX.."
          .ascii "..XwwwwX...."
          .ascii "..XXXXXX...."
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

During `PLAYING`, a flap sets speed `$s3` to `-88`. Gravity then adds 6, the speed is limited to
`MAXFALL`, and that speed is added to height `$s2`. Starting at height 1600 (row 100), the first
playing frame after a flap makes speed `-88 + 6 = -82` and height `1600 - 82 = 1518`. The drawn top
row is `1518 >> 4 = 94`. With no flap on the next frame, speed becomes `-76`, height becomes `1442`,
and the drawn top row is 90. The lower four bits of height remain stored, so small changes can
accumulate even when the drawn row stays the same. Reaching the top clamps height and speed to 0.

`move_pipes` moves each left edge one column left. Once an edge moves past `-PIPEW` (`-30`), it
adds `CYCLE` (`312`), chooses a new gap, and clears that record's counted flag. Since there are
three pipes spaced 104 columns apart, `CYCLE = 3 × SPACING` keeps their spacing. When a pipe's
right edge is strictly left of `BIRDX` (48), its flag changes to 1 and the score goes up.

`hit_test` compares edges using the half-open intervals in the map. For example, with gap middle
120 and `HALFGAP = 34`, open rows are `[86, 154)`, meaning rows 86 through 153. A bird with top row
142 occupies `[142, 154)` and fits vertically. Top row 143 occupies `[143, 155)` and touches the
lower pipe if their columns overlap. Ground begins at row 216, so a bird occupying `[204, 216)` is
still clear, while `[205, 217)` touches it. A collision changes `$s4` to `DEAD` and prints the
final and best scores in the Console. The dead bird then falls to its resting height.

`wait_frame` targets one frame every 20 milliseconds. It stores the next frame's deadline in
`next_frame`, reads the current time with service 30, and sleeps for the remaining time with
service 32. It adds `FRAME` to the deadline for the following frame. If there is no time left to
wait, it resets the schedule from the current time.

The routine always sleeps for at least a millisecond, giving the Screen time to show the drawing.
The Screen can also refresh between sleeps. Drawing time and browser scheduling affect the actual
time between frames.

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

Stores to display memory trigger Screen updates. To avoid unnecessary updates, every drawing
routine loads the current colour and skips the store if it already matches
(`beq $t2, $a3, fs_same` in `fill_span`).

The pipe routine also skips columns whose colours stay the same as the pipe moves left. A column
needs repainting where the pipe's shading differs from the column to its left, or where its right
edge uncovers the backdrop. The `NONE` words just before and after each shading table represent
the columns outside the pipe, so `mp_column` can compare entry `k` with entry `k - 1`. In each
changed column, it repaints only the rows above and below the gap. The gap continues to show the
same backdrop. `paint_world` paints the full Screen at the start of a game.

The bird and the score digits are pictures stored as text, one character per cell. `.` leaves
the existing colour unchanged. Each other character selects a colour at the same index in
`palette_keys` and `palette`. `draw_art` reads a picture and stores each colour. `draw_bird` picks
one of three bird pictures from the frame count, so the wing goes up, level, down, level.
`erase_bird` first repaints the scene over the rows where the bird was last drawn, recorded in
`shown_y`. `draw_score` draws the score
every frame to restore any digits covered by a moving pipe. When the number changes, it also
repaints the scene under the old digits.

`move_pipes`, `paint_world`, `erase_bird`, and `draw_score` save `$ra` because they call other
routines. The loops that use `$s0` save and restore it too. `world_column` changes every temporary
register except `$t8` and `$t9`, so `move_pipes` keeps the column within the pipe in its stack
frame, and `draw_score` keeps the digits' left edge there. `random_gap` changes `$v0` and `$t9`, as
well as the division's HI and LO registers. That leaves the pipe's left edge in `$t7` available
across the call.

`random_gap` advances a stored number with shifts and `xor`, then divides by `GAPSPAN` to obtain
a remainder from 0 through 60. Adding `GAPMIN` gives a middle row from 86 through 146. Service 30
supplies the seed on the first flap, so the sequence depends on when play starts. If that time is
zero, `start` uses a nonzero fallback seed. Zero would stay zero through every xorshift step.

### Try it

Change `.eqv HALFGAP 34` to `24`. Before running, predict the open rows for a pipe whose middle is
120: `[120 - 24, 120 + 24) = [96, 144)`, or rows 96 through 143. Build and Run to see narrower gaps.
Both drawing and collision checking use the same constant, so a bird at top row 140 occupies
`[140, 152)` and no longer fits in that example gap.

Restore `HALFGAP` to 34, then change `.eqv FLAPV -88` to `-60`. Predict the first playing frame
after a flap from height 1600: speed becomes `-60 + 6 = -54`, height becomes `1600 - 54 = 1546`,
and the drawn top row is `1546 >> 4 = 96`. Build and Run, tap once, and watch for a gentler rise.

Then change the pictures: turn the `r` characters of the first bird picture into `o`, or edit
`towers` for a different skyline. To add a colour, append a key to `palette_keys` and a word to
`palette`, then use the key in a picture.
