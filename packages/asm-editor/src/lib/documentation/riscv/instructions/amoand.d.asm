# value is initialized and naturally aligned for this operation.
.data
value: .dword 0x0000000012345678
.text
la t0, value
# Atomic operation returns the old value 305419896 in t2, then changes value to 0.
li t1, 5
amoand.d t2, t1, (t0)
