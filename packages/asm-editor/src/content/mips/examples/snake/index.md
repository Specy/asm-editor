A green snake moves across a 32 by 32 board. Reach the orange food to score and grow; hitting a wall
or your own body ends the game. After 64 segments, food still raises the score, but the snake cannot
grow any longer. The board turns dark red on game over.

Select **Open in editor**, then **Build** and **Run**. Click the **Screen** before typing lowercase
`w`, `a`, `s` or `d` to steer. Click it again if you return to the editor. Press **Run** again for a
new game. Each cell is one word in `display`; the `# @screen` line connects those words to the Screen.

```mips|playground|open-screen|console|no-registers|allow-open
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

# --- erase the old tail unless it grew; draw the head and food --------------
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

# place_food(): retry until the candidate is outside the occupied body.
# It calls next_random, so it saves $ra. next_random changes only $v0 and $t9.
place_food:
    addi $sp, $sp, -4
    sw $ra, 0($sp)
food_candidate:
    jal next_random
    andi $t0, $v0, LAST     # a column, 0 to 31
    sll $t0, $t0, 8
    jal next_random
    andi $t1, $v0, LAST     # a row, 0 to 31
    or $t0, $t0, $t1
    la $t1, body
    lw $t2, length
food_check:
    lw $t3, 0($t1)
    beq $t0, $t3, food_candidate
    addi $t1, $t1, 4
    addi $t2, $t2, -1
    bnez $t2, food_check
    sw $t0, food
    lw $ra, 0($sp)
    addi $sp, $sp, 4
    jr $ra

# next_random(): the next number of a 32 bit xorshift, in $v0
next_random:
    lw $v0, seed
    bnez $v0, random_step    # zero would stay zero through every xor and shift
    li $v0, 0x1F123BB5      # recover if the seed was changed to zero
random_step:
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

Follow one frame from `frame` down to the wait and jump back. It reads at most one key, shifts the
body, computes a new head, checks for a crash or food, and updates the Screen. The routines below
`game_over` do the drawing, direction check, food placement and score printing.

### Cells and movement

`body` is an array of words, one cell per segment. `body[0]` is the head, and `length` says how many
entries are occupied. Bits 8–15 hold column `x`; bits 0–7 hold row `y`. For example, `0x050C`
decodes to column `0x05` (5), row `0x0C` (12). The next two initial entries, `0x040C` and
`0x030C`, put the body immediately to its left. One packed word is enough to compare two cells with
`beq`.

The shift loop starts at `body[length - 1]` and copies each preceding entry toward the tail. If
the three entries are `[H, A, T]`, shifting produces `[H, H, A]`; writing the next head `N` at
index 0 produces `[N, H, A]`. Copying backwards preserves each source until it has been read. Before
the shift, the code saves the old tail `T` in `$s3`. It has disappeared from the occupied **body
array**, but its old cell is still coloured on the **Screen** until `erase_tail` paints it with the
background colour.

If `N` reaches food and `length` is below `MAXLEN`, the program appends saved `T`, giving
`[N, H, A, T]`, and increments `length`. `$s5` tells the drawing code to skip erasing that tail
cell. At `MAXLEN`, a meal still increases `score` and moves the food, but the body stays the same
length and the old tail is erased.

The old tail is absent from the shifted body when the `bite` loop checks for a collision. That lets
the head enter the cell the tail just vacated on a normal move. The loop compares the new head with
each remaining body entry; a match ends the game. The head's column and row are calculated
separately from the old head plus `dx` and `dy`. A direction such as `(1, 0)` moves one cell right
per frame. Wall checks happen before packing: a column of `-1` would otherwise become a large
positive bit pattern and lose its useful meaning as an out-of-bounds coordinate.

`draw_cell` turns a packed cell into a word address: `display + (y * 32 + x) * 4`. For the starting
head at `(5, 12)`, the offset is `(12 * 32 + 5) * 4 = 1556` bytes. Each word stores a colour. The
program paints all 1024 background cells once, then draws the starting snake and food. An ordinary
frame stores the background at the old tail, green at the new head, and orange at the food (the
last store usually repaints an unchanged cell). A growing frame skips the tail store, so it makes
two Screen stores. At maximum length, a meal makes all three stores again.

### Keys and food

`$s7` holds the keyboard receiver address `0xffff0000`. Each frame loads receiver control and
checks Ready bit 0. If Ready is 1, the load at `4($s7)` reads and **consumes** one waiting character.
That character can change the stored direction; the snake moves once per frame even when no key is
pressed. The keys set `(dx, dy)` to left `(-1, 0)`, right `(1, 0)`, up `(0, -1)` or down `(0, 1)`.
`try_direction` rejects a reverse turn: while moving right `(1, 0)`, pressing `a` requests
`(-1, 0)`. The sums `1 + (-1)` and `0 + 0` are both zero, so the old direction stays in place.

The first food is hand-written at `0x140C`, or `(20, 12)`. After a meal, `next_random` changes the
stored `seed` with shifts and `xor` operations. A zero seed would produce only zeros, so the routine
replaces it with the nonzero starting seed before taking the next step. This is a repeatable
sequence of numbers, not a fresh physical source of randomness. `place_food` calls it once to
choose a column and again to choose a row. After each call, `andi` with 31 keeps the coordinate in
the range 0–31. The routine then checks the packed candidate
against every occupied `body` entry. If it finds a match, it generates another pair. Since the
snake has at most 64 segments on a 1024-cell board, there are always free cells available.

The score prints to the Console after each meal and at game over. The bitmap Screen draws coloured
cells; it has no built-in service to place text, so displaying digits there would require drawing
their shapes from cells. `fill_grid` and `draw_cell` use the colour in `$s0` and the grid base in
`$s1`. `draw_cell` changes only `$t0` and `$t1`, allowing the starting-body loop to keep its pointer
in `$s2` across calls. `place_food` saves `$ra` on the stack because it calls `next_random` and must
still return to its own caller afterward.

### Try it

Change the initial `food: .word 0x140C` to `food: .word 0x080C`. Decode the new word first:
`x = 8`, `y = 12`. Build and Run. The orange cell should appear three columns to the right of
the starting head, and, with no keys pressed, the score should print `Score: 1` soon after the
snake reaches it. The next food is placed by `place_food`. Return to `0x140C` if you want the
original starting board.

For a second experiment, change only `seed: .word 0x1F123BB5`, then run the same starting board
twice. The first food remains at its hand-written location; after eating it, both runs with the
same seed place the next food in the same cell. Changing the seed changes the generated sequence.
You can steer the snake while it runs; the fixed `testcase` has no typed input, so it only exercises
the default rightward path.
