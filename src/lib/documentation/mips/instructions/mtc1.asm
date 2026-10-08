# Copy the raw bit pattern for 1.0 into $f0. Inspect $f0: 0x3F800000.
li $t0, 0x3F800000
mtc1 $t0, $f0
