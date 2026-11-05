# In this simulator wait returns at once: Count counts instructions, so a loop
# around wait keeps running until an interrupt arrives. Inspect $t2: 1.
wait
li $t2, 1
