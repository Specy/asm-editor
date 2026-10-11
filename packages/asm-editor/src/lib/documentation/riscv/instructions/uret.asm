# Set uepc to the address of after, providing the return destination normally saved by a user trap. uret resumes there; inspect t1=7 after the return.
.text
la t0, after
csrw t0, uepc
uret
after:
li t1, 7
