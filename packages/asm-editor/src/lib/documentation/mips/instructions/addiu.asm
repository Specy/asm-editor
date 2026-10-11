# Add immediate 1 across the signed boundary without trapping. Inspect $t2: 0x80000000.
li $t0, 0x7FFFFFFF
addiu $t2, $t0, 1
