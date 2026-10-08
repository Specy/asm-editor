import {
    instructionContentFromFiles,
    type InstructionExampleMetadata
} from '$lib/documentation/instructions/content'

const metadata: Record<string, InstructionExampleMetadata> = {
    add: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'add.uw': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    addi: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    addiw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    addw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    'amoadd.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'amoadd.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    'amoand.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'amoand.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    'amomax.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'amomax.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    'amomaxu.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'amomaxu.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    'amomin.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'amomin.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    'amominu.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'amominu.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    'amoor.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'amoor.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    'amoswap.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'amoswap.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    'amoxor.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'amoxor.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    and: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    andi: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    andn: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    auipc: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    b: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bclr: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bclri: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    beq: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    beqz: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bext: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bexti: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bge: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bgeu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bgez: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bgt: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bgtu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bgtz: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    binv: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    binvi: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    ble: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bleu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    blez: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    blt: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bltu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bltz: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bne: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bnez: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bset: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    bseti: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    call: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    clz: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    clzw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    cpop: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    cpopw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    csrc: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    csrci: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    csrr: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    csrrc: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    csrrci: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    csrrs: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    csrrsi: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    csrrw: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    csrrwi: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    csrs: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    csrsi: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    csrw: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    csrwi: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    ctz: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    ctzw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    div: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    divu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    divuw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    divw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    ebreak: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    ecall: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            showConsole: true
        }
    },
    'fabs.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fabs.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fadd.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fadd.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fclass.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fclass.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fcvt.d.l': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fcvt.d.lu': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fcvt.d.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fcvt.d.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fcvt.d.wu': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fcvt.l.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    'fcvt.l.s': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    'fcvt.lu.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    'fcvt.lu.s': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    'fcvt.s.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fcvt.s.l': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fcvt.s.lu': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fcvt.s.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fcvt.s.wu': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fcvt.w.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fcvt.w.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fcvt.wu.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fcvt.wu.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fdiv.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fdiv.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    fence: {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    'fence.i': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'feq.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'feq.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fge.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fge.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fgt.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fgt.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    fld: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fle.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'fle.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'flt.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'flt.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    flw: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fmadd.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fmadd.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fmax.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fmax.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fmin.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fmin.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fmsub.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fmsub.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fmul.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fmul.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fmv.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fmv.d.x': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fmv.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fmv.s.x': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fmv.w.x': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fmv.x.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'hex',
            initialRegisterFile: 'fpu'
        }
    },
    'fmv.x.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'hex',
            initialRegisterFile: 'fpu'
        }
    },
    'fmv.x.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'hex',
            initialRegisterFile: 'fpu'
        }
    },
    'fneg.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fneg.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fnmadd.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fnmadd.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fnmsub.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fnmsub.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    frcsr: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    frflags: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    frrm: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    frsr: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    fscsr: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    fsd: {
        target: 'RISC-V',
        presentation: {
            showMemory: true,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    fsflags: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    'fsgnj.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fsgnj.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fsgnjn.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fsgnjn.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fsgnjx.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fsgnjx.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    'fsqrt.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fsqrt.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    fsrm: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    fssr: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    'fsub.d': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'double',
            initialRegisterFile: 'fpu'
        }
    },
    'fsub.s': {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    fsw: {
        target: 'RISC-V',
        presentation: {
            showMemory: true,
            initialRegisterFormat: 'single',
            initialRegisterFile: 'fpu'
        }
    },
    j: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    jal: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    jalr: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    jr: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    la: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    lb: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    lbu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    ld: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    lh: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    lhu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    li: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    'lr.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'lr.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    lui: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    lw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    lwu: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    max: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    maxu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    min: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    minu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    mul: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    mulh: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    mulhsu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    mulhu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    mulw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    mv: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    neg: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    negw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    nop: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    not: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    or: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'orc.b': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    ori: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    orn: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rdcycle: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rdcycleh: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rdinstret: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rdinstreth: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rdtime: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rdtimeh: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rem: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    remu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    remuw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    remw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    ret: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rev8: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rol: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rolw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    ror: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    rori: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    roriw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    rorw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    sb: {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    'sc.d': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    'sc.w': {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    sd: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: true
        }
    },
    seqz: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'sext.b': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'sext.h': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'sext.w': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    sgt: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    sgtu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    sgtz: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    sh: {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    sh1add: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'sh1add.uw': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    sh2add: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'sh2add.uw': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    sh3add: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'sh3add.uw': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    sll: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    slli: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    'slli.uw': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    slliw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    sllw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    slt: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    slti: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    sltiu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    sltu: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    sltz: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    snez: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    sra: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    srai: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    sraiw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    sraw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    srl: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    srli: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    srliw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    srlw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    sub: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    subw: {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    sw: {
        target: 'RISC-V',
        presentation: {
            showMemory: true
        }
    },
    tail: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    uret: {
        target: 'RISC-V',
        presentation: {
            showMemory: false,
            initialRegisterFile: 'csr'
        }
    },
    wfi: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    xnor: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    xor: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    xori: {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'zext.b': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    },
    'zext.h': {
        target: 'RISC-V',
        presentation: {
            showMemory: false
        }
    },
    'zext.w': {
        target: 'RISC-V-64',
        presentation: {
            showMemory: false
        }
    }
}

export const riscvInstructionContent = instructionContentFromFiles(
    import.meta.glob<string>('./instructions/*.asm', {
        query: '?raw',
        import: 'default',
        eager: true
    }),
    metadata
)
