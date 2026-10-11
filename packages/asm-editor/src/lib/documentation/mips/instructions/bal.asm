# bal transfers control to the nearby label. Inspect $t2: it is 2 after the target runs.
li $t2, 0
bal taken
li $t2, 1
taken: li $t2, 2
