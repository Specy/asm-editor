.data
.align 3
data: .word 0, 0
.text
# sd stores a two-register value. Initialize $t0/$t1 as 0x12345678:0x55667788; inspect bytes: 88 77 66 55 78 56 34 12.
la $t2, data
li $t0, 0x55667788
li $t1, 0x12345678
sd $t0, 0($t2)
