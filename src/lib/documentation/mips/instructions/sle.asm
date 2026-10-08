# Compare signed and unsigned bit patterns: $t0 is -1 (0xFFFFFFFF), $t1 is 1. Inspect $t2: 1.
li $t0, -1
li $t1, 1
sle $t2, $t0, $t1
