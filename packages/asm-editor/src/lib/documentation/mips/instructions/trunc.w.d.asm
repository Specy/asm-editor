.data
a: .double -1.5
.text
# Apply trunc.w.d to an initialized value; inspect $f8: raw bits 0xFFFFFFFF.
l.d $f2, a
trunc.w.d $f8, $f2
