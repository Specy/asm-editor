.data
.align 2
value: .word 0
.text
# Reserve value with ll, then store 0x12345678 conditionally. Inspect $t0: 1 means success; memory contains 0x12345678.
la $t1, value
ll $t3, 0($t1)
li $t0, 0x12345678
sc $t0, 0($t1)
