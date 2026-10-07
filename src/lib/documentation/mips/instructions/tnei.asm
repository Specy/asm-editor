# tnei stops with a trap when its initialized predicate is true; $t2=99 is never reached.
li $t0, 5
tnei $t0, 4
li $t2, 99 # not reached
