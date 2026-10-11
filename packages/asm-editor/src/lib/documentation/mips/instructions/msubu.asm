# Start accumulator at 100, then subtract 6 times 7. Inspect LO: 58.
li $t0, 100
mtlo $t0
mthi $zero
li $t0, 6
li $t1, 7
msubu $t0, $t1
mflo $t2
