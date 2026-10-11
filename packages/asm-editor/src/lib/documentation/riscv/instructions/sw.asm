# value is initialized and naturally aligned for this operation.
.data
value: .word 0
.text
la t0, value
li t1, 42
# Store 42 (bytes 2A 00 00 00) at value; inspect Memory.
sw t1, 0(t0)
