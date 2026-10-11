# Start HI:LO at zero, then accumulate 6 times 7. Inspect HI:LO: 42.
mtlo $zero
mthi $zero
li $t0, 6
li $t1, 7
madd $t0, $t1
mflo $t2
mfhi $t3
