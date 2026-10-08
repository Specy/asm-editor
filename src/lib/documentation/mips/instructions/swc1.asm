.data
value: .float 0.0
source: .float 3.5
.text
# Store 3.5 into value. Inspect memory at value: 3.5 is stored as IEEE-754 raw bits 0x40600000.
l.s $f0, source
la $t0, value
swc1 $f0, 0($t0)
