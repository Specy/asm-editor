# Set CP0 vaddr register 8 to 0x1234, then read it. Inspect $t0: 0x1234.
li $t1, 0x1234
mtc0 $t1, $8
mfc0 $t0, $8
