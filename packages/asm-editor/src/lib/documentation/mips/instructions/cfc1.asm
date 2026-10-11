# Set the FPU control/status register to zero, then read it with cfc1. Inspect $t0: 0.
li $t1, 0
ctc1 $t1, $f31
cfc1 $t0, $f31
