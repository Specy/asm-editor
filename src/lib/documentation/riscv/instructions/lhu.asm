# value is initialized and naturally aligned for this operation.
.data
value: .word 0x017fff80
.text
la t0, value
# The first halfword is 0xFF80; lhu writes 65408 to t2.
lhu t2, 0(t0)
