.data
a: .float 1.5
b: .float 2.25
.text
# mul single values 1.5 and 2.25. Inspect $f0: 3.375 (raw bits 0x40580000).
l.s $f2, a
l.s $f4, b
mul.s $f0, $f2, $f4
