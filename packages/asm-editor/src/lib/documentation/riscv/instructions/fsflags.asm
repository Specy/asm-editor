# Initialize fflags, then use fsflags to read its old value or update it.
.text
li t3, 0
csrw t3, fflags
li t0, 1
fsflags t1, t0
# t1=0 is the old value; fflags becomes 1.
