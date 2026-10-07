.data
value: .double 2.25
.text
# Apply sqrt.d to 2.25; inspect $f6:$f7 for 1.5 (raw bits 0x3FF8000000000000).
l.d $f2, value
sqrt.d $f6, $f2
