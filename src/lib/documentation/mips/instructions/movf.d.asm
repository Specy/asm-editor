.data
a: .float 1.0
b: .float 2.0
value: .double 2.0
.text
# movf.d copies only when condition flag 0 is false. Inspect $f6:$f7 remain 0 because flag 0 is true.
l.s $f0, a
l.s $f2, b
c.lt.s $f0, $f2
l.d $f4, value
movf.d $f6, $f4, 0
