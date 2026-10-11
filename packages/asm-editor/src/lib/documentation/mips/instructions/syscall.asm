.data
message: .asciiz "MIPS syscall example\n"
.text
# Service 4 prints the string addressed by $a0. Service 10 exits after the line. Inspect Console: MIPS syscall example, then a newline.
la $a0, message
li $v0, 4
syscall
li $v0, 10
syscall
