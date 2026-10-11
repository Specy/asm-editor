import {
    instructionContentFromFiles,
    type InstructionExampleMetadata
} from '../instructions/content'

const metadata: Record<string, InstructionExampleMetadata> = {
    abs: {
        target: 'MIPS'
    },
    'abs.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'abs.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    add: {
        target: 'MIPS'
    },
    'add.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'add.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    addi: {
        target: 'MIPS'
    },
    addiu: {
        target: 'MIPS'
    },
    addu: {
        target: 'MIPS'
    },
    and: {
        target: 'MIPS'
    },
    andi: {
        target: 'MIPS'
    },
    b: {
        target: 'MIPS'
    },
    bal: {
        target: 'MIPS'
    },
    bc1f: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    bc1t: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    beq: {
        target: 'MIPS'
    },
    beqz: {
        target: 'MIPS'
    },
    bge: {
        target: 'MIPS'
    },
    bgeu: {
        target: 'MIPS'
    },
    bgez: {
        target: 'MIPS'
    },
    bgezal: {
        target: 'MIPS'
    },
    bgt: {
        target: 'MIPS'
    },
    bgtu: {
        target: 'MIPS'
    },
    bgtz: {
        target: 'MIPS'
    },
    ble: {
        target: 'MIPS'
    },
    bleu: {
        target: 'MIPS'
    },
    blez: {
        target: 'MIPS'
    },
    blt: {
        target: 'MIPS'
    },
    bltu: {
        target: 'MIPS'
    },
    bltz: {
        target: 'MIPS'
    },
    bltzal: {
        target: 'MIPS'
    },
    bne: {
        target: 'MIPS'
    },
    bnez: {
        target: 'MIPS'
    },
    break: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    'c.eq.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.eq.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.f.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.f.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.le.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.le.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.lt.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.lt.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.nge.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.nge.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.ngl.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.ngl.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.ngle.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.ngle.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.ngt.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.ngt.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.ole.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.ole.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.olt.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.olt.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.seq.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.seq.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.sf.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.sf.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.ueq.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.ueq.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.ule.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.ule.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.ult.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.ult.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'c.un.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double',
            showFlags: true
        }
    },
    'c.un.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'ceil.w.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    'ceil.w.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    cfc1: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    clo: {
        target: 'MIPS'
    },
    clz: {
        target: 'MIPS'
    },
    ctc1: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    'cvt.d.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    'cvt.d.w': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    'cvt.s.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'cvt.s.w': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    'cvt.w.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    'cvt.w.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    div: {
        target: 'MIPS'
    },
    'div.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'div.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    divu: {
        target: 'MIPS'
    },
    eret: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    'floor.w.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    'floor.w.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    j: {
        target: 'MIPS'
    },
    jal: {
        target: 'MIPS'
    },
    jalr: {
        target: 'MIPS'
    },
    jr: {
        target: 'MIPS'
    },
    'l.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            showMemory: true,
            initialRegisterFormat: 'double'
        }
    },
    'l.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            showMemory: true,
            initialRegisterFormat: 'single'
        }
    },
    la: {
        target: 'MIPS'
    },
    lb: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    lbu: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    ld: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    ldc1: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            showMemory: true,
            initialRegisterFormat: 'double'
        }
    },
    lh: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    lhu: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    li: {
        target: 'MIPS'
    },
    ll: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    lui: {
        target: 'MIPS'
    },
    lw: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    lwc1: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            showMemory: true,
            initialRegisterFormat: 'single'
        }
    },
    lwl: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    lwr: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    madd: {
        target: 'MIPS'
    },
    maddu: {
        target: 'MIPS'
    },
    mfc0: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    mfc1: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    'mfc1.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    mfhi: {
        target: 'MIPS'
    },
    mflo: {
        target: 'MIPS'
    },
    'mov.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'mov.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    move: {
        target: 'MIPS'
    },
    movf: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'movf.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'movf.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    movn: {
        target: 'MIPS'
    },
    'movn.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'movn.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    movt: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single',
            showFlags: true
        }
    },
    'movt.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'movt.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    movz: {
        target: 'MIPS'
    },
    'movz.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'movz.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    msub: {
        target: 'MIPS'
    },
    msubu: {
        target: 'MIPS'
    },
    mtc0: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    mtc1: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    'mtc1.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    mthi: {
        target: 'MIPS'
    },
    mtlo: {
        target: 'MIPS'
    },
    mul: {
        target: 'MIPS'
    },
    'mul.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'mul.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    mulo: {
        target: 'MIPS'
    },
    mulou: {
        target: 'MIPS'
    },
    mult: {
        target: 'MIPS'
    },
    multu: {
        target: 'MIPS'
    },
    mulu: {
        target: 'MIPS'
    },
    neg: {
        target: 'MIPS'
    },
    'neg.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'neg.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    negu: {
        target: 'MIPS'
    },
    nop: {
        target: 'MIPS'
    },
    nor: {
        target: 'MIPS'
    },
    not: {
        target: 'MIPS'
    },
    or: {
        target: 'MIPS'
    },
    ori: {
        target: 'MIPS'
    },
    pref: {
        target: 'MIPS'
    },
    rem: {
        target: 'MIPS'
    },
    remu: {
        target: 'MIPS'
    },
    rol: {
        target: 'MIPS'
    },
    ror: {
        target: 'MIPS'
    },
    rotr: {
        target: 'MIPS'
    },
    rotrv: {
        target: 'MIPS'
    },
    'round.w.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    'round.w.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    's.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            showMemory: true,
            initialRegisterFormat: 'double'
        }
    },
    's.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            showMemory: true,
            initialRegisterFormat: 'single'
        }
    },
    sb: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    sc: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    sd: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    sdc1: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            showMemory: true,
            initialRegisterFormat: 'double'
        }
    },
    seb: {
        target: 'MIPS'
    },
    seh: {
        target: 'MIPS'
    },
    seq: {
        target: 'MIPS'
    },
    sge: {
        target: 'MIPS'
    },
    sgeu: {
        target: 'MIPS'
    },
    sgt: {
        target: 'MIPS'
    },
    sgtu: {
        target: 'MIPS'
    },
    sh: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    sle: {
        target: 'MIPS'
    },
    sleu: {
        target: 'MIPS'
    },
    sll: {
        target: 'MIPS'
    },
    sllv: {
        target: 'MIPS'
    },
    slt: {
        target: 'MIPS'
    },
    slti: {
        target: 'MIPS'
    },
    sltiu: {
        target: 'MIPS'
    },
    sltu: {
        target: 'MIPS'
    },
    sne: {
        target: 'MIPS'
    },
    'sqrt.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'sqrt.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    sra: {
        target: 'MIPS'
    },
    srav: {
        target: 'MIPS'
    },
    srl: {
        target: 'MIPS'
    },
    srlv: {
        target: 'MIPS'
    },
    sub: {
        target: 'MIPS'
    },
    'sub.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'double'
        }
    },
    'sub.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'single'
        }
    },
    subi: {
        target: 'MIPS'
    },
    subiu: {
        target: 'MIPS'
    },
    subu: {
        target: 'MIPS'
    },
    sw: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    swc1: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            showMemory: true,
            initialRegisterFormat: 'single'
        }
    },
    swl: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    swr: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    sync: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    syscall: {
        target: 'MIPS',
        presentation: {
            showConsole: true
        }
    },
    teq: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    teqi: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    tge: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    tgei: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    tgeiu: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    tgeu: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    tlt: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    tlti: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    tltiu: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    tltu: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    tne: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    tnei: {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'cp0'
        }
    },
    'trunc.w.d': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    'trunc.w.s': {
        target: 'MIPS',
        presentation: {
            initialRegisterFile: 'fpu',
            initialRegisterFormat: 'hex'
        }
    },
    ulh: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    ulhu: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    ulw: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    ush: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    usw: {
        target: 'MIPS',
        presentation: {
            showMemory: true
        }
    },
    wait: {
        target: 'MIPS'
    },
    wsbh: {
        target: 'MIPS'
    },
    xor: {
        target: 'MIPS'
    },
    xori: {
        target: 'MIPS'
    }
}

export const mipsInstructionContent = instructionContentFromFiles(
    import.meta.glob<string>('./instructions/*.asm', {
        query: '?raw',
        import: 'default',
        eager: true
    }),
    metadata
)
