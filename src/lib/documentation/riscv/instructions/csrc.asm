# Initialize fcsr to 1, apply csrc with mask 1, then read fcsr into t2 (0).
.text
li t3, 1
csrw t3, fcsr
li t1, 1
csrc t1, fcsr
csrr t2, fcsr
