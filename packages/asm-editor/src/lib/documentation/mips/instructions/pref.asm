.data
.align 2
value: .word 42
.text
# Provide a valid address as a prefetch hint; inspect memory value remains 42.
la $t0, value
pref 0, 0($t0)
