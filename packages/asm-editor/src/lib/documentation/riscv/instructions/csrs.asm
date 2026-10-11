# Initialize fcsr to 0, apply csrs with mask 1, then read fcsr into t2 (1).
.text
li t3, 0
csrw t3, fcsr
li t1, 1
csrs t1, fcsr
csrr t2, fcsr
