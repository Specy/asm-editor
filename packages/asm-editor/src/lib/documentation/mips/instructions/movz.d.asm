.data
value: .double 2.0
.text
# movz.d copies when the condition register is zero. Inspect $f2:$f3: 2.0 (raw bits 0x4000000000000000).
l.d $f4, value
li $t0, 0
movz.d $f2, $f4, $t0
