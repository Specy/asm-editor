# Initialize fcsr, then use fssr to read its old value or update it.
.text
li t3, 0
csrw t3, fcsr
li t0, 1
fssr t1, t0
# t1=0 is the old value; fcsr becomes 1.
