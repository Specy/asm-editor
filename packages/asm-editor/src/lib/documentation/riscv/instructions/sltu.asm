.text
li t0, -1
li t1, 1
# t0=0xFFFFFFFF is unsigned-greater than t1=1; sltu writes 0 to t2.
sltu t2, t0, t1
