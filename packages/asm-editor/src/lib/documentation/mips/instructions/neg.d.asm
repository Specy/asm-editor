.data
value: .double -1.5
.text
# Apply neg.d to -1.5; inspect $f6:$f7 for 1.5 (raw bits 0x3FF8000000000000).
l.d $f2, value
neg.d $f6, $f2
