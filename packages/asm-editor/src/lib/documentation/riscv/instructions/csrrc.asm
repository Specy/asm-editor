# Initialize fcsr=1; csrrc returns old fcsr in t0 and leaves fcsr=0.
.text
li t3, 1
csrw t3, fcsr
li t1, 1
csrrc t0, fcsr, t1
