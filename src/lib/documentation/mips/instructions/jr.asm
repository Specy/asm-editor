# Return through an explicitly initialized register. Inspect $t2: it is 2 at the target.
la $t0, target
jr $t0
li $t2, 1
target: li $t2, 2
