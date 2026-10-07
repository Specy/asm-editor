.data
value: .double -1.5
.text
# Convert double -1.5 to single. Inspect $f0: -1.5 (raw bits 0xBFC00000).
l.d $f2, value
cvt.s.d $f0, $f2
