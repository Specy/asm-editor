.data
.align 2
data: .half 0x8123, 0x4567, 0, 0
.text
# Load initialized bytes; inspect $t0: 0xFFFF8123 (-32477, sign extended).
la $t1, data
lh $t0, 0($t1)
