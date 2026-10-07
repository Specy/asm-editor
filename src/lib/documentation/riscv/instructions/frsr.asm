# Initialize fcsr, then use frsr to read its old value or update it.
.text
li t3, 0
csrw t3, fcsr
frsr t1
# t1=0 because fcsr was cleared immediately above.
