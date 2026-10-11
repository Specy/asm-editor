# Copy two initialized words into $f2:$f3. They encode double 1.5 (0x3FF8000000000000).
li $t0, 0x00000000
li $t1, 0x3FF80000
mtc1.d $t0, $f2
