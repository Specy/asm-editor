# Set the implicit LO register explicitly, then read it back. Inspect $t2: 42.
li $t0, 42
mtlo $t0
mflo $t2
