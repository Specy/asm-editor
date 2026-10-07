.text
li t0, 2147483647
li t1, 1
# t0=2147483647, t1=1; addw writes -2147483648 (0xFFFFFFFF80000000) to t2.
addw t2, t0, t1
