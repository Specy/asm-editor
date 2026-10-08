# This named trap is expected to stop execution when its predicate is true.
li $t0, 5
li $t1, 5
tgeu $t0, $t1
li $t2, 99 # not reached
