# Initialize fcsr to 0; csrwi uses immediate 1 and leaves fcsr=1.
.text
li t3, 0
csrw t3, fcsr
csrwi fcsr, 1
csrr t2, fcsr
