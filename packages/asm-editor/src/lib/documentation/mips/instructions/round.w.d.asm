.data
a: .double -1.5
.text
# Apply round.w.d to an initialized value; inspect $f8: raw bits 0xFFFFFFFE.
l.d $f2, a
round.w.d $f8, $f2
