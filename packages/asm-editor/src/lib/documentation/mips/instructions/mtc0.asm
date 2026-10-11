# Write 0x1234 to CP0 vaddr register 8. Inspect CP0 $8: 0x1234.
li $t0, 0x1234
mtc0 $t0, $8
