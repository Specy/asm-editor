# Read the initialized double register pair $f2:$f3. Inspect $t0=0 and $t1=0x3FF80000 for 1.5.
li $t0, 0x00000000
li $t1, 0x3FF80000
mtc1.d $t0, $f2
mfc1.d $t0, $f2
