The whole ladder in one program. A snake of green cells crosses a board of 32 by 32, the `w`, `a`,
`s` and `d` keys steer it, it grows by one segment every time it reaches the food, and it ends when
its head leaves the board or runs into its own body. The score goes to the console as you play, and
the board turns dark red when you lose.

**Click the Screen panel before you press a key**, the same as in Move a square with the keyboard,
and press Run again to play another game.

**You need to know:** everything above it on the ladder. The body is an array walked with a pointer
and moved with a loop, the drawing and the generator are subroutines, the keyboard is polled the way
Move a square with the keyboard polls it, and only what changed is redrawn the way A bouncing ball
does it. What is new is the board kept as **cells**, one byte for the column and one for the row
packed into a word, which becomes an address only at the moment something is drawn.

```mips|playground|screen|console|no-registers|allow-open
# @screen unit=16 width=512 height=512 base=display
.eqv MMIO 0xffff0000
.eqv SIDE 32                # the board, in cells
.eqv LAST 31                # SIDE - 1
.eqv CELLS 1024             # SIDE * SIDE
.eqv MAXLEN 64
.eqv FRAME 120              # milliseconds per cell
.eqv BACKGROUND 0x00101820
.eqv SNAKE 0x0040D040
.eqv FOOD 0x00FF4000
.eqv DEAD 0x00400810

.data
display: .space 4096        # CELLS words, four bytes each
body:    .word 0x050C, 0x040C, 0x030C
         .space 244         # room for MAXLEN segments in all
length:  .word 3
dx:      .word 1            # the direction, in cells
dy:      .word 0
score:   .word 0
seed:    .word 0x1F123BB5
food:    .word 0x140C       # column 20, row 12
label:   .asciiz "Score: "
over:    .asciiz "Game over. Score: "

.text
.globl main
main:
    la $s1, display
    li $s7, MMIO
    li $s5, 0               # nothing has grown yet

    li $s0, BACKGROUND      # the board, painted once
    jal fill_grid
    li $s0, SNAKE           # and the snake it starts with
    la $s2, body
    lw $s6, length
start_body:
    lw $a0, 0($s2)
    jal draw_cell
    addi $s2, $s2, 4
    addi $s6, $s6, -1
    bnez $s6, start_body
    li $s0, FOOD
    lw $a0, food
    jal draw_cell

frame:
# --- one character, and it only ever sets the direction ----------------------
    lw $t4, 0($s7)          # the receiver control register
    andi $t4, $t4, 1        # the Ready bit
    beqz $t4, no_key
    lw $t5, 4($s7)          # the receiver data, which takes the character
    andi $t5, $t5, 0xFF
    bne $t5, 'a', not_a
    li $a0, -1
    li $a1, 0
    jal try_direction
not_a:
    bne $t5, 'd', not_d
    li $a0, 1
    li $a1, 0
    jal try_direction
not_d:
    bne $t5, 'w', not_w
    li $a0, 0
    li $a1, -1
    jal try_direction
not_w:
    bne $t5, 's', no_key
    li $a0, 0
    li $a1, 1
    jal try_direction
no_key:

# --- every segment takes the place of the one in front of it -----------------
    lw $t0, length
    sll $t0, $t0, 2
    la $t1, body
    add $t1, $t1, $t0
    addi $t1, $t1, -4       # &body[length - 1], the tail
    lw $s3, 0($t1)          # the cell the tail is leaving
    lw $t2, length
    addi $t2, $t2, -1       # length - 1 copies to make
    beqz $t2, moved
shift:
    lw $t3, -4($t1)         # body[i] = body[i - 1]
    sw $t3, 0($t1)
    addi $t1, $t1, -4
    addi $t2, $t2, -1
    bnez $t2, shift
moved:

# --- the new head, one cell on from the old one ------------------------------
    lw $t4, body            # the head, x in the high byte and y in the low
    srl $t5, $t4, 8         # x
    andi $t6, $t4, 0xFF     # y
    lw $t7, dx
    add $t5, $t5, $t7
    lw $t7, dy
    add $t6, $t6, $t7
    bltz $t5, game_over     # off the left
    bgt $t5, LAST, game_over
    bltz $t6, game_over
    bgt $t6, LAST, game_over
    sll $t5, $t5, 8
    or $s4, $t5, $t6        # the new head, packed again
    sw $s4, body

# --- did it run into itself --------------------------------------------------
    la $t1, body
    addi $t1, $t1, 4
    lw $t2, length
    addi $t2, $t2, -1
    beqz $t2, no_bite
bite:
    lw $t3, 0($t1)
    beq $t3, $s4, game_over
    addi $t1, $t1, 4
    addi $t2, $t2, -1
    bnez $t2, bite
no_bite:

# --- did it reach the food ---------------------------------------------------
    lw $t3, food
    bne $t3, $s4, no_meal
    lw $t4, score
    addi $t4, $t4, 1
    sw $t4, score
    lw $t5, length
    bge $t5, MAXLEN, no_room
    sll $t6, $t5, 2
    la $t7, body
    add $t7, $t7, $t6
    sw $s3, 0($t7)          # the tail that was leaving stays on instead
    addi $t5, $t5, 1
    sw $t5, length
    li $s5, 1               # so nothing is erased this frame
no_room:
    jal place_food
    jal print_score
no_meal:

# --- two words change on the screen, and no more ----------------------------
    beqz $s5, erase_tail
    li $s5, 0               # it grew, so the tail stays where it is
    j tail_done
erase_tail:
    li $s0, BACKGROUND
    move $a0, $s3
    jal draw_cell
tail_done:
    li $s0, SNAKE
    move $a0, $s4
    jal draw_cell
    li $s0, FOOD
    lw $a0, food
    jal draw_cell

    li $v0, 32              # a frame of program time
    li $a0, FRAME
    syscall
    j frame

game_over:
    li $s0, DEAD
    jal fill_grid
    li $v0, 4
    la $a0, over
    syscall
    li $v0, 1
    lw $a0, score
    syscall
    li $v0, 11
    li $a0, '\n'
    syscall
    li $v0, 10
    syscall

# fill_grid(): every word of the grid becomes the colour in $s0
fill_grid:
    move $t0, $s1
    li $t1, CELLS
fill_next:
    sw $s0, 0($t0)
    addi $t0, $t0, 4
    addi $t1, $t1, -1
    bnez $t1, fill_next
    jr $ra

# draw_cell(c): the packed cell in $a0, painted in the colour in $s0.
# It destroys $t0 and $t1 and nothing else.
draw_cell:
    srl $t0, $a0, 8         # x
    andi $t1, $a0, 0xFF     # y
    sll $t1, $t1, 5         # y * SIDE
    add $t0, $t0, $t1       # + x
    sll $t0, $t0, 2         # four bytes per word
    add $t0, $t0, $s1
    sw $s0, 0($t0)
    jr $ra

# try_direction(nx, ny): take the new direction unless it turns the snake back
# on itself, which would be an instant bite. It destroys $t8 and nothing else.
try_direction:
    lw $t8, dx
    add $t8, $t8, $a0
    bnez $t8, take_it
    lw $t8, dy
    add $t8, $t8, $a1
    beqz $t8, no_turn       # both zero means the new way is the opposite one
take_it:
    sw $a0, dx
    sw $a1, dy
no_turn:
    jr $ra

# place_food(): a cell out of the generator below. It calls, so it saves $ra,
# and next_random destroys only $v0 and $t9, which is why $t0 survives it.
place_food:
    addi $sp, $sp, -4
    sw $ra, 0($sp)
    jal next_random
    andi $t0, $v0, LAST     # a column, 0 to 31
    sll $t0, $t0, 8
    jal next_random
    andi $t1, $v0, LAST     # a row, 0 to 31
    or $t0, $t0, $t1
    sw $t0, food
    lw $ra, 0($sp)
    addi $sp, $sp, 4
    jr $ra

# next_random(): the next number of a 32 bit xorshift, in $v0
next_random:
    lw $v0, seed
    sll $t9, $v0, 13
    xor $v0, $v0, $t9       # x = x ^ (x << 13)
    srl $t9, $v0, 17
    xor $v0, $v0, $t9       # x = x ^ (x >> 17)
    sll $t9, $v0, 5
    xor $v0, $v0, $t9       # x = x ^ (x << 5)
    sw $v0, seed
    jr $ra

# print_score(): the label and the number, on the console
print_score:
    li $v0, 4
    la $a0, label
    syscall
    li $v0, 1
    lw $a0, score
    syscall
    li $v0, 11
    li $a0, '\n'
    syscall
    jr $ra
```

```testcase
{ "runFor": 100000 }
```

`body` is an array of words, one per segment, with the head at `body[0]`, and a segment is a cell:
`0x050C` is column 5, row 12. Packing the two into one word is what makes a comparison between two
cells a single `beq`, which the self collision test does once per segment and the food test does
once per frame.

The snake moves by shifting: every segment takes the place of the one in front of it, from the tail
backwards so that nothing is overwritten before it has been read, and then the head is given its new
cell. The tail therefore disappears from where it was without any code saying so, which is why the
cell it was in is read into `$s3` **before** the shift runs.

Growing is that same word put back. When the head reaches the food, the cell the tail was leaving is
written one place past the end of the body and `length` goes up by one, so the segment that was
about to vanish stays where it is. `$s5` then says the tail did not move this frame, and the drawing
skips the erase.

The head's new cell is the old one plus the direction, and `dx` and `dy` are counted in cells, so
they are 1, 0 or -1. The four wall tests run on `$t5` and `$t6` while they are still separate
numbers, because a column of -1 packed back into a byte is 255 and no test after the `sll` could
tell the two apart.

The keys do not move the snake, they call `try_direction`, and it refuses a direction that is the
exact opposite of the one the snake is going: `dx + nx` and `dy + ny` are both zero only when the
new way is backwards, and turning back means eating your own neck on the next frame.

The food goes wherever a 32 bit **xorshift** generator says. Three shifts and three `xor`
instructions turn a number into the next one of a sequence, which is as random as a program with no
clock and no dice can be. Both coordinates are `andi` with 31, since 32 is a power of two and the
low five bits of any number are already a column.

Three `sw` instructions reach the screen in a frame and two of them change anything: the cell the
tail left, the cell the head arrived in, and the food, which is repainted whether it moved or not.
The M68K version of this game redraws every segment of the snake into an off screen image and shows
the whole image at once, because that machine has a task for drawing off screen; the bitmap display
is the picture itself, so the cheapest correct frame is the one that writes the fewest words. A
frame here is about 120 instructions, where clearing the board and redrawing everything would be
four thousand.

The score is printed to the console, and it is printed there because there is nowhere else to put
it. The M68K draws it onto the screen with a task that puts text at a pixel position; the bitmap
display has no text of any kind. Apart from the wait that paces a frame, every `syscall` in this
program is printing or the exit at the end.

`fill_grid` and `draw_cell` both read the colour out of `$s0` and the base of the grid out of `$s1`,
and `draw_cell` promises to destroy `$t0` and `$t1` and nothing else, which is what lets the loop
that draws the starting body keep its pointer in `$s2` and the caller keep the head in `$s4`. Those
comments above the labels are the whole of the agreement, and this program has four of them.

With nobody typing, the snake runs straight to the right, eats the food on the way, and hits the
wall 26 frames later, and the red board and the console line are done by about 11500 instructions.
That is the game the verification run plays. The `runFor` of 100000 is the budget the Playground
gets before it stops; a game you are playing ends when you make it end.

Try changing `seed: .word 0x1F123BB5` to `0x2545F491`. The first food is written into the data
section and does not move, but the one after it falls at column 26 of row 11 instead of column 7 of
row 8. The sequence is fixed by where it starts, so the same program run twice gives the same game
twice, which is what makes a program with a generator like this one debuggable at all.
