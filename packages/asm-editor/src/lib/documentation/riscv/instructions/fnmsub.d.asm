.data
a: .double 6.0
b: .double 2.0
.text
la t0, a
fld f1, 0(t0)
la t1, b
fld f2, 0(t1)
# Compute -((6*6)-2) in one fused operation; f3 (ft3) is -34.0.
fnmsub.d f3, f1, f1, f2
