# eret loads the return PC from CP0 EPC. Inspect $t2: 2 after returning to resume.
la $t0, resume
mtc0 $t0, $14
eret
li $t2, 1
resume: li $t2, 2
