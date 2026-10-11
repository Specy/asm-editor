# This named trap is expected to stop execution when its predicate is true.
li $t0, 5
teqi $t0, 5
li $t2, 99 # not reached
