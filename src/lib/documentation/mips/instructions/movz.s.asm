.data
value: .float 2.0
.text
# movz.s copies when the condition register is zero. Inspect $f0: 2.0 (raw bits 0x40000000).
l.s $f2, value
li $t0, 0
movz.s $f0, $f2, $t0
