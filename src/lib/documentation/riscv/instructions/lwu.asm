# value is initialized and naturally aligned for this operation.
.data
value: .word 0x817fff80
.text
la t0, value
# The word 0x817FFF80 zero-extends to RV64; lwu writes 2172649344 (0x817FFF80) to t2.
lwu t2, 0(t0)
