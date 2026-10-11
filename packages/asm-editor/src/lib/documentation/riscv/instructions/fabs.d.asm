.data
a: .double 6.0
.text
la t0, a
fld f1, 0(t0)
# f1 (ft1)=6; result in f3 (ft3) is 6.
fabs.d f3, f1
