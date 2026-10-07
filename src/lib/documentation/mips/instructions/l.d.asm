.data
value: .double 3.5
.text
# Load the initialized value. Inspect $f2:$f3: double 3.5 (raw bits 0x400C000000000000).
la $t0, value
l.d $f2, 0($t0)
