.data
value: .double -1.5
.text
# Apply mov.d to -1.5; inspect $f6:$f7 for -1.5 (raw bits 0xBFF8000000000000).
l.d $f4, value
mov.d $f6, $f4
