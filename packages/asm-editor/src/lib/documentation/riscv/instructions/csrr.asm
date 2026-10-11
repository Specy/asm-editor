# Clear fcsr with the documented alias, then read it with csrr. t0 is 0.
.text
li t1, 0
csrw t1, fcsr
csrr t0, fcsr
