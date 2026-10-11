# mv copies a prepared value; t0=12 and t2 shows the result.
.text
li t0, 12
# t0=12; mv copies it, so t2 becomes 12.
mv t2, t0
