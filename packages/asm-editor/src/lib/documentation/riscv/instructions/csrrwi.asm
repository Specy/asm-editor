# Initialize fcsr=0; csrrwi returns old fcsr in t0 and leaves fcsr=1.
.text
li t3, 0
csrw t3, fcsr
csrrwi t0, fcsr, 1
