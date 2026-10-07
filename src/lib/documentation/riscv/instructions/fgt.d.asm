.data
a: .double 6.0
b: .double 2.0
.text
la t0, a
fld f1, 0(t0)
la t1, b
fld f2, 0(t1)
# Compare 6.0 with 2.0; fgt.d writes 1 to t2.
fgt.d t2, f1, f2
