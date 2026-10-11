.data
a: .float 6.0
b: .float 2.0
.text
la t0, a
flw f1, 0(t0)
la t1, b
flw f2, 0(t1)
# Compare 6.0 with 2.0; feq.s writes 0 to t2.
feq.s t2, f1, f2
