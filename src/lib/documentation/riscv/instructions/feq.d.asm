.data
a: .double 6.0
b: .double 2.0
.text
la t0, a
fld f1, 0(t0)
la t1, b
fld f2, 0(t1)
# Compare 6.0 with 2.0; feq.d writes 0 to t2.
feq.d t2, f1, f2
