.data
.align 2
data: .half 0
.text
# Write initialized value 0x12345678 with ush; inspect data bytes after the instruction: [0x00, 0x78, 0x56] at offset 1.
la $t1, data
li $t0, 0x12345678
ush $t0, 1($t1)
