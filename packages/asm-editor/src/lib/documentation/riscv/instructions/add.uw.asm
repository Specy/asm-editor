.text
li t0, -2147483647
li t1, 1
# t0=0xFFFFFFFF80000001 is treated as an unsigned low word, then t1=1 is added; add.uw writes 2147483650 to t2.
add.uw t2, t0, t1
