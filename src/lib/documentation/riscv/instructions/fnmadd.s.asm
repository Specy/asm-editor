.data
a: .float 6.0
b: .float 2.0
.text
la t0, a
flw f1, 0(t0)
la t1, b
flw f2, 0(t1)
# Compute -((6*6)+2) in one fused operation; f3 (ft3) is -38.0.
fnmadd.s f3, f1, f1, f2
