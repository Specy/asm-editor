.data
.align 2
data: .word 0x12345678, 0
.text
# Load initialized bytes; inspect $t0: 0x00123456.
la $t1, data
ulw $t0, 1($t1)
