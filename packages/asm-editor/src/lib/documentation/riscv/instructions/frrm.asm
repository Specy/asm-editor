# Initialize frm, then use frrm to read its old value or update it.
.text
li t3, 0
csrw t3, frm
frrm t1
# t1=0 because frm was cleared immediately above.
