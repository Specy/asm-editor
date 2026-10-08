# value is initialized and naturally aligned for this operation.
.data
value: .dword 0x0000000012345678
.text
la t0, value
# Reserve the aligned doubleword at value; t2 receives 305419896.
lr.d t2, (t0)
