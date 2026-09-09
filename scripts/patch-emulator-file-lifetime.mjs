import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

const packages = [
    {
        name: '@specy/mips',
        root:
            process.env.ASM_EDITOR_MIPS_PACKAGE_ROOT ??
            join(projectRoot, 'node_modules', '@specy', 'mips'),
        prefix: 'asmu_',
        io: 'asm_JsMIPSIO'
    },
    {
        name: '@specy/risc-v',
        root:
            process.env.ASM_EDITOR_RISCV_PACKAGE_ROOT ??
            join(projectRoot, 'node_modules', '@specy', 'risc-v'),
        prefix: 'asru_',
        io: 'asr_JsRISCVIO'
    }
]

for (const emulatorPackage of packages) {
    const packageJson = JSON.parse(readFileSync(join(emulatorPackage.root, 'package.json'), 'utf8'))
    if (packageJson.version !== '3.0.0') {
        throw new Error(
            `The FileSystem lifetime patch targets ${emulatorPackage.name} 3.0.0, found ${packageJson.version}`
        )
    }

    for (const filename of ['index.js', 'index.mjs']) {
        const path = join(emulatorPackage.root, 'dist', filename)
        let source = readFileSync(path, 'utf8')
        const { prefix, io } = emulatorPackage
        const marker = `${prefix}SystemIO$FileIOData_fileNames.data.fill(null, 3);`
        if (source.includes(marker)) continue

        const resetAnchor = `        ${prefix}SystemIO$FileIOData_$callClinit();\n        var$1 = 0;`
        const resetReplacement = `        ${prefix}SystemIO$FileIOData_$callClinit();\n        ${marker}\n        ${prefix}SystemIO$FileIOData_fileFlags.data.fill(-1, 3);\n        ${prefix}SystemIO$FileIOData_streams.data.fill(null, 3);\n        var$1 = 32;`
        source = replaceOnce(source, resetAnchor, resetReplacement, `${filename} reset`)

        const descriptorAnchor = `  ${prefix}SystemIO$FileIOData_$callClinit();\n  if ($fd >= 0 && $fd < 32) {`
        const descriptorReplacement = `  ${prefix}SystemIO$FileIOData_$callClinit();\n  if ($fd > 2) return 1;\n  if ($fd >= 0 && $fd < 32) {`
        source = replaceOnce(
            source,
            descriptorAnchor,
            descriptorReplacement,
            `${filename} descriptor validation`
        )

        source = replaceOnce(
            source,
            `        if ($fd > 2 && $fd < 32) {`,
            `        if ($fd > 2) {`,
            `${filename} close range`
        )
        source = replaceOnce(
            source,
            `          if (var$2[$fd] === null)`,
            `          if (0)`,
            `${filename} close forwarding`
        )

        const openStart = source.indexOf(
            `var ${prefix === 'asmu_' ? 'asmmis' : 'asrrs'}_SyscallOpen_simulate =`
        )
        const openEnd = source.indexOf(
            `var ${prefix === 'asmu_' ? 'asmmis' : 'asrrs'}_SyscallPrintChar =`,
            openStart
        )
        if (openStart < 0 || openEnd < 0) {
            throw new Error(`${emulatorPackage.name} open syscall missing in ${filename}`)
        }
        let open = source.slice(openStart, openEnd)
        const openResetAnchor = `        ${prefix}SystemIO$FileIOData_$callClinit();`
        const openResetReplacement = `${openResetAnchor}\n        ${prefix}SystemIO$FileIOData_fileNames.data.fill(null, 3);\n        ${prefix}SystemIO$FileIOData_fileFlags.data.fill(-1, 3);\n        ${prefix}SystemIO$FileIOData_streams.data.fill(null, 3);`
        open = replaceOnce(open, openResetAnchor, openResetReplacement, `${filename} open table`)

        const openCall = `${io}_openFile(`
        if (occurrences(open, openCall) !== 2) {
            throw new Error(`${emulatorPackage.name} expected two open callbacks in ${filename}`)
        }
        open = open.replaceAll(openCall, `$tmp = ${openCall}`)
        const setStream = `            ${prefix}SystemIO$FileIOData_setStreamInUse($retValue);`
        if (occurrences(open, setStream) !== 2) {
            throw new Error(`${emulatorPackage.name} expected two open results in ${filename}`)
        }
        open = open.replaceAll(setStream, `            $retValue = $tmp;\n${setStream}`)
        source = source.slice(0, openStart) + open + source.slice(openEnd)
        writeFileSync(path, source)
    }
}

function replaceOnce(source, before, after, description) {
    if (occurrences(source, before) !== 1)
        throw new Error(`Package patch anchor missing: ${description}`)
    return source.replace(before, after)
}

function occurrences(source, value) {
    return source.split(value).length - 1
}
