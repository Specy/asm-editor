Build a Flappy Bird game with moving pipes, an animated bird and a score at the top of the Screen.
Tap Space, lowercase `w`, or Enter to flap. A collision ends the run. Tap once to reset the game
and again to start.

**Click the Screen panel before you press a key**, as in Move a square with the keyboard.

For the same game written with the simulator's C API, see [Flappy Bird in C](/learn/courses/risc-v/examples/flappy-bird-in-c).

This example combines the frame loop, keyboard input, screen addresses, and supplied xorshift
helper from The snake game. It adds three game states, fractional movement, pipe records and
collision checks with half-open ranges. The drawing routines use pictures stored as text and
update only the pixels that change.

The Screen is a grid of 192 × 256 words. The `@screen` line asks for a 384 × 512 pixel display with
`unit=2`, so each word is drawn as a 2 × 2 square. Word `(x, y)` is at
`display + (y * 192 + x) * 4`, and adding `ROWBYTES`, 768, moves straight down one row.

Keep this register map nearby as you read. Most values describe the game between frames. `s10`
records the current frame's input, while helpers use `s8` and `s9` for local values that must survive
calls to other routines.

| Register | Meaning                                                    |
| -------- | ---------------------------------------------------------- |
| `s0`     | address of the first display word                          |
| `s1`     | address of the first backdrop word                         |
| `s2`     | bird top position, in sixteenths of a row                  |
| `s3`     | bird velocity, also in sixteenths of a row per frame       |
| `s4`     | current state: `READY`, `PLAYING`, or `DEAD`               |
| `s5`     | score for this run                                         |
| `s6`     | best score in this execution                               |
| `s7`     | keyboard MMIO base address                                 |
| `s8`     | pipe pointer or column counter inside a helper             |
| `s9`     | column within a pipe, or the score's left edge             |
| `s10`    | whether this frame received at least one accepted flap key |
| `s11`    | frames since the program started                           |

Each pipe occupies three adjacent words:

```text
pipe record
+0                 +4                 +8
cap's left x        gap middle         counted
216                 120                0
```

`counted` becomes 1 after that pipe passes the bird, so it cannot add to the score twice. The three
records are allocated as zeroes in `.data`. `new_pipes` sets their starting positions, gaps and
scoring flags.

The game moves through three states:

```text
READY --accepted key--> PLAYING --collision--> DEAD
  ^                                           |
  +---------------accepted key---------------+
```

One frame does the following:

1. Read all queued characters and remember whether any is a flap key.
2. Run the update for the current state. While playing, this moves the pipes.
3. Unless the bird is dead, count the frame and slide the grass stripes one column.
4. Repaint the world where the bird was, draw the bird at its new row, and draw the score.
5. Sleep until the next frame is due, `FRAME` milliseconds after the last one started.

The colour tables and the pictures are at the end of the listing, in a second `.data` section.

```riscv|playground|open-screen|console|no-registers|allow-open
# @screen unit=2 width=384 height=512 base=display
.eqv MMIO, 0xffff0000
# The grid: 192 x 256 words, each drawn as a 2 x 2 square
.eqv WIDTH, 192
.eqv HEIGHT, 256
.eqv ROWBYTES, 768          # WIDTH * 4, from one row to the next
.eqv GROUNDY, 216           # the first row of ground
.eqv GRASSY, 217            # its light top row
.eqv STRIPEY, 218           # the eight rows of striped grass
.eqv STRIPEEND, 226         # and the dark row under them
.eqv SANDY, 227
# The scenery behind the pipes
.eqv CLOUDY, 150            # the base the clouds rise from
.eqv CITYY, 204             # and the buildings
.eqv BUSHY, 204             # and the bushes
# The bird
.eqv BIRDX, 48              # the bird only ever moves up and down
.eqv BIRDW, 17
.eqv BIRDH, 12
.eqv BIRDR, 65              # BIRDX + BIRDW, the column after the bird
.eqv BIRDBYTES, 204         # BIRDW * BIRDH, one picture of it
# Pipes and gaps
.eqv PIPEW, 30              # the cap's width; the body is 2 narrower each side
.eqv CAPH, 12
.eqv CAPLAST, 11            # CAPH - 1, the cap's bottom edge row
.eqv HALFGAP, 34
.eqv SPACING, 104           # between one pipe and the next
.eqv CYCLE, 312             # SPACING * 3, what a recycled pipe jumps by
.eqv FIRSTX, 216            # WIDTH + 24, just off the right edge
.eqv GAPMIN, 86             # the highest the middle of a gap goes
.eqv GAPSPAN, 61            # and how far below that it can be
# Physics and timing
.eqv GRAV, 6                # add this many sixteenths to velocity each frame
.eqv FLAPV, -88             # the speed one flap gives, upwards
.eqv MAXFALL, 120
.eqv STARTY, 1600           # 100 * 16, where the bird waits
.eqv RESTY, 3264            # (GROUNDY - BIRDH) * 16, where a dead bird lands
.eqv FRAME, 20              # milliseconds a frame
# The score
.eqv DIGITW, 12
.eqv DIGITH, 16
.eqv DIGITBYTES, 192        # DIGITW * DIGITH
.eqv SCOREY, 20
.eqv SCOREEND, 36           # SCOREY + DIGITH
# Game states
.eqv READY, 0
.eqv PLAYING, 1
.eqv DEAD, 2
# Colours
.eqv NONE, 0                # in a pipe's shading: no body in this column
.eqv SKY, 0x004EC0CA
.eqv CLOUD, 0x00E9FCD9
.eqv CITY, 0x00A8DFB5
.eqv WINDOW, 0x00D2F3DC
.eqv BUSH, 0x005EE270
.eqv BUSHEDGE, 0x0047BF5A
.eqv EDGE, 0x00543847       # the dark outline of pipes, ground and pictures
.eqv PIPEHI, 0x00E4FD8B
.eqv PIPELIGHT, 0x009CE659
.eqv PIPEMID, 0x0073BF2E
.eqv PIPEDARK, 0x00558022
.eqv SAND, 0x00DED895

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
over:    .asciz "Game over. Score: "
bestmsg: .asciz ", best: "

.text
.globl main
main:
    addi sp, sp, -12        # Playground starts 12 mod 16; align before any call
    la s0, display
    la s1, backdrop
    li s7, MMIO
    li s6, 0                # the best score of the session
    li s11, 0               # frames since the program started
    jal make_backdrop
    jal new_game
    li a7, 30               # service 30: milliseconds since the run started
    ecall
    la t0, next_frame
    sw a0, 0(t0)            # the first frame starts now

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

# --- waiting to start: the bird bobs until the first flap --------------------
    bnez s10, start
    andi t0, s11, 31        # up for 16 frames, then down for 16
    li t1, 16
    blt t0, t1, bob
    li t1, 31
    sub t0, t1, t0
bob:
    slli t0, t0, 2          # a quarter of a row a frame
    li s2, STARTY
    add s2, s2, t0
    j draw
start:
    li a7, 30
    ecall
    bnez a0, seeded         # a zero seed would stay zero after every shift and xor
    li a0, 0x1F123BB5
seeded:
    sw a0, seed, t0         # so the course depends on when the player began
    jal new_pipes           # off to the right, so there is nothing to repaint
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
    beqz s10, dead_fall
    jal new_game
    j draw
dead_fall:
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

# --- the frame: everything that moved, drawn over what was there -------------
draw:
    li t0, DEAD
    beq s4, t0, still       # a dead bird's world stands still
    addi s11, s11, 1
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
    addi sp, sp, -16
    sw ra, 0(sp)
    li s2, STARTY           # the bird, in sixteenths of a row
    li s3, 0                # and how fast it is falling
    li s4, READY
    li s5, 0                # the score
    jal new_pipes
    jal paint_world
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# new_pipes(): three pipes off to the right, each with a gap of its own
new_pipes:
    addi sp, sp, -16
    sw ra, 0(sp)
    la t0, pipes
    li t1, FIRSTX
    li t2, 3
np_next:
    sw t1, 0(t0)            # where its cap's left edge is
    jal random_gap          # which leaves t0, t1 and t2 alone
    sw a0, 4(t0)            # the middle of its gap
    sw zero, 8(t0)          # and it has not been counted yet
    addi t1, t1, SPACING
    addi t0, t0, 12
    addi t2, t2, -1
    bnez t2, np_next
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# move_pipes(): everything scrolls one column to the left. A pipe that has left
# the grid jumps a whole cycle to the right with a new gap, which is why three
# pipes are an endless course.
#
# Moving a pipe one column changes a column of the Screen only where the
# pipe's shading changes from one column to the next, plus the column just
# past its right edge, which goes back to backdrop. Those few columns are the
# ones repainted, and in each only the rows above and below the gap: the gap
# shows the backdrop before and after the move.
move_pipes:
    addi sp, sp, -16
    sw ra, 0(sp)
    sw s8, 4(sp)
    sw s9, 8(sp)
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
mp_counted:
    li s9, 0                # the column within the pipe, 0 to PIPEW
mp_column:
    slli t1, s9, 2
    la t0, body_shade
    add t0, t0, t1
    lw t2, 0(t0)            # this column's body colour
    lw t0, -4(t0)           # and the one left of it
    bne t2, t0, mp_paint
    la t0, cap_shade
    add t0, t0, t1
    lw t2, 0(t0)            # the same for the cap
    lw t0, -4(t0)
    beq t2, t0, mp_same
mp_paint:
    lw a0, 0(s8)
    add a0, a0, s9          # the Screen column
    lw t1, 4(s8)
    li t3, 0
    addi t4, t1, -HALFGAP
    jal world_column        # above the gap, which leaves a0 alone
    lw t1, 4(s8)
    addi t3, t1, HALFGAP
    li t4, GROUNDY
    jal world_column        # and below it
mp_same:
    addi s9, s9, 1
    li t0, PIPEW
    ble s9, t0, mp_column

    addi s8, s8, 12
    la t0, pipes_end
    blt s8, t0, mp_next
    lw s9, 8(sp)
    lw s8, 4(sp)
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# hit_test(): 1 in a0 when the bird is touching a pipe or the ground
hit_test:
    srai t0, s2, 4          # the bird's top row
    addi t1, t0, BIRDH      # and one past its bottom one
    li t2, GROUNDY
    ble t1, t2, ht_sky      # bottom edge at GROUNDY is still above ground
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

# wait_frame(): sleep until the next frame is due, so frames start every FRAME
# milliseconds however long their drawing took. It always sleeps, for at least
# a millisecond, since a sleep is when the Screen shows the frame.
wait_frame:
    li a7, 30
    ecall                   # a0 = now
    la t2, next_frame
    lw t0, 0(t2)
    sub t1, t0, a0          # how long until the next frame is due
    li a1, 1
    bge t1, a1, wf_sleep
    li t1, 1                # running late: start the schedule again from now
    mv t0, a0
wf_sleep:
    addi t0, t0, FRAME
    sw t0, 0(t2)
    mv a0, t1
    li a7, 32               # service 32: sleep a0 milliseconds of program time
    ecall
    ret

#-----------------------------------------------------------------------------
# Drawing. Every routine stores a word only when its colour changes: the
# Screen's work, and so most of a frame's, is in the stores.
#-----------------------------------------------------------------------------
# make_backdrop(): the scenery, into backdrop: sky, clouds, buildings with
# windows and bushes, from the top of each column down to the ground.
make_backdrop:
    li t0, 0                # the column
mb_column:
    andi t1, t0, 63
    la t2, cloud_rise
    add t2, t2, t1
    lbu t1, 0(t2)
    li t3, CLOUDY
    sub t3, t3, t1          # t3 = the clouds' top row in this column
    srli t1, t0, 3          # which building: one every eight columns,
    li t2, 12
    remu t1, t1, t2         # and twelve of them over and over
    la t2, towers
    add t2, t2, t1
    lbu t1, 0(t2)
    li t4, CITYY
    sub t4, t4, t1          # t4 = the buildings' top row
    andi t1, t0, 31
    la t2, bush_rise
    add t2, t2, t1
    lbu t1, 0(t2)
    li t5, BUSHY
    sub t5, t5, t1          # t5 = the bushes' top row
    andi t6, t0, 7          # t6 = the column within its building
    slli t1, t0, 2
    add t1, t1, s1          # t1 = this column's word in the top row
    li t2, 0                # the row
mb_row:
    bge t2, t5, mb_bush     # nearest first: bushes, buildings, clouds
    bge t2, t4, mb_city
    li a1, CLOUD
    bge t2, t3, mb_put
    li a1, SKY
    j mb_put
mb_bush:
    li a1, BUSH
    bne t2, t5, mb_put
    li a1, BUSHEDGE         # the bushes' top row is darker
    j mb_put
mb_city:
    li a1, CITY             # windows in columns 2 and 5 of each building,
    andi a2, t2, 3          # every fourth row, below the top two
    li a3, 2
    bne a2, a3, mb_put
    addi a2, t4, 2
    ble t2, a2, mb_put
    beq t6, a3, mb_window
    li a2, 5
    bne t6, a2, mb_put
mb_window:
    li a1, WINDOW
mb_put:
    sw a1, 0(t1)
    addi t1, t1, ROWBYTES
    addi t2, t2, 1
    li a2, GROUNDY
    blt t2, a2, mb_row
    addi t0, t0, 1
    li a2, WIDTH
    blt t0, a2, mb_column
    ret

# fill_span(a0=col, a1=from, a2=to, a3=colour): paint the half-open row range
# [from, to), clipped to the window [t3, t4). It changes a1, a2, t0, t1 and t2;
# t3 and t4 survive the call.
fill_span:
    bge a1, t3, fs_top
    mv a1, t3
fs_top:
    ble a2, t4, fs_rows
    mv a2, t4
fs_rows:
    sub t1, a2, a1
    blez t1, fs_done        # a span the window has closed draws nothing
    li t0, WIDTH
    mul t0, a1, t0          # row * WIDTH
    add t0, t0, a0          # + col
    slli t0, t0, 2          # four bytes a word
    add t0, t0, s0
fs_next:
    lw t2, 0(t0)
    beq t2, a3, fs_same     # already that colour: no store
    sw a3, 0(t0)
fs_same:
    addi t0, t0, ROWBYTES   # straight down to the next row
    addi t1, t1, -1
    bnez t1, fs_next
fs_done:
    ret

# body_span(a0=col, a1=from, a2=to, a3=colour): fill_span, or backdrop_span
# for a NONE colour, where only a pipe's cap reaches
body_span:
    beqz a3, backdrop_span
    j fill_span

# backdrop_span(a0=col, a1=from, a2=to): as fill_span, with the backdrop's
# own colours. It also changes t5 and t6.
backdrop_span:
    bge a1, t3, bs_top
    mv a1, t3
bs_top:
    ble a2, t4, bs_rows
    mv a2, t4
bs_rows:
    sub t1, a2, a1
    blez t1, bs_done
    li t0, WIDTH
    mul t0, a1, t0
    add t0, t0, a0
    slli t0, t0, 2
    add t5, t0, s1          # the word in the backdrop
    add t0, t0, s0          # and the one on the Screen
bs_next:
    lw t6, 0(t5)
    lw t2, 0(t0)
    beq t2, t6, bs_same
    sw t6, 0(t0)
bs_same:
    addi t5, t5, ROWBYTES
    addi t0, t0, ROWBYTES
    addi t1, t1, -1
    bnez t1, bs_next
bs_done:
    ret

# cap_span(a0=col, a1=first row, a5=colour): a cap's column, an edge row, ten
# shaded rows and another edge row. It changes a1 to a3, t0 to t2 and t5.
cap_span:
    addi sp, sp, -16
    sw ra, 0(sp)
    mv t5, a1
    li a3, EDGE
    addi a2, t5, 1
    jal fill_span
    mv a3, a5
    addi a1, t5, 1
    addi a2, t5, CAPLAST
    jal fill_span
    li a3, EDGE
    addi a1, t5, CAPLAST
    addi a2, t5, CAPH
    jal fill_span
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# world_column(a0=col, t3=window start, t4=window end): paint the backdrop and
# any pipe standing in this column, above the ground and within [t3, t4). A
# column outside the grid draws nothing. It changes a1 to a7, t0 to t2, t5 and
# t6, and leaves a0, t3 and t4 alone.
world_column:
    bltz a0, wc_done
    li t0, WIDTH
    bge a0, t0, wc_done
    addi sp, sp, -16
    sw ra, 0(sp)

    la t0, pipes            # is a pipe standing in this column
    la t1, pipes_end
wc_find:
    lw t2, 0(t0)
    sub t2, a0, t2          # the column within that pipe
    bltz t2, wc_skip
    li t5, PIPEW
    blt t2, t5, wc_pipe
wc_skip:
    addi t0, t0, 12
    blt t0, t1, wc_find
    li a1, 0                # no pipe: backdrop all the way down
    li a2, GROUNDY
    jal backdrop_span
    j wc_return

wc_pipe:
    slli t2, t2, 2
    la t5, body_shade
    add t5, t5, t2
    lw a4, 0(t5)            # a4 = the body's colour in this column
    la t5, cap_shade
    add t5, t5, t2
    lw a5, 0(t5)            # a5 = the caps' colour
    lw t5, 4(t0)            # the middle of its gap
    addi a6, t5, -HALFGAP   # a6 = the gap's top row
    addi a7, t5, HALFGAP    # a7 = one past its bottom row
    li a1, 0
    addi a2, a6, -CAPH
    mv a3, a4
    jal body_span           # from the top of the grid down to the upper cap
    addi a1, a6, -CAPH
    jal cap_span            # the upper cap, just above the gap
    mv a1, a6
    mv a2, a7
    jal backdrop_span       # the gap itself
    mv a1, a7
    jal cap_span            # the lower cap
    addi a1, a7, CAPH
    li a2, GROUNDY
    mv a3, a4
    jal body_span           # and from the lower cap down to the ground
wc_return:
    lw ra, 0(sp)
    addi sp, sp, 16
wc_done:
    ret

# paint_world(): every column, then the ground, which is the one full repaint
# a game has
paint_world:
    addi sp, sp, -16
    sw ra, 0(sp)
    sw s8, 4(sp)
    li t3, 0
    li t4, GROUNDY
    li s8, 0
pw_sky:
    mv a0, s8
    jal world_column
    addi s8, s8, 1
    li t0, WIDTH
    blt s8, t0, pw_sky

    li t3, 0
    li t4, HEIGHT
    li s8, 0
pw_ground:
    mv a0, s8
    li a1, GROUNDY
    li a2, GRASSY
    li a3, EDGE
    jal fill_span           # the outline along the top of the ground
    li a1, GRASSY
    li a2, STRIPEY
    li a3, PIPEHI
    jal fill_span
    li a1, STRIPEEND
    li a2, SANDY
    li a3, PIPEDARK
    jal fill_span
    li a1, SANDY
    li a2, HEIGHT
    li a3, SAND
    jal fill_span
    addi s8, s8, 1
    li t0, WIDTH
    blt s8, t0, pw_ground
    jal paint_stripes       # and the grass between them
    lw s8, 4(sp)
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# paint_stripes(): the grass, diagonal stripes four columns wide, which slide
# one column to the left each frame along with the pipes
paint_stripes:
    li t1, STRIPEY          # the row
ps_row:
    li t0, WIDTH
    mul t3, t1, t0
    slli t3, t3, 2
    add t3, t3, s0          # its first word
    addi t4, t3, ROWBYTES   # and the one past its last
    add t5, t1, s11         # x + row + frames, starting from x = 0
ps_word:
    andi t2, t5, 4
    li a3, PIPELIGHT
    beqz t2, ps_put
    li a3, PIPEMID
ps_put:
    lw t2, 0(t3)
    beq t2, a3, ps_same
    sw a3, 0(t3)
ps_same:
    addi t3, t3, 4
    addi t5, t5, 1
    blt t3, t4, ps_word
    addi t1, t1, 1
    li t0, STRIPEEND
    blt t1, t0, ps_row
    ret

# draw_art(a0=x, a1=y, a2=width, a3=height, a4=picture): a picture's opaque
# characters, row by row. It changes a1, a3 to a6, t0 to t2, t5 and t6.
draw_art:
da_row:
    li t0, WIDTH
    mul t0, a1, t0
    add t0, t0, a0
    slli t0, t0, 2
    add t0, t0, s0          # the row's first word
    mv t1, a2               # the characters left in the row
da_char:
    lbu t5, 0(a4)
    addi a4, a4, 1
    li t6, '.'
    beq t5, t6, da_same     # see-through
    la a5, palette_keys
    la a6, palette
da_find:
    lbu t6, 0(a5)
    beq t6, t5, da_found
    addi a5, a5, 1          # the next key,
    addi a6, a6, 4          # and its colour
    j da_find
da_found:
    lw t6, 0(a6)
    lw t2, 0(t0)
    beq t2, t6, da_same
    sw t6, 0(t0)
da_same:
    addi t0, t0, 4
    addi t1, t1, -1
    bnez t1, da_char
    addi a1, a1, 1
    addi a3, a3, -1
    bnez a3, da_row
    ret

# erase_bird(): the world where the bird was last drawn
erase_bird:
    addi sp, sp, -16
    sw ra, 0(sp)
    sw s8, 4(sp)
    lw t3, shown_y
    addi t4, t3, BIRDH
    li s8, BIRDX
eb_next:
    mv a0, s8
    jal world_column        # which leaves t3 and t4 alone
    addi s8, s8, 1
    li t0, BIRDR
    blt s8, t0, eb_next
    lw s8, 4(sp)
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# draw_bird(): the bird at its row, its wing beating while it is alive: up,
# level, down, level, four frames each
draw_bird:
    li t0, 1                # the level wing, once it is dead
    li t1, DEAD
    beq s4, t1, db_frame
    srli t0, s11, 2
    andi t0, t0, 3
    li t1, 3
    bne t0, t1, db_frame
    li t0, 1
db_frame:
    li t1, BIRDBYTES
    mul t0, t0, t1
    la a4, bird_art
    add a4, a4, t0
    srai a1, s2, 4          # sixteenths of a row to rows
    sw a1, shown_y, t0
    li a0, BIRDX
    li a2, BIRDW
    li a3, BIRDH
    j draw_art

# draw_score(): the score in the middle of the top. A pipe column repainted
# under it paints over it, so it is drawn every frame; when the number
# changes, the world is repainted under the old one first.
draw_score:
    addi sp, sp, -16
    sw ra, 0(sp)
    sw s8, 4(sp)
    sw s9, 8(sp)
    mv t0, s5
    la t1, digit_buf
    li s8, 0                # s8 = how many digits
    li t2, 10
ds_split:
    remu t3, t0, t2
    add t4, t1, s8
    sb t3, 0(t4)            # the lowest digit left
    addi s8, s8, 1
    divu t0, t0, t2
    bnez t0, ds_split

    li t0, DIGITW
    mul t0, s8, t0
    li t1, WIDTH
    sub t0, t1, t0
    srai s9, t0, 1          # s9 = the left edge, to centre the digits

    lw t0, shown_score
    beq t0, s5, ds_draw
    sw s5, shown_score, t0
    addi t0, s8, 1
    li t1, DIGITW
    mul t0, t0, t1
    add t0, t0, s9
    sw t0, 12(sp)           # one digit's width past the right edge
    li t3, SCOREY
    li t4, SCOREEND
    addi a0, s9, -DIGITW    # from one digit's width before the left edge
ds_wipe:
    jal world_column        # which leaves a0, t3 and t4 alone
    addi a0, a0, 1
    lw t0, 12(sp)
    blt a0, t0, ds_wipe

ds_draw:
    addi s8, s8, -1         # the highest digit first
    la t0, digit_buf
    add t0, t0, s8
    lbu t0, 0(t0)
    li t1, DIGITBYTES
    mul t0, t0, t1
    la a4, digit_art
    add a4, a4, t0
    mv a0, s9
    li a1, SCOREY
    li a2, DIGITW
    li a3, DIGITH
    jal draw_art
    addi s9, s9, DIGITW
    bnez s8, ds_draw
    lw s9, 8(sp)
    lw s8, 4(sp)
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

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

## Frame and states

`s4` selects one of three update paths. In `READY`, the bird bobs up and down near its starting
height: the low five bits of the frame count rise from 0 to 15 and fall back, and each step moves
the bird a quarter of a row. The first accepted key seeds the gap sequence, creates the pipes,
changes the state to `PLAYING`, and sets `s3` to `FLAPV`. In `PLAYING`, the program updates
velocity and position, moves the pipes, and checks for a collision. After a collision, `DEAD` lets
the bird continue falling until it rests on the ground, and an accepted key calls `new_game`.

The input loop reads every queued character. The receiver Ready bit remains set while a character
is waiting, so `read_key` continues until the queue is empty. `s10` records a yes-or-no result for
the frame: three accepted characters still produce one flap.

An ordinary conditional branch compares two registers. That is why the nonzero character constant
in `li t2, ' '` must be loaded before `beq t1, t2, flapped`. Thresholds work the same way: the code
loads `MAXFALL` into `t0` before comparing `s3` and `t0`. By contrast, the zero-branch forms
`bnez s10, start` and `beqz s10, dead_fall` need no loaded zero, and `bgez s2, in_sky` compares
directly with zero as well.

`main` begins with `addi sp, sp, -12`. The Playground starts `sp` at `0x7fffeffc`, which is 12
modulo 16: four bytes before the next 16-byte boundary. Subtracting 12 produces `0x7fffeff0`, so
this one-time adjustment aligns the stack before the first `jal`. Every helper then allocates a
multiple of 16 bytes and keeps that alignment. `main` never returns, so it has no later caller for
which it must restore the 12 bytes.

## Bird physics

`s2` stores the bird's top position in **sixteenths of a row**, and `s3` stores its velocity in the
same units per frame. Gravity adds 6 to the velocity. A flap replaces the velocity with -88, where a
negative value means upward movement. `MAXFALL` limits the downward velocity.

The position can retain a fraction even though the screen uses whole rows. For example, starting
from 1600 with velocity 0, three frames without a flap give these values:

| Frame | velocity after gravity | position | displayed row (`position >> 4`) |
| ----: | ---------------------: | -------: | ------------------------------: |
|     1 |                      6 |     1606 |                             100 |
|     2 |                     12 |     1618 |                             101 |
|     3 |                     18 |     1636 |                             102 |

The low four bits remain in `s2` for the next update. Drawing discards them with a shift.

## Pipe records and scoring

`move_pipes` subtracts one from each pipe's left edge. When that edge moves past `-PIPEW`, the pipe
is completely off-screen. Adding `CYCLE`, which is three times `SPACING`, moves the same record to
the next evenly spaced position on the right. It receives a new gap and its `counted` word returns
to zero.

The score increases after a pipe's right edge passes the bird's left edge. Setting `counted` to 1
ensures that later frames do not score the same pipe again.

Treat `random_gap` as a supplied helper, as in the Snake game. Its useful contract is: it returns a
gap middle from 86 to 146 in `a0`, and, besides the link address created by `jal`, it changes only
`a0` and `t6`. Service 30 supplies a seed when play begins, while xorshift deterministically
produces the following values. A seed of zero would stay zero through every shift and `xor`, so
`start` replaces it with a fixed nonzero one.

## Collision ranges

The hit test uses **half-open intervals**: the first position belongs to the object and the position
after the end does not. Horizontally, the bird occupies `[BIRDX, BIRDR)`, which is `[48, 65)`, and a
pipe occupies `[left, left + PIPEW)`. The test uses the cap's width for the whole pipe, two columns
wider on each side than the body.

```text
no overlap                 overlap
bird [48,65) pipe [65,95)  bird [48,65)
             ^ touching        pipe [64,94)
             edges only             ^ shared column 64
```

There is no horizontal overlap when the pipe starts at or beyond `BIRDR`, or when its right edge is
at or before `BIRDX`. That explains the `bge` and `ble` branches in `hit_test`.

The same convention applies vertically. If the top row is 100 and `BIRDH` is 12, the bird occupies
`[100, 112)`. A gap with middle 100 and `HALFGAP` 34 occupies `[66, 134)`, so the bird fits. The
test uses strict `blt` and `bgt` for the pipe edges: equality means the bird still fits exactly. The
ground starts at `GROUNDY`, row 216. A bird whose excluded bottom edge equals `GROUNDY` is still
clear of the ground, which is why the ground test branches with `ble`.

## The backdrop

The sky, clouds, buildings and bushes stay still, so `make_backdrop` draws them once into
`backdrop`, before the first frame. It works column by column. Three small tables supply repeating
heights: `cloud_rise` repeats every 64 columns, `bush_rise` every 32, and `towers` holds twelve
building heights, each used for eight columns. The top rows of the clouds, buildings and bushes
are held in `t3`, `t4` and `t5`. At each row, the nearest layer supplies the colour:

```text
row >= bushes' top     bush (its top row darker)
row >= buildings' top  building, or a window in columns 2 and 5, every fourth row
row >= clouds' top     cloud
otherwise              sky
```

`backdrop` has the same layout as `display`, one word per cell and 192 words per row, so the same
offset reaches a cell in both arrays. When a pipe or the bird moves away, `backdrop_span` copies
the uncovered scenery back into `display`.

## Painting one column

`world_column` redraws one column of the scene. It checks whether a pipe occupies that column,
then paints from the top down to the ground:

```text
[0, top - CAPH)          body, or backdrop beside a cap's overhang
[top - CAPH, top)        upper cap: an edge row, ten shaded rows, an edge row
[top, bottom)            the gap, which is backdrop
[bottom, bottom + CAPH)  lower cap
[bottom + CAPH, 216)     body
```

Here `top` is the gap middle minus `HALFGAP` and `bottom` the middle plus `HALFGAP`. A pipe's
shading is two tables of colours, one word for each of its 30 columns: `body_shade` for the body
and `cap_shade` for the caps. The body is two columns narrower on each side, so `body_shade` starts
and ends with `NONE`, and `body_span` paints backdrop there instead.

Each span routine paints `[a1, a2)` clipped to a window `[t3, t4)`, so a caller can repaint any
band of a column. For example, a request for `[8, 20)` with the window `[12, 17)` paints rows 12
through 16. The routines change `t0` to `t2` (and `backdrop_span` also `t5` and `t6`), but the
window in `t3` and `t4` survives, which is why `world_column` can call several of them in a row.

## Store only what changes

Stores to display memory trigger Screen updates. To avoid unnecessary updates, every drawing
routine loads the current colour and skips the store if it already matches, as in `fill_span`:

```text
lw   t2, 0(t0)
beq  t2, a3, fs_same     # already that colour: no store
sw   a3, 0(t0)
```

The pipe routine also skips columns whose colours stay the same as the pipe moves left. A column
needs repainting where the pipe's shading differs from the column to its left, or where its right
edge uncovers the backdrop. The `NONE` words just before and after the shading tables represent
the columns outside the pipe, so `mp_column` can compare entry `k` with entry `k - 1` for every
`k` from 0 to `PIPEW`. With these tables, 17 of those 31 columns change. In each changed column,
only the rows above and below the gap need repainting. The gap continues to show the same backdrop.

The grass stripes slide too. `paint_stripes` recomputes each grass word from `x + row + frames`:
bit 2 of that sum picks the light or the dark green, which makes diagonal stripes four columns wide
that move one column per frame.

## Pictures

The bird and the digits are pictures stored as text, one character per cell. `.` leaves the
existing colour unchanged. Each other character selects a colour at the same index in
`palette_keys` and `palette`: `X` is the outline, `y` the yellow body, `w` white, `r` the red beak,
`o` orange and `l` the pale wing. `draw_art` reads a picture row by row, looks up each character
and stores its colour.

There are three bird pictures, for the wing up, level and down. `draw_bird` picks one from the
frame count, `(s11 >> 2) & 3`, with 3 shown as level: up, level, down, level, four frames each.

The bird is drawn in two steps. `erase_bird` repaints the world over the twelve rows where it was
last drawn, recorded in `shown_y`. Then `draw_bird` draws it at its new row. The Screen can refresh
while the program is drawing, so a partial update may be visible.

## The score

`draw_score` splits the score into decimal digits with `remu` and `divu`, lowest first, into
`digit_buf`, then draws them highest first, centred at the top. The digits are redrawn every frame
to restore any covered by a moving pipe. Unchanged pixels skip the store. When the number changes,
the scene is repainted under the old digits first, from one digit's width before the new left edge
to one after the new right edge.

## Frame timing

`wait_frame` targets one frame every 20 milliseconds. It stores the next frame's deadline in
`next_frame`, reads the current time with service 30, and sleeps for the remaining time. It adds
`FRAME` to the deadline for the following frame. If there is no time left to wait, it resets the
schedule from the current time.

The routine always sleeps for at least a millisecond, giving the Screen time to show the drawing.
The Screen can also refresh between sleeps. Drawing time and browser scheduling affect the actual
time between frames.

## Saved registers across calls

A value needed after a helper call cannot be left in a temporary register that the helper changes.
This program uses saved registers for those longer-lived values. The frame loop keeps input state
in `s10` and the frame count in `s11`, so every called helper must preserve them. `paint_world` and
`erase_bird` borrow `s8` and save it in their stack frames. `move_pipes` and `draw_score` borrow
both `s8` and `s9` and save both. A helper also saves `ra` when it calls another routine.

`world_column` changes `a1` to `a7`, `t0` to `t2`, `t5` and `t6`, and leaves `a0`, `t3` and `t4`
alone. That is what lets `erase_bird` and the score wipe call it in a loop with one window, and
what lets `move_pipes` call it twice for the same column with two windows.

## Try it

1. Change `FRAME` or `GRAV`. Before running the program, calculate the first three velocities,
   positions, and displayed rows for a bird starting at `STARTY` with velocity zero.
2. Change `HALFGAP` to 24. Calculate the resulting gap height and check that drawing and collision
   use the same two boundaries.
3. Remove `w` as a flap key, or replace it with another character. Space and Enter should continue
   to work.
4. Trace a pipe whose left edge is `-PIPEW - 1`. After recycling, what left edge does it receive?
   Then trace its `counted` word.
5. Change some characters of the first bird picture, for example its `r` beak into `o`. Then add a
   colour: append a key to `palette_keys` and a word to `palette`, and use the key in a picture.
6. Change `towers` or `cloud_rise` to make a different skyline.
7. Harder: make every `PIPEMID` in `body_shade` and `cap_shade` a `PIPEDARK`. Work out which
   columns now change when a pipe moves, and check the count against 17.
