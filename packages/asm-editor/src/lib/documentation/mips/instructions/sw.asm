.data
.align 2
data: .word 0
.text
# Write initialized value 0x12345678 with sw; inspect data bytes after the instruction: [0x78, 0x56, 0x34, 0x12].
la $t1, data
li $t0, 0x12345678
sw $t0, 0($t1)
