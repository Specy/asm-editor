.data
value: .byte 0xFF
.text
# Load byte 0xFF. Inspect $t0: 0xFFFFFFFF (-1) with sign extension.
la $t1, value
lb $t0, 0($t1)
