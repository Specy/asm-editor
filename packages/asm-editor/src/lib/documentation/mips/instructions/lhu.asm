.data
.align 2
data: .half 0x8123, 0x4567, 0, 0
.text
# Load initialized bytes; inspect $t0: 0x00008123 (33059, zero extended).
la $t1, data
lhu $t0, 0($t1)
