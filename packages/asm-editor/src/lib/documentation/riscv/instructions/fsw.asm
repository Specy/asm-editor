# value is initialized and naturally aligned for this operation.
.data
value: .word 0
.text
la t0, value
li t1, 42
fcvt.s.w f1, t1
# Store 42.0 (bytes 00 00 28 42) at value; inspect Memory.
fsw f1, 0(t0)
