# value is initialized and naturally aligned for this operation.
.data
value: .word 0x017fff80
.text
la t0, value
# The first byte is 0x80; lbu writes 128 to t2.
lbu t2, 0(t0)
