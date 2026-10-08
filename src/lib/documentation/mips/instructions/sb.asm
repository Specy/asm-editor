.data
.align 2
data: .byte 0
.text
# Write initialized value 0x12345678 with sb; inspect data bytes after the instruction: [0x78].
la $t1, data
li $t0, 0x12345678
sb $t0, 0($t1)
