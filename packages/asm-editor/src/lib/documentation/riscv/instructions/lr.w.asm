# value is initialized and naturally aligned for this operation.
.data
value: .word 0x12345678
.text
la t0, value
# Reserve the aligned word at value; t2 receives 305419896.
lr.w t2, (t0)
