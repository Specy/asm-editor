.data
value: .double 0.0
source: .double 3.5
.text
# Store 3.5 into value. Inspect memory at value: 3.5 is stored as IEEE-754 raw bits 0x400C000000000000.
l.d $f2, source
la $t0, value
sdc1 $f2, 0($t0)
