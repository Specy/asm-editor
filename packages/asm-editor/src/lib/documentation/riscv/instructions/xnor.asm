.text
li t0, 13
li t1, 5
# t0=13, t1=5; xnor writes -9 (0xFFFFFFF7) to t2.
xnor t2, t0, t1
