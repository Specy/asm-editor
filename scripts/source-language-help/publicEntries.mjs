/** An explicit public manifest: additions must be checked against the shipped header. */
const entries = []
const add = (name, headers, summary, kind = 'constant', extra = {}) =>
    entries.push({ name, headers: headers.split(' '), summary, kind, declaration: name, ...extra })
add(
    'size_t',
    'stddef.h stdio.h stdlib.h string.h time.h',
    'Unsigned type used for sizes and element counts.',
    'type'
)
add(
    'ptrdiff_t',
    'stddef.h',
    'Signed type used for the difference between pointers into the same array.',
    'type'
)
add(
    'max_align_t',
    'stddef.h',
    'Type with the strictest ordinary alignment supported by these headers.',
    'type'
)
add('wchar_t', 'stddef.h', 'Type used for wide character values.', 'type', { languages: ['c'] })
add('nullptr_t', 'stddef.h', 'Type of the C++ nullptr value.', 'type', { languages: ['cpp'] })
add(
    'NULL',
    'stddef.h stdio.h stdlib.h string.h time.h',
    'Null pointer constant. In C++, prefer nullptr.'
)
add(
    'offsetof',
    'stddef.h',
    'Byte offset of a member within a standard-layout structure.',
    'macro',
    { declaration: 'offsetof(type, member)' }
)
add('va_list', 'stdarg.h', 'Type used to traverse a variable argument list.', 'type')
for (const [name, parameters, summary] of [
    [
        'va_start',
        'ap, last',
        'Starts reading a variable argument list after the last named parameter.'
    ],
    ['va_arg', 'ap, type', 'Reads the next variable argument as type and advances the list.'],
    ['va_copy', 'dest, src', 'Copies the state of a variable argument list.'],
    ['va_end', 'ap', 'Finishes using a variable argument list.']
])
    add(name, 'stdarg.h', summary, 'macro', { declaration: `${name}(${parameters})` })
for (const [name, summary] of [
    ['bool', 'Boolean type in C.'],
    ['true', 'True boolean value.'],
    ['false', 'False boolean value.']
])
    add(name, 'stdbool.h', summary, name === 'bool' ? 'type' : 'constant', { languages: ['c'] })
add(
    'noreturn',
    'stdnoreturn.h',
    'Declares a C function that does not return to its caller.',
    'macro',
    { languages: ['c'] }
)
add(
    'assert',
    'assert.h',
    'Stops the program with a diagnostic if the expression is false. Disabled when NDEBUG is defined.',
    'macro',
    { declaration: 'assert(expression)' }
)
add('static_assert', 'assert.h', 'Checks a constant expression at compile time.', 'macro', {
    declaration: 'static_assert(expression, message)',
    languages: ['c']
})
for (const [name, summary] of [
    ['FILE', 'Opaque type representing a standard-library stream.'],
    ['fpos_t', 'Type used to save and restore a stream position.']
])
    add(name, 'stdio.h', summary, 'type')
for (const [name, summary] of [
    [
        'EOF',
        'Reports end of input or a stream error; check the function result before treating it as a character.'
    ],
    ['stdin', 'Standard input stream, read from the Terminal or scripted input.'],
    ['stdout', 'Standard output stream, written to the Terminal.'],
    ['stderr', 'Standard error stream, also written to the Terminal.'],
    ['BUFSIZ', 'Default stream buffer size supplied by the header.'],
    ['FILENAME_MAX', 'Maximum file-name size supplied by the header.'],
    ['FOPEN_MAX', 'Number of simultaneously open streams supported by the library.'],
    ['SEEK_SET', 'Seek relative to the beginning of the file.'],
    ['SEEK_CUR', 'Seek relative to the current file position.'],
    ['SEEK_END', 'Seek relative to the end of the file.'],
    [
        '_IOFBF',
        'Requests full buffering; this library accepts the request but writes output through.'
    ],
    [
        '_IOLBF',
        'Requests line buffering; this library accepts the request but writes output through.'
    ],
    ['_IONBF', 'Requests unbuffered output.']
])
    add(name, 'stdio.h', summary)
for (const name of ['div_t', 'ldiv_t', 'lldiv_t'])
    add(
        name,
        'stdlib.h',
        'Structure holding quot (quotient) and rem (remainder) from integer division.',
        'type'
    )
for (const [name, summary] of [
    ['EXIT_SUCCESS', 'Successful program exit status.'],
    ['EXIT_FAILURE', 'Unsuccessful program exit status.'],
    ['RAND_MAX', 'Largest value returned by rand.'],
    ['MB_CUR_MAX', 'Maximum bytes in one multibyte character supported by this library.']
])
    add(name, 'stdlib.h', summary)
for (const bits of [8, 16, 32, 64]) {
    for (const prefix of ['int', 'uint', 'int_least', 'uint_least', 'int_fast', 'uint_fast'])
        add(
            `${prefix}${bits}_t`,
            'stdint.h',
            `${prefix.startsWith('u') ? 'Unsigned' : 'Signed'} integer type ${prefix.includes('least') ? 'with at least' : prefix.includes('fast') ? 'chosen for efficient arithmetic with at least' : 'with exactly'} ${bits} bits.`,
            'type'
        )
    for (const prefix of ['INT', 'UINT']) {
        for (const variant of ['', '_LEAST', '_FAST']) {
            add(
                `${prefix}${variant}${bits}_MAX`,
                'stdint.h',
                `Maximum value of ${prefix === 'INT' ? 'int' : 'uint'}${variant.toLowerCase()}${bits}_t on this Target.`
            )
            if (prefix === 'INT')
                add(
                    `${prefix}${variant}${bits}_MIN`,
                    'stdint.h',
                    `Minimum value of int${variant.toLowerCase()}${bits}_t on this Target.`
                )
        }
    }
    for (const prefix of ['INT', 'UINT'])
        add(
            `${prefix}${bits}_C`,
            'stdint.h',
            `Writes an integer constant of the ${prefix === 'INT' ? 'signed' : 'unsigned'} ${bits}-bit least-width type.`,
            'macro',
            { declaration: `${prefix}${bits}_C(value)` }
        )
    for (const format of ['d', 'i', 'o', 'u', 'x', 'X'])
        add(
            `PRI${format}${bits}`,
            'inttypes.h',
            `printf format string fragment for a ${bits}-bit integer (${format} conversion).`
        )
    for (const format of ['d', 'i', 'o', 'u', 'x'])
        add(
            `SCN${format}${bits}`,
            'inttypes.h',
            `scanf format string fragment for a ${bits}-bit integer (${format} conversion).`
        )
}
for (const [name, summary] of [
    ['intptr_t', 'Signed integer type capable of representing a pointer.'],
    ['uintptr_t', 'Unsigned integer type capable of representing a pointer.'],
    ['intmax_t', 'Widest signed integer type.'],
    ['uintmax_t', 'Widest unsigned integer type.']
])
    add(name, 'stdint.h', summary, 'type')
for (const prefix of [
    'INTPTR',
    'UINTPTR',
    'INTMAX',
    'UINTMAX',
    'PTRDIFF',
    'SIZE',
    'SIG_ATOMIC',
    'WCHAR',
    'WINT'
]) {
    add(`${prefix}_MAX`, 'stdint.h', 'Maximum value of the corresponding type on this Target.')
    if (!['UINTPTR', 'UINTMAX', 'SIZE'].includes(prefix))
        add(`${prefix}_MIN`, 'stdint.h', 'Minimum value of the corresponding type on this Target.')
}
for (const name of [
    'CHAR_BIT',
    'MB_LEN_MAX',
    'SCHAR_MIN',
    'SCHAR_MAX',
    'UCHAR_MAX',
    'CHAR_MIN',
    'CHAR_MAX',
    'SHRT_MIN',
    'SHRT_MAX',
    'USHRT_MAX',
    'INT_MIN',
    'INT_MAX',
    'UINT_MAX',
    'LONG_MIN',
    'LONG_MAX',
    'ULONG_MAX',
    'LLONG_MIN',
    'LLONG_MAX',
    'ULLONG_MAX'
])
    add(
        name,
        'limits.h',
        'Integer limit or property for this Target; include the header rather than assuming a numeric value.'
    )
for (const name of ['FLT_RADIX', 'FLT_ROUNDS', 'FLT_EVAL_METHOD', 'DECIMAL_DIG'])
    add(name, 'float.h', 'Floating-point property of this Target.')
for (const prefix of ['FLT', 'DBL', 'LDBL'])
    for (const suffix of [
        'MANT_DIG',
        'DIG',
        'DECIMAL_DIG',
        'MIN_EXP',
        'MIN_10_EXP',
        'MAX_EXP',
        'MAX_10_EXP',
        'MAX',
        'MIN',
        'EPSILON',
        'TRUE_MIN',
        'HAS_SUBNORM'
    ])
        add(
            `${prefix}_${suffix}`,
            'float.h',
            'Floating-point limit or precision property of this Target.'
        )
for (const name of ['float_t', 'double_t'])
    add(name, 'math.h', 'Floating-point evaluation type selected for this Target.', 'type')
for (const name of [
    'HUGE_VAL',
    'HUGE_VALF',
    'INFINITY',
    'NAN',
    'FP_NAN',
    'FP_INFINITE',
    'FP_ZERO',
    'FP_SUBNORMAL',
    'FP_NORMAL',
    'MATH_ERRNO',
    'MATH_ERREXCEPT',
    'math_errhandling',
    'M_E',
    'M_LOG2E',
    'M_LOG10E',
    'M_LN2',
    'M_LN10',
    'M_PI',
    'M_PI_2',
    'M_PI_4',
    'M_1_PI',
    'M_2_PI',
    'M_2_SQRTPI',
    'M_SQRT2',
    'M_SQRT1_2'
])
    add(
        name,
        'math.h',
        'Mathematical constant or floating-point classification supplied by this header.'
    )
for (const name of ['fpclassify', 'isfinite', 'isinf', 'isnan', 'isnormal', 'signbit'])
    add(name, 'math.h', 'Classifies or tests the floating-point value.', 'macro', {
        declaration: `${name}(value)`
    })
for (const name of [
    'isgreater',
    'isgreaterequal',
    'isless',
    'islessequal',
    'islessgreater',
    'isunordered'
])
    add(
        name,
        'math.h',
        'Compares floating-point values, including the case of an unordered NaN operand.',
        'macro',
        { declaration: `${name}(x, y)` }
    )
add('errno', 'errno.h', 'Error code set by standard-library functions that report a failure.')
for (const name of [
    'EPERM',
    'ENOENT',
    'EIO',
    'EBADF',
    'EAGAIN',
    'ENOMEM',
    'EACCES',
    'EEXIST',
    'EINVAL',
    'EMFILE',
    'ENOSPC',
    'ESPIPE',
    'EDOM',
    'ERANGE',
    'ENOSYS',
    'EOVERFLOW',
    'EILSEQ'
])
    add(
        name,
        'errno.h',
        'Standard-library error code; compare it with errno after a function reports failure.'
    )
for (const name of ['time_t', 'clock_t'])
    add(
        name,
        'time.h',
        name === 'time_t'
            ? 'Type representing calendar time in seconds.'
            : 'Type representing clock ticks.',
        'type'
    )
add('tm', 'time.h', 'Calendar fields such as year, month, day, hour, minute and second.', 'type', {
    declaration: 'struct tm'
})
add(
    'CLOCKS_PER_SEC',
    'time.h',
    'Clock ticks per second; use it to convert clock results to seconds.'
)
add('imaxdiv_t', 'inttypes.h', 'Quotient and remainder returned by imaxdiv.', 'type')
for (const name of [
    'and',
    'and_eq',
    'bitand',
    'bitor',
    'compl',
    'not',
    'not_eq',
    'or',
    'or_eq',
    'xor',
    'xor_eq'
])
    add(name, 'iso646.h', 'Alternative spelling for a C operator.', 'macro', { languages: ['c'] })
export const PUBLIC_ENTRIES = entries
