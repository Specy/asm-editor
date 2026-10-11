.data
.align 2
data: .word 0
.text
# Write initialized value 0x12345678 with usw; inspect data bytes after the instruction: [0x00, 0x78, 0x56, 0x34, 0x12] at offset 1.
la $t1, data
li $t0, 0x12345678
usw $t0, 1($t1)
