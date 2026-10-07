# Add 1 to the largest signed positive word without an overflow trap. Inspect $t2: 0x80000000.
li $t0, 0x7FFFFFFF
addu $t2, $t0, 1
