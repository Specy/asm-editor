.data
a: .float 6.0
b: .float 2.0
.text
la t0, a
flw f1, 0(t0)
la t1, b
flw f2, 0(t1)
# Choose between 6.0 and 2.0; f3 (ft3) holds 6.0.
fmax.s f3, f1, f2
