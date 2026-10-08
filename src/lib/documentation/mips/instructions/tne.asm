# tne stops with a trap when its initialized predicate is true; $t2=99 is never reached.
li $t0, 5
li $t1, 6
tne $t0, $t1
li $t2, 99 # not reached
