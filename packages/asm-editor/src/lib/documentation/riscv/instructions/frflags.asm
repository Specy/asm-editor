# Initialize fflags, then use frflags to read its old value or update it.
.text
li t3, 0
csrw t3, fflags
frflags t1
# t1=0 because fflags was cleared immediately above.
