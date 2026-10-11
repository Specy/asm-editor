.data
.align 2
data: .word 0x12345678, 0
.text
# Start $t0 at 0xAABBCCDD; lwl merges bytes from the unaligned word at offset 1. Inspect $t0: 0x5678CCDD.
la $t1, data
li $t0, 0xAABBCCDD
lwl $t0, 1($t1)
