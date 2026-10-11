.data
a: .float 1.0
b: .float 2.0
value: .double 2.0
.text
# movt.d copies only when condition flag 0 is true. Inspect $f6:$f7 receive 2.0 (raw bits 0x4000000000000000).
l.s $f0, a
l.s $f2, b
c.lt.s $f0, $f2
l.d $f4, value
movt.d $f6, $f4, 0
