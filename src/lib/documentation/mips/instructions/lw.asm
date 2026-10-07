.data
.align 2
word: .word 0x12345678
.text
# Load the initialized word. Inspect $t0: 0x12345678.
la $t1, word
lw $t0, 0($t1)
