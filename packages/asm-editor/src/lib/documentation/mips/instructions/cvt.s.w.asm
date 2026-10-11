.text
# Convert integer 7 to single precision. Inspect $f0: raw bits 0x40E00000 (7.0).
li $t0, 7
mtc1 $t0, $f2
cvt.s.w $f0, $f2
