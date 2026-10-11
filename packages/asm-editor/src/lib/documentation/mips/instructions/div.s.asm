.data
a: .float 1.5
b: .float 2.25
.text
# div single values 1.5 and 2.25. Inspect $f0: 0.6666667 (raw bits 0x3F2AAAAB).
l.s $f2, a
l.s $f4, b
div.s $f0, $f2, $f4
