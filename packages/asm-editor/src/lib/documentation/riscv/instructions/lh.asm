# value is initialized and naturally aligned for this operation.
.data
value: .word 0x017fff80
.text
la t0, value
# The first halfword is 0xFF80; lh writes −128 (0xFFFFFF80) to t2.
lh t2, 0(t0)
