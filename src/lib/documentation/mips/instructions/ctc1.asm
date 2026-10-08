# Set FPU control/status to zero and read it back. Inspect $t1: 0.
li $t0, 0
ctc1 $t0, $f31
cfc1 $t1, $f31
