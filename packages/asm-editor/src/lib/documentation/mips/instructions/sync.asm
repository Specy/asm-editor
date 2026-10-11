.data
.align 2
value: .word 0
.text
# Store 7, execute sync, then read value back. Inspect $t1: 7; memory still contains the little-endian bytes 07 00 00 00.
la $t2, value
li $t0, 7
sw $t0, 0($t2)
sync
lw $t1, 0($t2)
