.data
a: .double 6.0
b: .double 2.0
.text
la t0, a
fld f1, 0(t0)
la t1, b
fld f2, 0(t1)
# Copy magnitude 6.0 and combine its sign with -2.0; f3 (ft3) becomes -6.0.
fneg.d f2, f2
fsgnjx.d f3, f1, f2
