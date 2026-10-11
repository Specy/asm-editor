# value contains 1.5; fld loads that value into f1 (ft1).
.data
value: .double 1.5
.text
la t0, value
fld f1, 0(t0)
