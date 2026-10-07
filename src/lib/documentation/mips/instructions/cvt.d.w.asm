.text
# Convert integer 7 to double. Inspect $f2:$f3: 7.0 (raw bits 0x401C000000000000).
li $t0, 7
mtc1 $t0, $f4
cvt.d.w $f2, $f4
