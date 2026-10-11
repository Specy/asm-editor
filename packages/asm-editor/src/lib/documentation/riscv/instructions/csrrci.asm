# Initialize fcsr=1; csrrci returns old fcsr in t0 and leaves fcsr=0.
.text
li t3, 1
csrw t3, fcsr
csrrci t0, fcsr, 1
