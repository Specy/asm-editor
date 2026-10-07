.data
value: .word 42
.text
# Form value's address. Inspect $t0: the initialized data begins at 0x10010000.
la $t0, value
