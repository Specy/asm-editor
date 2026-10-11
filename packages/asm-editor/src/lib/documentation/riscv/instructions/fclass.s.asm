.data
a: .float 6.0
.text
la t0, a
flw f1, 0(t0)
# Classify positive normal 6.0; t2=64 (bit 6 marks positive normal).
fclass.s t2, f1
