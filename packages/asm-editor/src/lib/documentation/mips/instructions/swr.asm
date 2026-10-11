.data
.align 2
data: .word 0xAABBCCDD
.text
# Store word 0x12345678 with swr at offset 1; the initial bytes are AABBCCDD. Inspect data bytes: [0xDD, 0x78, 0x56, 0x34].
la $t1, data
li $t0, 0x12345678
swr $t0, 1($t1)
