# Initialize fcsr to 1; csrci uses immediate 1 and leaves fcsr=0.
.text
li t3, 1
csrw t3, fcsr
csrci fcsr, 1
csrr t2, fcsr
