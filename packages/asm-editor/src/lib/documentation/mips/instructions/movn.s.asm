.data
value: .float 2.0
.text
# movn.s copies when the condition register is nonzero. Inspect $f0: 2.0 (raw bits 0x40000000).
l.s $f2, value
li $t0, 1
movn.s $f0, $f2, $t0
