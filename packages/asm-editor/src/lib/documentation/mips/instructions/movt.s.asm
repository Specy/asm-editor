.data
a: .float 1.0
b: .float 2.0
value: .float 2.0
.text
# movt.s copies only when condition flag 0 is true. Inspect $f6 receives 2.0 (raw bits 0x40000000).
l.s $f0, a
l.s $f2, b
c.lt.s $f0, $f2
l.s $f2, value
movt.s $f6, $f2, 0
