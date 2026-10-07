.data
.align 2
data: .word 0xAABBCCDD
.text
# Store word 0x12345678 with swl at offset 1; the initial bytes are AABBCCDD. Inspect data bytes: [0x34, 0x12, 0xBB, 0xAA].
la $t1, data
li $t0, 0x12345678
swl $t0, 1($t1)
