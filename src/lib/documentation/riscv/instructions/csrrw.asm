# Initialize fcsr=0; csrrw returns old fcsr in t0 and leaves fcsr=1.
.text
li t3, 0
csrw t3, fcsr
li t1, 1
csrrw t0, fcsr, t1
