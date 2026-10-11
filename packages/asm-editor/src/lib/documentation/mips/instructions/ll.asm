.data
.align 2
data: .word 0x12345678, 0
.text
# Load initialized bytes; inspect $t0: 0x12345678.
la $t1, data
ll $t0, 0($t1)
