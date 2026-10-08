.data
a: .float 6.0
b: .float 2.0
.text
la t0, a
flw f1, 0(t0)
la t1, b
flw f2, 0(t1)
# f1 (ft1)=6 and f2 (ft2)=2; fdiv.s writes 3.
fdiv.s f3, f1, f2
