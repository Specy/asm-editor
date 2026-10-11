# Add immediate 3 to 7. Inspect $t2: 10.
li $t0, 7
addi $t2, $t0, 3
# Optional overflow variation: uncomment these lines before the normal completion point.
# li $t0, 0x7FFFFFFF
# li $t1, 1
# addi $t2, $t0, 1
# Expected: signed integer overflow stops execution.
