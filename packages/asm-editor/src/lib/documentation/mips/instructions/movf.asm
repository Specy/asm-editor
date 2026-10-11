.data
a: .float 1.0
b: .float 2.0
.text
# movf reads condition flag 0; set it false, then inspect $t2: 7 after the conditional copy.
l.s $f0, a
l.s $f2, b
c.lt.s $f2, $f0
li $t1, 7
li $t2, 0
movf $t2, $t1, 0
