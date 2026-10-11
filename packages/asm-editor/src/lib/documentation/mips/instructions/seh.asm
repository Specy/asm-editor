# Apply seh to initialized pattern 0x80FF. Inspect $t2: 0xFFFF80FF.
li $t0, 0x80FF
seh $t2, $t0
