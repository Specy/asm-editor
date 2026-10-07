.data
a: .float 1.0
b: .float 2.0
value: .float 2.0
.text
# movf.s copies only when condition flag 0 is false. Inspect $f6 remains 0 because flag 0 is true.
l.s $f0, a
l.s $f2, b
c.lt.s $f0, $f2
l.s $f2, value
movf.s $f6, $f2, 0
