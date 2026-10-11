.data
a: .float 1.5
b: .float 2.25
.text
# sub single values 1.5 and 2.25. Inspect $f0: -0.75 (raw bits 0xBF400000).
l.s $f2, a
l.s $f4, b
sub.s $f0, $f2, $f4
