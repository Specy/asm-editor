import { describe, expect, it } from 'vite-plus/test'
import { rewriteExpansion, type ExpansionOperand } from './expansion'

function tokens(...pairs: [string, string][]): ExpansionOperand[] {
    return pairs.map(([type, text]) => ({ type, text }))
}

describe('rewriteExpansion', () => {
    it('writes a MARS template in the row’s symbols, $1 as $at', () => {
        const lw = tokens(['OPERATOR', 'lw'], ['REGISTER_NAME', '$t1'], ['INTEGER_32', 'imm'])
        expect(rewriteExpansion(['lui $1, VH2', 'lw RG1,VL2($1)'], lw, 'mips')).toEqual([
            'lui $at, hi(imm)',
            'lw $t1, lo(imm)($at)'
        ])
    })

    it('writes the low half of an immediate that fits the field as the immediate itself', () => {
        const li = tokens(['OPERATOR', 'li'], ['REGISTER_NAME', '$t1'], ['INTEGER_16', 'imm16'])
        expect(rewriteExpansion(['addiu RG1, $0, VL2'], li, 'mips')).toEqual([
            'addiu $t1, $zero, imm16'
        ])
    })

    it('counts parentheses as tokens and drops the delayed branching nop', () => {
        const div = tokens(
            ['OPERATOR', 'div'],
            ['REGISTER_NAME', '$t1'],
            ['REGISTER_NAME', '$t2'],
            ['REGISTER_NAME', '$t3']
        )
        expect(
            rewriteExpansion(
                ['bne RG3, $0, BROFF12', 'DBNOP', 'break', 'div RG2, RG3', 'mflo RG1'],
                div,
                'mips'
            )
        ).toEqual(['bne $t3, $zero, 1', 'break', 'div $t2, $t3', 'mflo $t1'])
        const la = tokens(
            ['OPERATOR', 'la'],
            ['REGISTER_NAME', '$t1'],
            ['IDENTIFIER', 'label'],
            ['PLUS', '+'],
            ['INTEGER_32', 'imm32'],
            ['LEFT_PAREN', '('],
            ['REGISTER_NAME', '$t2'],
            ['RIGHT_PAREN', ')']
        )
        expect(
            rewriteExpansion(['lui $1, LHPN', 'ori $1, $1, LLPU', 'add RG1, RG6, $1'], la, 'mips')
        ).toEqual([
            'lui $at, hi(label+imm32)',
            'ori $at, $at, lo(label+imm32)',
            'add $t1, $t2, $at'
        ])
    })

    it('names the next register of a pair and the offsets MARS adds', () => {
        const ld = tokens(['OPERATOR', 'ld'], ['REGISTER_NAME', '$t1'], ['IDENTIFIER', 'label'])
        expect(rewriteExpansion(['lui $1, LH2P4', 'lw NR1, LL2P4($1)'], ld, 'mips')).toEqual([
            'lui $at, hi(label+4)',
            'lw next($t1), lo(label+4)($at)'
        ])
        const rol = tokens(
            ['OPERATOR', 'rol'],
            ['REGISTER_NAME', '$t1'],
            ['REGISTER_NAME', '$t2'],
            ['INTEGER_5', 'imm5']
        )
        expect(rewriteExpansion(['srl $1, RG2, S32', 'sll RG1, RG2, OP3'], rol, 'mips')).toEqual([
            'srl $at, $t2, 32-imm5',
            'sll $t1, $t2, imm5'
        ])
    })

    it('writes RARS registers by their ABI names, unless the row uses the name', () => {
        const call = tokens(['OPERATOR', 'call'], ['IDENTIFIER', 'label'])
        expect(rewriteExpansion(['auipc x6,PCH1', 'jalr x1, x6, PCL1'], call, 'risc-v')).toEqual([
            'auipc t1, pcrel_hi(label)',
            'jalr ra, t1, pcrel_lo(label)'
        ])
        const clash = tokens(['OPERATOR', 'example'], ['REGISTER_NAME', 't1'])
        expect(rewriteExpansion(['add RG1, x6, x0'], clash, 'risc-v')).toEqual(['add t1, x6, zero'])
    })

    it('names RARS CSRs and the pieces of a 64-bit li', () => {
        const frcsr = tokens(['OPERATOR', 'frcsr'], ['REGISTER_NAME', 't1'])
        expect(rewriteExpansion(['csrrs RG1, 0x003, x0'], frcsr, 'risc-v')).toEqual([
            'csrrs t1, fcsr, zero'
        ])
        const li = tokens(['OPERATOR', 'li'], ['REGISTER_NAME', 't1'], ['INTEGER_64', 'imm'])
        expect(rewriteExpansion(['lui RG1, LIA2', 'addi RG1, RG1, LIE2'], li, 'risc-v')).toEqual([
            'lui t1, imm[63:44]',
            'addi t1, t1, imm[9:0]'
        ])
    })

    it('shows nothing for a template it cannot read', () => {
        const form = tokens(['OPERATOR', 'x'], ['REGISTER_NAME', '$t1'])
        expect(rewriteExpansion(['add RG1, RG1, ZZ9'], form, 'mips')).toBeUndefined()
        expect(rewriteExpansion(['add RG1, RG1, RG5'], form, 'mips')).toBeUndefined()
        expect(rewriteExpansion([], form, 'mips')).toBeUndefined()
    })
})
