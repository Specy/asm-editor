# Read back the initialized single value 1.0. Inspect $t0: 0x3F800000.
li $t1, 0x3F800000
mtc1 $t1, $f0
mfc1 $t0, $f0
