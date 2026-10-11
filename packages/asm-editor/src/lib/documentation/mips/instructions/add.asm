# Add two initialized values. Inspect $t2: it should contain 12.
li $t0, 7
li $t1, 5
add $t2, $t0, $t1
# Optional overflow variation: uncomment these lines before the normal completion point.
# li $t0, 0x7FFFFFFF
# li $t1, 1
# add $t2, $t0, $t1
# Expected: signed integer overflow stops execution.
