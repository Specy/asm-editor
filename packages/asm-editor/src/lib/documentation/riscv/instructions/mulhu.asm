.text
li t0, -1
li t1, 2
# t0=0xFFFFFFFF and t1=2; the unsigned high product is 1; mulhu writes 1 to t2.
mulhu t2, t0, t1
