.data
a: .float -1.5
.text
# Apply ceil.w.s to an initialized value; inspect $f0: raw bits 0xFFFFFFFF.
l.s $f1, a
ceil.w.s $f0, $f1
