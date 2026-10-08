.data
.align 2
data: .word 0x12345678, 0
.text
# Start $t0 at 0xAABBCCDD; lwr merges bytes from the unaligned word at offset 1. Inspect $t0: 0xAA123456.
la $t1, data
li $t0, 0xAABBCCDD
lwr $t0, 1($t1)
