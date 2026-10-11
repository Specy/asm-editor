.data
a: .float 1.5
b: .float 2.25
.text
# add single values 1.5 and 2.25. Inspect $f0: 3.75 (raw bits 0x40700000).
l.s $f2, a
l.s $f4, b
add.s $f0, $f2, $f4
