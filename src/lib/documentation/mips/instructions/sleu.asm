# Compare signed and unsigned bit patterns: $t0 is -1 (0xFFFFFFFF), $t1 is 1. Inspect $t2: 0.
li $t0, -1
li $t1, 1
sleu $t2, $t0, $t1
