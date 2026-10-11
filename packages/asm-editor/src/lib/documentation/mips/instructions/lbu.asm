.data
value: .byte 0xFF
.text
# Load byte 0xFF. Inspect $t0: 255 with zero extension.
la $t1, value
lbu $t0, 0($t1)
