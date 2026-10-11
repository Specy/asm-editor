.data
.align 2
data: .byte 0xFE, 0x12, 0x34, 0x56, 0x78, 0, 0, 0
.text
# Load initialized bytes; inspect $t0: 0x00003412 (13330 from little-endian bytes 0x12,0x34).
la $t1, data
ulh $t0, 1($t1)
