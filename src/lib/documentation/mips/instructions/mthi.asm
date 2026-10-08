# Set the implicit HI register explicitly, then read it back. Inspect $t2: 42.
li $t0, 42
mthi $t0
mfhi $t2
