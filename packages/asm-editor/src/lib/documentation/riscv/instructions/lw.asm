# value is initialized and naturally aligned for this operation.
.data
value: .word 0x817fff80
.text
la t0, value
# The word 0x817FFF80 sign-extends in RV64; lw writes −2122317952 (0xFFFFFFFF817FFF80) to t2.
lw t2, 0(t0)
