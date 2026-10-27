/**
 * The RISC-V ISA manual as docs.riscv.org serves it, pinned to one release, read for one thing:
 * where on its pages each instruction is defined, so a documentation page can link there.
 *
 * The manual is CC BY 4.0 (https://github.com/riscv/riscv-isa-manual). Nothing of its text is
 * committed: the extract `manual-links.txt` beside this file holds page paths and anchor ids, which
 * are its URLs. The pages are fetched once into `.cache/riscv-docs/manual` (not committed).
 *
 * The manual names its rules with anchors, `norm:add_op`, `norm:beq_bne_op`,
 * `norm:fcvt-l-s_fcvt-w-s_op`, and gives the bit-manipulation instructions one section each,
 * `insns-add_uw`. A mnemonic is found in an anchor by its spelling with `.` as `-` or `_`, between
 * underscores, so `sra` finds `norm:sll_srl_sra_op` and `lr.w` finds `norm:lr_w_op`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MANUAL_VERSION = 'v20260120'
export const MANUAL_URL = `https://docs.riscv.org/reference/isa/${MANUAL_VERSION}/`
export const manualLinksPath = join(dirname(fileURLToPath(import.meta.url)), 'manual-links.txt')

/** The page of the manual that defines each extension's instructions, under `MANUAL_URL`. */
export const EXTENSION_PAGES = {
    I: 'unpriv/rv32',
    'I.64': 'unpriv/rv64',
    M: 'unpriv/m-st-ext',
    Zmmul: 'unpriv/m-st-ext',
    'M.64': 'unpriv/m-st-ext',
    A: 'unpriv/a-st-ext',
    Zaamo: 'unpriv/a-st-ext',
    Zalrsc: 'unpriv/a-st-ext',
    F: 'unpriv/f-st-ext',
    D: 'unpriv/d-st-ext',
    Zicsr: 'unpriv/zicsr',
    Zifencei: 'unpriv/zifencei',
    Zba: 'unpriv/b-st-ext',
    Zbb: 'unpriv/b-st-ext',
    Zbc: 'unpriv/b-st-ext',
    Zbs: 'unpriv/b-st-ext',
    Zicond: 'unpriv/zicond',
    Zihintpause: 'unpriv/zihintpause',
    Sm: 'priv/machine',
    S: 'priv/supervisor'
}

/**
 * Where an instruction has no rule of its own: the double-precision arithmetic and comparisons are
 * defined together, by reference to the single-precision ones, the AMOs share one section, and the
 * doubleword LR and SC are one rule saying RV64 adds them.
 */
const SHARED_ANCHORS = [
    [/^f(add|sub|mul|div|sqrt|min|max|madd|msub|nmadd|nmsub)\.d$/, 'norm:D_computational_instrs'],
    [/^f(eq|lt|le)\.d$/, 'norm:D_compare_instrs'],
    [/^amo[a-z]+\.[wd]$/, 'sec:amo'],
    [/^(lr|sc)\.d$/, 'norm:lr_sc_rv64']
]

/** The ids on a page, in document order. */
export function pageAnchors(html) {
    return [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
}

/**
 * The anchor that defines `mnemonic` among a page's ids: a rule or section naming it, one stating
 * what it does (`_op`) before one stating something else about it, then a shared one. Undefined
 * when the page names it nowhere.
 */
export function anchorFor(mnemonic, ids) {
    const spellings = [mnemonic.replace(/\./g, '-'), mnemonic.replace(/\./g, '_')]
    const naming = ids.filter((id) => {
        const key = `_${id.replace(/^(norm:|insns-)/, '')}_`
        return (
            /^(norm:|insns-)/.test(id) &&
            spellings.some((spelling) => key.includes(`_${spelling}_`))
        )
    })
    const operation = naming.find((id) => /_ops?\d*(_rv64i)?$/.test(id) || id.startsWith('insns-'))
    if (operation ?? naming[0]) return operation ?? naming[0]
    const shared = SHARED_ANCHORS.find(([pattern]) => pattern.test(mnemonic))?.[1]
    return shared && ids.includes(shared) ? shared : undefined
}

/** A page of the pinned release, fetched into `cacheDir` the first time it is asked for. */
export async function manualPage(page, cacheDir) {
    const path = join(cacheDir, `${page.replace('/', '_')}.html`)
    if (existsSync(path)) return readFileSync(path, 'utf8')
    const response = await fetch(`${MANUAL_URL}${page}.html`)
    if (!response.ok) throw new Error(`${MANUAL_URL}${page}.html: ${response.status}`)
    const html = await response.text()
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(path, html)
    return html
}

// --- the extract ----------------------------------------------------------------------------------

const COLUMNS = ['mnemonic', 'page', 'anchor']

/** The extract, as `manual-links.txt` holds it: a header naming its sources, one link per line. */
export function formatManualLinks({ udbCommit, links }) {
    const header = [
        'Where the RISC-V ISA manual defines each real instruction the Core accepts, for the link',
        'on its documentation page.',
        '',
        `Pages and anchors of the manual at ${MANUAL_URL} (CC BY 4.0), chosen through`,
        `the extension the RISC-V Unified Database names for the instruction, at commit`,
        `${udbCommit},`,
        'by `node scripts/riscv-docs-generate.mjs --udb <checkout>`; regenerate it that way rather',
        'than editing it. Names only: no text of either is copied.',
        '',
        COLUMNS.join('\t')
    ]
    const lines = links.map((link) => [link.mnemonic, link.page, link.anchor || '-'].join('\t'))
    return `${header.map((line) => `#${line ? ` ${line}` : ''}`).join('\n')}\n${lines.join('\n')}\n`
}

/** Reads `manual-links.txt` back. */
export function readManualLinks(path = manualLinksPath) {
    if (!existsSync(path)) {
        throw new Error(`missing ${path}; write it with --udb <checkout of ${'riscv-unified-db'}>`)
    }
    return readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
            const cells = line.split('\t')
            if (cells.length !== COLUMNS.length) throw new Error(`${path}: bad line ${line}`)
            const [mnemonic, page, anchor] = cells
            return { mnemonic, page, anchor: anchor === '-' ? '' : anchor }
        })
}
