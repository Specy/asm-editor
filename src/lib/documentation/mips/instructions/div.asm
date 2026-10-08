# Divide 23 by 5. Inspect LO: quotient 4; inspect HI: remainder 3.
li $t0, 23
li $t1, 5
div $t0, $t1
mflo $t2
mfhi $t3
