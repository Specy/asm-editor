.data
a: .float -1.5
.text
# Apply floor.w.s to an initialized value; inspect $f0: raw bits 0xFFFFFFFE.
l.s $f1, a
floor.w.s $f0, $f1
