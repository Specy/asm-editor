# Multiply 6 by 7. Inspect HI:LO: 42 (HI=0, LO=42).
li $t0, 6
li $t1, 7
multu $t0, $t1
mflo $t2
mfhi $t3
