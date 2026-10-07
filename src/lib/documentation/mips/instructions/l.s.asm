.data
value: .float 3.5
.text
# Load the initialized value. Inspect $f0: raw bits 0x40600000.
la $t0, value
l.s $f0, 0($t0)
