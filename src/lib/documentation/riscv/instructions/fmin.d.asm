.data
a: .double 6.0
b: .double 2.0
.text
la t0, a
fld f1, 0(t0)
la t1, b
fld f2, 0(t1)
# Choose between 6.0 and 2.0; f3 (ft3) holds 2.0.
fmin.d f3, f1, f2
