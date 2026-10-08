# Copy 1.0 from f1 (ft1) to f2 (ft2) with fmv.d.
.data
one: .double 1.0
.text
la t0, one
fld f1, 0(t0)
fmv.d f2, f1
