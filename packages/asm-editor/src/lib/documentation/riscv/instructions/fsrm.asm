# Initialize frm, then use fsrm to read its old value or update it.
.text
li t3, 0
csrw t3, frm
li t0, 1
fsrm t1, t0
# t1=0 is the old value; frm becomes 1.
