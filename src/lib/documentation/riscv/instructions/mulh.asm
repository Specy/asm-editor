.text
li t0, -2147483648
li t1, 2
# t0=-2147483648 and t1=2; the high product is -1; mulh writes -1 (0xFFFFFFFF) to t2.
mulh t2, t0, t1
