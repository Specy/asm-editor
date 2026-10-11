# la writes 0x10010000 to t0 (marker is at data address 0x10010000).
.data
marker: .word 17
.text
la t0, marker
