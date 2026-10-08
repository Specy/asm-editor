.data
a: .float 6.0
b: .float 2.0
.text
la t0, a
flw f1, 0(t0)
la t1, b
flw f2, 0(t1)
# Copy magnitude 6.0 and combine its sign with -2.0; f3 (ft3) becomes 6.0.
fneg.s f2, f2
fsgnjn.s f3, f1, f2
