# value is initialized and naturally aligned for this operation.
.data
value: .dword 0
.text
la t0, value
li t1, 42
fcvt.d.w f1, t1
# Store 42.0 (bytes 00 00 00 00 00 00 45 40) at value; inspect Memory.
fsd f1, 0(t0)
