.data
.align 2
data: .half 0
.text
# Write initialized value 0x12345678 with sh; inspect data bytes after the instruction: [0x78, 0x56].
la $t1, data
li $t0, 0x12345678
sh $t0, 0($t1)
