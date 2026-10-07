# Initialize fcsr, then use frcsr to read its old value or update it.
.text
li t3, 0
csrw t3, fcsr
frcsr t1
# t1=0 because fcsr was cleared immediately above.
