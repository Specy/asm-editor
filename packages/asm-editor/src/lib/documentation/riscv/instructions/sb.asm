# value is initialized and naturally aligned for this operation.
.data
value: .word 0
.text
la t0, value
li t1, 42
# Store 42 (byte 2A) at value; inspect Memory.
sb t1, 0(t0)
