# value is initialized and naturally aligned for this operation.
.data
value: .dword 0x0000000012345678
.text
la t0, value
# The initialized doubleword is 0x12345678; ld writes 305419896 to t2.
ld t2, 0(t0)
