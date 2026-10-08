.data
.align 2
data: .word 0x12345678, 0
.text
# Load initialized bytes; inspect $t0: 0x12345678 and $t1: 0.
la $t1, data
ld $t0, 0($t1)
