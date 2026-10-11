# j transfers to a local target. Inspect $t2: it is 2 at the target.
li $t2, 0
j target
li $t2, 1
target: li $t2, 2
