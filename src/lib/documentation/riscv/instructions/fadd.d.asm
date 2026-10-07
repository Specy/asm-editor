.data
a: .double 6.0
b: .double 2.0
.text
la t0, a
fld f1, 0(t0)
la t1, b
fld f2, 0(t1)
# f1 (ft1)=6 and f2 (ft2)=2; fadd.d writes 8.
fadd.d f3, f1, f2
