/** Compiler settings and GNU-output preparation shared by the browser and Node tools. */
export function defaultSourceCompiler(target) {
    return ['MIPS', 'RISC-V', 'RISC-V-64'].includes(target) ? 'clang' : 'gcc'
}

function x86Flags(profile) {
    if (!profile) throw new Error('An x86 compilation needs the translation profile of its output.')
    return profile.flags
}

export function compilerPreset(
    target,
    language,
    compiler = defaultSourceCompiler(target),
    profile
) {
    //GCC whatever was asked for: the translation of x86 output to NASM is verified on GCC 14.2's
    //output alone, so x86 offers no other compiler
    if (target === 'X86')
        return {
            id: language === 'cpp' ? 'g142' : 'cg142',
            architecture: x86Flags(profile).target.join(' ')
        }
    const ids = {
        MIPS: { c: 'cmipsg1420', cpp: 'mipsg1420' },
        'RISC-V': { c: 'rv32-cgcc1420', cpp: 'rv32-gcc1420' },
        'RISC-V-64': { c: 'rv64-cgcc1420', cpp: 'rv64-gcc1420' }
    }
    // MARS skips branch delay slots, so the compiler must fill them with nops.
    const mipsDelaySlots =
        compiler === 'clang' ? '-mllvm -disable-mips-delay-filler' : '-fno-delayed-branch'
    const architecture =
        target === 'MIPS'
            ? // little-endian: MARS memory is, so -EB code read its bytes and halves the wrong way round
              `-march=mips32 -mabi=32 -mno-abicalls -fno-pic -G0 ${mipsDelaySlots} -mfp32 -mhard-float -EL`
            : target === 'RISC-V'
              ? '-march=rv32imfd -mabi=ilp32d'
              : '-march=rv64imfd -mabi=lp64d'
    const clangIds = {
        MIPS: { c: 'mipsel-cclang2110', cpp: 'mipsel-clang2110' },
        'RISC-V': { c: 'rv32-cclang2110', cpp: 'rv32-clang2110' },
        'RISC-V-64': { c: 'rv64-cclang2110', cpp: 'rv64-clang2110' }
    }
    const id = compiler === 'clang' ? clangIds[target][language] : ids[target][language]
    return { id, architecture }
}

export function compilerCodeFlags(compiler, optimization, sourceAnnotations = false, profile) {
    if (profile)
        return [
            `-O${optimization}`,
            '-fdiagnostics-color=never',
            '-fno-section-anchors',
            '-ffreestanding',
            ...profile.flags.translation,
            ...profile.flags.locations
        ].join(' ')
    const annotations = compiler === 'clang' && sourceAnnotations
    const options =
        compiler === 'clang'
            ? `-fno-addrsig${annotations ? ' -fno-discard-value-names' : ''}`
            : '-fno-section-anchors'
    return `-O${optimization} -g1 -fdiagnostics-color=never ${annotations ? '-fverbose-asm' : '-fno-verbose-asm'} -fno-stack-protector -fno-pie ${options}`
}

export function compilerLanguageFlags(language, profile) {
    const standard = profile
        ? profile.flags.language[language].join(' ')
        : language === 'cpp'
          ? '-std=c++17 -fno-exceptions -fno-rtti'
          : '-std=c17'
    return standard + (language === 'cpp' ? ' -fno-threadsafe-statics -nostdinc++' : '')
}

export const RUNTIME_TARGETS = Object.fromEntries(
    [
        ['riscv32', 'RISC-V', 'risc-v', 32],
        ['riscv64', 'RISC-V-64', 'risc-v', 64],
        ['mips', 'MIPS', 'mips', 32]
    ].map(([arch, language, core, width]) => [
        arch,
        {
            arch,
            language,
            core,
            width,
            compilers: {
                c: compilerPreset(language, 'c', 'gcc').id,
                cpp: compilerPreset(language, 'cpp', 'gcc').id
            },
            flags: compilerPreset(language, 'c', 'gcc').architecture
        }
    ])
)

/** Labels GCC's MIPS output defines only for the debug sections, which are dropped. */
const MIPS_DEBUG_LABEL = /^\s*(?:\$L|\.L)(?:FB|FE|BB|BE|VL|text|etext|debug)\w*\s*(?::|=)/
/**
 * The one comment the output keeps: the `@screen` directive `SIM_SCREEN` writes through a file-scope
 * `__asm__`, which a Build reads to configure the bitmap display, as it reads an assembly example's.
 * The `#APP` and `#NO_APP` markers around it go with every other comment.
 */
const SCREEN_DIRECTIVE = /^\s*#+[ \t]*@screen\b/i

/**
 * A code line without a trailing comment that reads as an `@screen` directive. Clang's source
 * annotations name a symbol after its directives, `.type screen,@object  # @screen`, which a Build
 * would take for a second directive, or for the only one in a program with a global named `screen`;
 * the directive itself is always a line of its own. A `#` inside a string literal is no comment.
 */
function withoutScreenAnnotation(code) {
    let quoted = false
    for (let index = 0; index < code.length; index++) {
        const character = code[index]
        if (quoted && character === '\\') index++
        else if (character === '"') quoted = !quoted
        else if (!quoted && character === '#')
            return SCREEN_DIRECTIVE.test(code.slice(index)) ? code.slice(0, index).trimEnd() : code
    }
    return code
}

export function prepareCompilerLines(lines, target, sourceAnnotations = false) {
    const prepared = []
    let debugSection = false
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index]
        const code = line.text
        const blockComment = sourceAnnotations && /^\s*#\s*%bb\.\d+:\s*#\s*%[\w.]+\s*$/.test(code)
        const section = /^\s*\.section\s+(?:"([^"]+)"|([^\s,]+))/.exec(code)?.slice(1).find(Boolean)
        if (section) debugSection = /^\.(?:debug|zdebug|mdebug|note|comment|eh_frame)/.test(section)
        else if (/^\s*\.(?:text|data|bss|sdata|sbss|rodata|rdata)\b/.test(code))
            debugSection = false
        else if (debugSection && /^\s*\.previous\b/.test(code)) {
            //back to the section before the debug one, where the lines after it belong
            debugSection = false
            continue
        }
        if (
            debugSection ||
            /^\s*\.(?:file|loc|cfi_\w+|ident)\b/.test(code) ||
            (target === 'MIPS' && MIPS_DEBUG_LABEL.test(code)) ||
            (/^\s*#/.test(code) && !blockComment && !SCREEN_DIRECTIVE.test(code)) ||
            !code.trim()
        )
            continue
        prepared.push({ index, text: /^\s*#/.test(code) ? code : withoutScreenAnnotation(code) })
    }
    return prepared
}
