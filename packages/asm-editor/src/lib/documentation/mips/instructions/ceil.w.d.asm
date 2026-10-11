.data
a: .double -1.5
.text
# Apply ceil.w.d to an initialized value; inspect $f8: raw bits 0xFFFFFFFF.
l.d $f2, a
ceil.w.d $f8, $f2
