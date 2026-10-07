# Subtract 1 from zero without signed-overflow trapping. Inspect $t2: 0xFFFFFFFF.
li $t0, 0
subu $t2, $t0, 1
