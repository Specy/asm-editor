.data
value: .double 2.0
.text
# movn.d copies when the condition register is nonzero. Inspect $f2:$f3: 2.0 (raw bits 0x4000000000000000).
l.d $f4, value
li $t0, 1
movn.d $f2, $f4, $t0
