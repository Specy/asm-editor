# Read the initialized HI/LO result after multiplication. Inspect $t2: 42.
li $t0, 6
li $t1, 7
mult $t0, $t1
mflo $t2
