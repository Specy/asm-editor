.data
a: .float -1.5
.text
# Apply round.w.s to an initialized value; inspect $f0: raw bits 0xFFFFFFFE.
l.s $f1, a
round.w.s $f0, $f1
