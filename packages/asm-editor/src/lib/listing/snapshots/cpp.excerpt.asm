; Excerpt of the Listing of cpp with C++ names, whose whole text has SHA-256 9c0cbfabdc16ff5382894068d264397b38992aef48b03dc291b414d74db07ca3
main:
    endbr64
    push rbp
    mov rbp, rsp
    push r15
    push r14
    push r13
    push r12
    push rbx
    sub rsp, 0xd8
    mov rax, fs:[0x28]
    mov [rbp-0x38], rax
    xor eax, eax
    lea r12, [rbp-0x80]
    mov r13d, 0x01
    lea rbx, [rel C.1.0]
    mov [rbp-0xf8], r12
    jmp .LAB_2
.LAB_1:
    lea rax, [rbp-0xa0]
    mov [rbp-0xc0], rax
    nop
    nop
    mov rax, [rbx]
    lea rdx, [rbp-0xa0]
    mov rsi, rax
    mov rdi, [rbp-0xf8]
    call _ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEC1IS3_EEPKcRKS3_ ; std::string::basic_string<std::allocator<char>>(char const*, std::allocator<char> const&)
    sub r13, 0x01
    lea rax, [rbp-0xa0]
    mov rdi, rax
    call _ZNSt15__new_allocatorIcED1Ev  ; std::__new_allocator<char>::~__new_allocator()
    nop
    add qword [rbp-0xf8], 0x20
    add rbx, 0x08
.LAB_2:
    test r13, r13
    jns .LAB_1
    mov r13d, 0x01
    lea rax, [rbp-0x80]
    mov r14, rax
    mov r15d, 0x02
    lea rax, [rbp-0xe0]
    mov [rbp-0xb8], rax
    nop
    nop
    lea rdx, [rbp-0xe0]
    mov rsi, r14
    mov rdi, r15
    lea rax, [rbp-0xa0]
    mov rcx, rdx
    mov rdx, rdi
    mov rdi, rax
    call _ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EEC1ESt16initializer_listIS5_ERKS6_ ; std::vector<std::string>::vector(…)
    lea rax, [rbp-0xe0]
    mov rdi, rax
    call _ZNSt15__new_allocatorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEED1Ev ; std::__new_allocator<std::string>::~__new_allocator()
    nop
    lea rbx, [rbp-0x80]
    add rbx, 0x40
.LAB_3:
    lea rax, [rbp-0x80]
    cmp rbx, rax
    je .LAB_4
    sub rbx, 0x20
    mov rdi, rbx
    call _ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev ; std::string::~basic_string()
    jmp .LAB_3
.LAB_4:
    lea rax, [rbp-0xa0]
    mov [rbp-0xd8], rax
    mov rax, [rbp-0xd8]
    mov rdi, rax
    call _ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE5beginEv ; std::vector<std::string>::begin()
    mov [rbp-0xe8], rax
    mov rax, [rbp-0xd8]
    mov rdi, rax
    call _ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE3endEv ; std::vector<std::string>::end()
    mov [rbp-0xe0], rax
    jmp .LAB_6
.LAB_5:
    mov rax, [rbp-0xe8]
    mov [rbp-0xc8], rax
    mov rax, [rbp-0xc8]
    lea rdx, [rel _ZSt4cout@GLIBCXX_3.4] ; std::cout
    mov rsi, rax
    mov rdi, rdx
    call _ZStlsIcSt11char_traitsIcESaIcEERSt13basic_ostreamIT_T0_ES7_RKNSt7__cxx1112basic_stringIS4_S5_T1_EE@plt ; std::operator<<<char, std::char_traits<char>, std::allocator<char>>(…)
    mov esi, 0x0a
    mov rdi, rax
    call _ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_c@plt ; std::operator<<<std::char_traits<char>>(std::ostream&, char)
    mov rax, [rbp-0xe8]
    add rax, 0x20
    mov [rbp-0xe8], rax
    nop
.LAB_6:
    lea rax, [rbp-0xe8]
    mov [rbp-0xb0], rax
    mov rax, [rbp-0xb0]
    mov rdx, [rax]
    lea rax, [rbp-0xe0]
    mov [rbp-0xa8], rax
    mov rax, [rbp-0xa8]
    mov rax, [rax]
    cmp rdx, rax
    setne al
    test al, al
    jne .LAB_5
    mov edi, 0x10
    call __cxa_allocate_exception@plt
    mov rbx, rax
    lea rax, [rel s_caught_exception]   ; "caught exception"
    mov rsi, rax
    mov rdi, rbx
    call _ZNSt13runtime_errorC1EPKc@plt ; std::runtime_error::runtime_error(char const*)
    mov rax, [rbp-0x38]
    sub rax, fs:[0x28]
    je .LAB_7
    call __stack_chk_fail@plt
.LAB_7:
    mov rax, [rel _ZNSt13runtime_errorD1Ev@got] ; std::runtime_error::~runtime_error()
    mov rdx, rax
    lea rax, [rel _ZTISt13runtime_error@GLIBCXX_3.4] ; typeinfo for std::runtime_error
    mov rsi, rax
    mov rdi, rbx
    call __cxa_throw@plt
    endbr64
    mov rbx, rax
    lea rax, [rbp-0xa0]
    mov rdi, rax
    call _ZNSt15__new_allocatorIcED1Ev  ; std::__new_allocator<char>::~__new_allocator()
    nop
    mov r14, rbx
    jmp .LAB_9
    endbr64
    mov rbx, rax
    lea rax, [rbp-0xe0]
    mov rdi, rax
    call _ZNSt15__new_allocatorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEED1Ev ; std::__new_allocator<std::string>::~__new_allocator()
    nop
    mov r14, rbx
    lea rbx, [rbp-0x80]
    add rbx, 0x40
.LAB_8:
    lea rax, [rbp-0x80]
    cmp rbx, rax
    je .LAB_9
    sub rbx, 0x20
    mov rdi, rbx
    call _ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev ; std::string::~basic_string()
    jmp .LAB_8
.LAB_9:
    test r12, r12
    je .LAB_11
    mov eax, 0x01
    sub rax, r13
    shl rax, 0x05
    lea rbx, [r12+rax*1]
.LAB_10:
    cmp rbx, r12
    je .LAB_11
    sub rbx, 0x20
    mov rdi, rbx
    call _ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev ; std::string::~basic_string()
    jmp .LAB_10
.LAB_11:
    mov rax, r14
    mov rdx, [rbp-0x38]
    sub rdx, fs:[0x28]
    je .LAB_12
    call __stack_chk_fail@plt
.LAB_12:
    mov rdi, rax
    call _Unwind_Resume@plt
    endbr64
    mov r13, rax
    mov r12, rdx
    mov rdi, rbx
    call __cxa_free_exception@plt
    mov rax, r13
    mov rdx, r12
    jmp .LAB_13
    endbr64
.LAB_13:
    cmp rdx, 0x01
    je .LAB_14
    mov rbx, rax
    jmp .LAB_15
.LAB_14:
    mov rdi, rax
    call __cxa_begin_catch@plt
    mov [rbp-0xd0], rax
    mov rax, [rbp-0xd0]
    mov rax, [rax]
    add rax, 0x10
    mov rdx, [rax]
    mov rax, [rbp-0xd0]
    mov rdi, rax
    call rdx
    mov rdx, rax
    lea rax, [rel _ZSt4cout@GLIBCXX_3.4] ; std::cout
    mov rsi, rdx
    mov rdi, rax
    call _ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_PKc@plt ; std::operator<<<std::char_traits<char>>(std::ostream&, char const*)
    mov esi, 0x0a
    mov rdi, rax
    call _ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_c@plt ; std::operator<<<std::char_traits<char>>(std::ostream&, char)
    call __cxa_end_catch@plt
    lea rax, [rbp-0xa0]
    mov rdi, rax
    call _ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EED1Ev ; std::vector<std::string>::~vector()
    mov eax, 0x00
    mov rdx, [rbp-0x38]
    sub rdx, fs:[0x28]
    je .LAB_18
    jmp .LAB_17
    endbr64
    mov rbx, rax
    call __cxa_end_catch@plt
    jmp .LAB_15
    endbr64
    mov rbx, rax
.LAB_15:
    lea rax, [rbp-0xa0]
    mov rdi, rax
    call _ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EED1Ev ; std::vector<std::string>::~vector()
    mov rax, rbx
    mov rdx, [rbp-0x38]
    sub rdx, fs:[0x28]
    je .LAB_16
    call __stack_chk_fail@plt
.LAB_16:
    mov rdi, rax
    call _Unwind_Resume@plt
.LAB_17:
    call __stack_chk_fail@plt
.LAB_18:
    add rsp, 0xd8
    pop rbx
    pop r12
    pop r13
    pop r14
    pop r15
    pop rbp
    ret
_Znwm@plt:                              ; operator new(unsigned long)
    endbr64
    jmp qword [rel _Znwm@got]           ; operator new(unsigned long)
    nop word [rax+rax*1]
_ZTISt13runtime_error@GLIBCXX_3.4: dq 0 ; typeinfo for std::runtime_error
_ZSt17__throw_bad_allocv@got: dq _ZSt17__throw_bad_allocv@plt_resolver ; std::__throw_bad_alloc()
_ZNSt13runtime_errorC1EPKc@got: dq _ZNSt13runtime_errorC1EPKc@plt_resolver ; std::runtime_error::runtime_error(char const*)
_ZSt20__throw_length_errorPKc@got: dq _ZSt20__throw_length_errorPKc@plt_resolver ; std::__throw_length_error(char const*)
_ZSt19__throw_logic_errorPKc@got: dq _ZSt19__throw_logic_errorPKc@plt_resolver ; std::__throw_logic_error(char const*)
_ZSt28__throw_bad_array_new_lengthv@got: dq _ZSt28__throw_bad_array_new_lengthv@plt_resolver ; std::__throw_bad_array_new_length()
_ZStlsIcSt11char_traitsIcESaIcEERSt13basic_ostreamIT_T0_ES7_RKNSt7__cxx1112basic_stringIS4_S5_T1_EE@got: dq _ZStlsIcSt11char_traitsIcESaIcEERSt13basic_ostreamIT_T0_ES7_RKNSt7__cxx1112basic_stringIS4_S5_T1_EE@plt_resolver ; std::operator<<<char, std::char_traits<char>, std::allocator<char>>(…)
_ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_PKc@got: dq _ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_PKc@plt_resolver ; std::operator<<<std::char_traits<char>>(std::ostream&, char const*)
_Znwm@got: dq _Znwm@plt_resolver        ; operator new(unsigned long)
_ZdlPvm@got: dq _ZdlPvm@plt_resolver    ; operator delete(void*, unsigned long)
_ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_c@got: dq _ZStlsISt11char_traitsIcEERSt13basic_ostreamIcT_ES5_c@plt_resolver ; std::operator<<<std::char_traits<char>>(std::ostream&, char)
_ZNSt13runtime_errorD1Ev@got: dq 0      ; std::runtime_error::~runtime_error()
_ZSt4cout@GLIBCXX_3.4: resb 272         ; std::cout
