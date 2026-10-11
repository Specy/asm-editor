# value contains 1.5; flw loads that value into f1 (ft1).
.data
value: .float 1.5
.text
la t0, value
flw f1, 0(t0)
