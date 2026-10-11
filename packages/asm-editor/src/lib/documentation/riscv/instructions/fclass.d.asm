.data
a: .double 6.0
.text
la t0, a
fld f1, 0(t0)
# Classify positive normal 6.0; t2=64 (bit 6 marks positive normal).
fclass.d t2, f1
