import type monaco from 'monaco-editor'

export const X86Registers = [// General Purpose 32-bit
    'eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp',
    // General Purpose 16-bit
    'ax', 'bx', 'cx', 'dx', 'si', 'di', 'bp', 'sp',
    // General Purpose 8-bit High
    'ah', 'bh', 'ch', 'dh',
    // General Purpose 8-bit Low (with REX prefix)
    'sil', 'dil', 'bpl', 'spl', 'r8b', 'r9b', 'r10b', 'r11b', 'r12b', 'r13b', 'r14b', 'r15b',
    // General Purpose 8-bit Low (no REX prefix)
    'al', 'bl', 'cl', 'dl',
    // Segment Registers
    'cs', 'ds', 'ss', 'es', 'fs', 'gs',
    // Flags Register
    'eflags', 'rflags', 'flags',
    // Instruction Pointer
    'eip', 'rip', 'ip',
    // Control Registers
    'cr0', 'cr1', 'cr2', 'cr3', 'cr4', 'cr5', 'cr6', 'cr7', 'cr8',
    // Debug Registers
    'dr0', 'dr1', 'dr2', 'dr3', 'dr4', 'dr5', 'dr6', 'dr7',
    // MMX Registers
    'mm0', 'mm1', 'mm2', 'mm3', 'mm4', 'mm5', 'mm6', 'mm7',
    // XMM Registers (SSE/AVX)
    'xmm0', 'xmm1', 'xmm2', 'xmm3', 'xmm4', 'xmm5', 'xmm6', 'xmm7',
    'xmm8', 'xmm9', 'xmm10', 'xmm11', 'xmm12', 'xmm13', 'xmm14', 'xmm15',
    'xmm16', 'xmm17', 'xmm18', 'xmm19', 'xmm20', 'xmm21', 'xmm22', 'xmm23',
    'xmm24', 'xmm25', 'xmm26', 'xmm27', 'xmm28', 'xmm29', 'xmm30', 'xmm31',
    // YMM Registers (AVX)
    'ymm0', 'ymm1', 'ymm2', 'ymm3', 'ymm4', 'ymm5', 'ymm6', 'ymm7',
    'ymm8', 'ymm9', 'ymm10', 'ymm11', 'ymm12', 'ymm13', 'ymm14', 'ymm15',
    'ymm16', 'ymm17', 'ymm18', 'ymm19', 'ymm20', 'ymm21', 'ymm22', 'ymm23',
    'ymm24', 'ymm25', 'ymm26', 'ymm27', 'ymm28', 'ymm29', 'ymm30', 'ymm31',
    // ZMM Registers (AVX512)
    'zmm0', 'zmm1', 'zmm2', 'zmm3', 'zmm4', 'zmm5', 'zmm6', 'zmm7',
    'zmm8', 'zmm9', 'zmm10', 'zmm11', 'zmm12', 'zmm13', 'zmm14', 'zmm15',
    'zmm16', 'zmm17', 'zmm18', 'zmm19', 'zmm20', 'zmm21', 'zmm22', 'zmm23',
    'zmm24', 'zmm25', 'zmm26', 'zmm27', 'zmm28', 'zmm29', 'zmm30', 'zmm31',
    // Mask registers (AVX512)
    'k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']

export const X86Instructions = [
    'aaa', 'aad', 'aam', 'aas', 'adc', 'add', 'and', 'arpl', 'bound',
    'bsf', 'bsr', 'bswap', 'bt', 'btc', 'btr', 'bts', 'call', 'cbw',
    'cdq', 'cdqe', 'clc', 'cld', 'cli', 'clts', 'cmc', 'cmp', 'cmps',
    'cmpsb', 'cmpsd', 'cmpsq', 'cmpsw', 'cmpxchg', 'cmpxchg8b', 'cmpxchg16b',
    'cpuid', 'cqo', 'cwd', 'cwde', 'daa', 'das', 'dec', 'div', 'emms',
    'enter', 'fwait', 'hlt', 'idiv', 'imul', 'in', 'inc', 'ins', 'insb',
    'insd', 'insw', 'int', 'int3', 'into', 'invd', 'invlpg', 'iret',
    'iretd', 'iretq', 'ja', 'jae', 'jb', 'jbe', 'jc', 'jcxz', 'je',
    'jecxz', 'jg', 'jge', 'jl', 'jle', 'jmp', 'jna', 'jnae', 'jnb',
    'jnbe', 'jnc', 'jne', 'jng', 'jnge', 'jnl', 'jnle', 'jno', 'jnp',
    'jns', 'jnz', 'jo', 'jp', 'jpe', 'jpo', 'jrcxz', 'js', 'jz',
    'lahf', 'lar', 'lds', 'lea', 'leave', 'les', 'lfs', 'lgdt', 'lgs',
    'lidt', 'lldt', 'lmsw', 'lock', 'lods', 'lodsb', 'lodsd', 'lodsq',
    'lodsw', 'loop', 'loope', 'loopne', 'loopnz', 'loopz', 'lsl', 'lss',
    'ltr', 'mov', 'movbe', 'movd', 'movq', 'movs', 'movsb', 'movsd',
    'movsq', 'movsw', 'movsx', 'movsxd', 'movzx', 'mul', 'neg', 'nop',
    'not', 'or', 'out', 'outs', 'outsb', 'outsd', 'outsw', 'pop', 'popa',
    'popad', 'popcnt', 'popf', 'popfd', 'popfq', 'push', 'pusha',
    'pushad', 'pushf', 'pushfd', 'pushfq', 'rcl', 'rcr', 'rdmsr', 'rdpmc',
    'rdtsc', 'rdtscp', 'rep', 'repe', 'repne', 'repnz', 'repz', 'ret',
    'retf', 'retn', 'rol', 'ror', 'rsm', 'sahf', 'sal', 'sar', 'sbb',
    'scas', 'scasb', 'scasd', 'scasw', 'seta', 'setae', 'setb', 'setbe',
    'setc', 'sete', 'setg', 'setge', 'setl', 'setle', 'setna', 'setnae',
    'setnb', 'setnbe', 'setnc', 'setne', 'setng', 'setnge', 'setnl',
    'setnle', 'setno', 'setnp', 'setns', 'setnz', 'seto', 'setp', 'setpe',
    'setpo', 'sets', 'setz', 'sgdt', 'shl', 'shld', 'shr', 'shrd', 'sidt',
    'sldt', 'smsw', 'stc', 'std', 'sti', 'stos', 'stosb', 'stosd', 'stosq',
    'stosw', 'str', 'sub', 'swapgs', 'syscall', 'sysenter', 'sysexit',
    'sysret', 'test', 'tzcnt', 'ud2', 'verr', 'verw', 'wait', 'wbinvd',
    'wrmsr', 'xadd', 'xchg', 'xlat', 'xlatb', 'xor',
    // FPU Instructions (partial)
    'fld', 'fild', 'fldcw', 'fldenv', 'fst', 'fstp', 'fist', 'fistp',
    'fadd', 'fsub', 'fmul', 'fdiv', 'fcom', 'fcomp', 'fcompp', 'fxch',
    'fsqrt', 'fabs', 'fchs', 'fsin', 'fcos', 'fptan', 'fpatan', 'fprem',
    'fincstp', 'fdecstp', 'ftst', 'fxam', 'fwait', 'fnop', 'fclex', 'fnclex',
    'fstcw', 'fnstcw', 'fstenv', 'fnstenv', 'fstsw', 'fnstsw', 'fsave', 'fnsave',
    'frstor',
    // SSE/AVX Instructions (very partial list - add many more if needed)
    'movaps', 'movups', 'movss', 'movsd', 'movdqa', 'movdqu', 'movntps', 'movntpd',
    'addps', 'addss', 'subps', 'subss', 'mulps', 'mulss', 'divps', 'divss',
    'sqrtps', 'sqrtss', 'rcpps', 'rcpss', 'rsqrtps', 'rsqrtss',
    'maxps', 'maxss', 'minps', 'minss', 'andps', 'andnps', 'orps', 'xorps',
    'cmpps', 'cmpss', 'shufps', 'unpcklps', 'unpckhps', 'pavgb', 'pavgw',
    'pextrw', 'pinsrw', 'pmaxub', 'pmaxsw', 'pminub', 'pminsw', 'pmovmskb',
    'pmulhuw', 'psadbw', 'pshufw', 'pshufd', 'pshuflw', 'pshufhw',
    'paddb', 'paddw', 'paddd', 'paddq', 'psubb', 'psubw', 'psubd', 'psubq',
    'pmullw', 'pmuludq', 'pand', 'pandn', 'por', 'pxor', 'packsswb', 'packssdw',
    'packuswb', 'punpcklbw', 'punpcklwd', 'punpckldq', 'punpckhbw', 'punpckhwd',
    'punpckhdq', 'pcmpeqb', 'pcmpeqw', 'pcmpeqd', 'pcmpgtb', 'pcmpgtw', 'pcmpgtd',
    'psrld', 'psrlq', 'psrlw', 'pslld', 'psllq', 'psllw', 'psrad', 'psraw',
    'vmovaps', 'vaddps', 'vmulps', 'vsqrtps', 'vfmadd132ps', 'vfmadd213ps', 'vfmadd231ps'
    // ... many many more AVX/AVX2/AVX512 ...
]

export const X86Directives = [
    'section', 'segment', 'global', 'extern', 'bits', 'use16', 'use32', 'use64',
    'db', 'dw', 'dd', 'dq', 'dt', 'do', 'dy', 'dz', // Define Bytes/Words/...
    'resb', 'resw', 'resd', 'resq', 'rest', 'reso', 'resy', 'resz', // Reserve space
    'incbin', // Include binary file
    'equ', // Define constant
    'times', // Repeat instruction/data
    'align', 'alignb', // Align
    'struc', 'endstruc', 'istruc', 'iend', // Structures
    'macro', 'endmacro', 'irp', 'irpc', 'exitmacro', // Macros
    '%define', '%idefine', '%xdefine', '%assign', '%iassign', // Preprocessor defines (NASM)
    '%undef', '%ifdef', '%ifndef', '%elifdef', '%elifndef', '%else', '%endif', // Preprocessor conditional (NASM)
    '%if', '%elif', '%ifidn', '%ifidni', '%ifmacro', '%ifnum', '%ifstr', // Preprocessor conditional (NASM)
    '%error', '%warning', '%fatal', // Preprocessor messages (NASM)
    '%include', '%pathsearch', '%depend', '%use', // Preprocessor include/use (NASM)
    '%push', '%pop', '%repl', // Preprocessor context (NASM)
    '%arg', '%stacksize', '%local', // Preprocessor macro related (NASM)
    'proc', 'endp', // Procedures (MASM style)
    'assume', // MASM directive
    'org', // Origin
    'ptr' // Often used with size specifiers
    // Add other common directives like PUBLIC, EXTRN (MASM) if needed
]

export const X86SizeSpecifiers = [
    'byte', 'word', 'dword', 'qword', 'tbyte', 'tword', 'oword', 'yword', 'zword',
    'near', 'far', 'short'
]

export const X86Language: monaco.languages.IMonarchLanguage = {
    ignoreCase: true,

    // Common Registers (add more as needed)
    registers: X86Registers,

    // Common Instructions (expand significantly for full coverage)
    instructions: X86Instructions,

    // Assembler directives (NASM/MASM style primarily)
    directives: X86Directives,

    // Size specifiers (often used with PTR or directly)
    sizeSpecifiers: X86SizeSpecifiers,

    operators: [
        '+', '-', '*', '/', '%', // Arithmetic
        '=', '==', '!=', '<', '<=', '>', '>=', // Comparison (often in %if)
        '&', '|', '^', '~', // Bitwise
        '<<', '>>', // Shift
        '?', ':' // Ternary (sometimes in macros/equ)
    ],

    symbols: /[=><!~?:&|+\-*/^%]+/,

    // C# style strings
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    tokenizer: {
        root: [
            // Identifiers and keywords (instructions, directives, registers, size specifiers)
            [/[a-zA-Z_@$.%][\w@$.]*/, {
                cases: {
                    '@instructions': 'keyword.instruction',
                    '@registers': 'variable.predefined',
                    '@directives': 'keyword',
                    '@sizeSpecifiers': 'keyword.size',
                    '@default': 'identifier'
                }
            }],

            // Labels definition (identifier followed by a colon)
            [/^[ \t]*[a-zA-Z_@$.][\w@$.]*:/, 'tag.label'], // At start of line (more common)
            [/[a-zA-Z_@$.][\w@$.]*:/, 'tag.label'], // Anywhere else

            // Whitespace
            { include: '@whitespace' },

            // Delimiters and operators (brackets, comma, colon, operators)
            [/[{}()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [/@symbols/, {
                cases: {
                    '@operators': 'operator',
                    '@default': ''
                }
            }],
            [/,/, 'delimiter.comma'],
            // Colon handled by label definition or maybe operators if needed contextually

            // Numbers (Hex, Binary, Decimal)
            // Hex patterns: 0x123, 123h
            [/-?\d+(\.\d+)/, 'number.float'],
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/[0-9][0-9a-fA-F]*h/, 'number.hex'],
            // Binary patterns: 0b0101, 0101b
            [/0[bB][01]+/, 'number.binary'],
            [/[01]+b/, 'number.binary'],
            // Octal patterns: 0o123, 123o, 123q (less common)
            [/0[oO][0-7]+/, 'number.octal'],
            [/[0-7]+[oq]/, 'number.octal'],
            // Decimal
            [/[0-9]+/, 'number'],

            // Strings (double quoted, single quoted)
            [/"([^"\\]|\\.)*$/, 'string.invalid'],  // non-terminated string
            [/'([^'\\]|\\.)*$/, 'string.invalid'],  // non-terminated string
            [/"/, { token: 'string.quote', bracket: '@open', next: '@string_dq' }],
            [/'/, { token: 'string.quote', bracket: '@open', next: '@string_sq' }],

            // Characters (single quoted) - treat like strings for simplicity here
            [/'[^\\']'/, 'string'],
            [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
            [/'/, 'string.invalid']


        ],

        comment: [
            [/[;#].*$/, 'comment'], // Allow comments after whitespace
        ],

        whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/[;#].*$/, 'comment'], // Allow comments after whitespace
            [/^\s*%[a-zA-Z_]+.*$/, 'preprocessor'] // NASM preprocessor directives
        ],

        string_dq: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
        ],

        string_sq: [
            [/[^\\']+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
        ]
    } // tokenizer
}


export const X86LanguageConfiguration: monaco.languages.LanguageConfiguration = {
    comments: {
        lineComment: ';',
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '\'', close: '\'' }
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '\'', close: '\'' }
    ],
    // Indentation rules are hard for assembly, basic ones might be:
    indentationRules: {
        // Increase indent after labels and certain directives?
        increaseIndentPattern: /^\s*[a-zA-Z_@$.][\w@$.]*:\s*$|^\s*(section|segment|proc|struc|macro|%if|%ifdef|%ifndef|%macro)/i,
        // Decrease indent before end directives?
        decreaseIndentPattern: /^\s*(endp|endstruc|endm|%endif)\b/i
    }
}