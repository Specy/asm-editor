import type { InstructionExampleExpectation } from '../instructions/expectations'

export const mipsExampleExpectations: Record<string, InstructionExampleExpectation> = {
    abs: {
        registers: {
            $t2: '7'
        }
    },
    'abs.d': {
        registerFiles: {
            fpu: {
                $f6: '0',
                $f7: '1073217536'
            }
        }
    },
    'abs.s': {
        registerFiles: {
            fpu: {
                $f0: '1069547520'
            }
        }
    },
    add: {
        registers: {
            $t2: '12'
        }
    },
    'add.d': {
        registerFiles: {
            fpu: {
                $f6: '0',
                $f7: '1074659328'
            }
        }
    },
    'add.s': {
        registerFiles: {
            fpu: {
                $f0: '1081081856'
            }
        }
    },
    addi: {
        registers: {
            $t2: '10'
        }
    },
    addiu: {
        registers: {
            $t2: '2147483648'
        }
    },
    addu: {
        registers: {
            $t2: '2147483648'
        }
    },
    and: {
        registers: {
            $t2: '3'
        }
    },
    andi: {
        registers: {
            $t2: '5'
        }
    },
    b: {
        registers: {
            $t2: '2'
        }
    },
    bal: {
        registers: {
            $t2: '2'
        }
    },
    bc1f: {
        registers: {
            $t2: '1',
            $t3: '2'
        },
        flags: {
            fpu: {
                '0': '0'
            }
        }
    },
    bc1t: {
        registers: {
            $t2: '2',
            $t3: '1'
        },
        flags: {
            fpu: {
                '0': '0'
            }
        }
    },
    beq: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    beqz: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bge: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bgeu: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bgez: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bgezal: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bgt: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bgtu: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bgtz: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    ble: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bleu: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    blez: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    blt: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bltu: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bltz: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bltzal: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bne: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    bnez: {
        registers: {
            $t2: '2',
            $t3: '1'
        }
    },
    break: {
        stop: 'exception',
        error: 'break instruction executed',
        registerFiles: {
            cp0: {
                '$13 (cause)': '36'
            }
        }
    },
    'c.eq.d': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.eq.s': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.f.d': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.f.s': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.le.d': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.le.s': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.lt.d': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.lt.s': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.nge.d': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.nge.s': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.ngl.d': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.ngl.s': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.ngle.d': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.ngle.s': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.ngt.d': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.ngt.s': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.ole.d': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.ole.s': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.olt.d': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.olt.s': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.seq.d': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.seq.s': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.sf.d': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.sf.s': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.ueq.d': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.ueq.s': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.ule.d': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.ule.s': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.ult.d': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.ult.s': {
        flags: {
            fpu: {
                '1': '1'
            }
        }
    },
    'c.un.d': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'c.un.s': {
        flags: {
            fpu: {
                '1': '0'
            }
        }
    },
    'ceil.w.d': {
        registerFiles: {
            fpu: {
                $f8: '4294967295'
            }
        }
    },
    'ceil.w.s': {
        registerFiles: {
            fpu: {
                $f0: '4294967295'
            }
        }
    },
    cfc1: {
        registers: {
            $t0: '0'
        }
    },
    clo: {
        registers: {
            $t2: '0'
        }
    },
    clz: {
        registers: {
            $t2: '8'
        }
    },
    ctc1: {
        registers: {
            $t1: '0'
        }
    },
    'cvt.d.s': {
        registerFiles: {
            fpu: {
                $f2: '0',
                $f3: '3220701184'
            }
        }
    },
    'cvt.d.w': {
        registerFiles: {
            fpu: {
                $f2: '0',
                $f3: '1075576832'
            }
        }
    },
    'cvt.s.d': {
        registerFiles: {
            fpu: {
                $f0: '3217031168'
            }
        }
    },
    'cvt.s.w': {
        registerFiles: {
            fpu: {
                $f0: '1088421888'
            }
        }
    },
    'cvt.w.d': {
        registerFiles: {
            fpu: {
                $f8: '2'
            }
        }
    },
    'cvt.w.s': {
        registerFiles: {
            fpu: {
                $f0: '2'
            }
        }
    },
    div: {
        registers: {
            $t2: '4',
            $t3: '3'
        }
    },
    'div.d': {
        registerFiles: {
            fpu: {
                $f6: '1431655765',
                $f7: '1071994197'
            }
        }
    },
    'div.s': {
        registerFiles: {
            fpu: {
                $f0: '1059760811'
            }
        }
    },
    divu: {
        registers: {
            $t2: '4',
            $t3: '3'
        }
    },
    eret: {
        registers: {
            $t2: '2'
        },
        registerFiles: {
            cp0: {
                '$14 (epc)': '4194324'
            }
        }
    },
    'floor.w.d': {
        registerFiles: {
            fpu: {
                $f8: '4294967294'
            }
        }
    },
    'floor.w.s': {
        registerFiles: {
            fpu: {
                $f0: '4294967294'
            }
        }
    },
    j: {
        registers: {
            $t2: '2'
        }
    },
    jal: {
        registers: {
            $t2: '1'
        }
    },
    jalr: {
        registers: {
            $t2: '1'
        }
    },
    jr: {
        registers: {
            $t2: '2'
        }
    },
    'l.d': {
        registerFiles: {
            fpu: {
                $f2: '0',
                $f3: '1074528256'
            }
        }
    },
    'l.s': {
        registerFiles: {
            fpu: {
                $f0: '1080033280'
            }
        }
    },
    la: {
        registers: {
            $t0: '268500992'
        }
    },
    lb: {
        registers: {
            $t0: '4294967295'
        }
    },
    lbu: {
        registers: {
            $t0: '255'
        }
    },
    ld: {
        registers: {
            $t0: '305419896',
            $t1: '0'
        }
    },
    ldc1: {
        registerFiles: {
            fpu: {
                $f2: '0',
                $f3: '1074528256'
            }
        }
    },
    lh: {
        registers: {
            $t0: '4294934819'
        }
    },
    lhu: {
        registers: {
            $t0: '33059'
        }
    },
    li: {
        registers: {
            $t2: '7'
        }
    },
    ll: {
        registers: {
            $t0: '305419896'
        }
    },
    lui: {
        registers: {
            $t0: '305397760'
        }
    },
    lw: {
        registers: {
            $t0: '305419896'
        }
    },
    lwc1: {
        registerFiles: {
            fpu: {
                $f0: '1080033280'
            }
        }
    },
    lwl: {
        registers: {
            $t0: '1450757341'
        }
    },
    lwr: {
        registers: {
            $t0: '2853319766'
        }
    },
    madd: {
        registers: {
            $t2: '42',
            $t3: '0'
        }
    },
    maddu: {
        registers: {
            $t2: '42',
            $t3: '0'
        }
    },
    mfc0: {
        registers: {
            $t0: '4660'
        }
    },
    mfc1: {
        registers: {
            $t0: '1065353216'
        }
    },
    'mfc1.d': {
        registers: {
            $t0: '0',
            $t1: '1073217536'
        }
    },
    mfhi: {
        registers: {
            $t2: '0'
        }
    },
    mflo: {
        registers: {
            $t2: '42'
        }
    },
    'mov.d': {
        registerFiles: {
            fpu: {
                $f6: '0',
                $f7: '3220701184'
            }
        }
    },
    'mov.s': {
        registerFiles: {
            fpu: {
                $f0: '3217031168'
            }
        }
    },
    move: {
        registers: {
            $t2: '7'
        }
    },
    movf: {
        registers: {
            $t2: '7'
        }
    },
    'movf.d': {
        registerFiles: {
            fpu: {
                $f6: '0',
                $f7: '0'
            }
        }
    },
    'movf.s': {
        registerFiles: {
            fpu: {
                $f6: '0'
            }
        }
    },
    movn: {
        registers: {
            $t2: '7'
        }
    },
    'movn.d': {
        registerFiles: {
            fpu: {
                $f2: '0',
                $f3: '1073741824'
            }
        }
    },
    'movn.s': {
        registerFiles: {
            fpu: {
                $f0: '1073741824'
            }
        }
    },
    movt: {
        registers: {
            $t2: '7'
        }
    },
    'movt.d': {
        registerFiles: {
            fpu: {
                $f6: '0',
                $f7: '1073741824'
            }
        }
    },
    'movt.s': {
        registerFiles: {
            fpu: {
                $f6: '1073741824'
            }
        }
    },
    movz: {
        registers: {
            $t2: '7'
        }
    },
    'movz.d': {
        registerFiles: {
            fpu: {
                $f2: '0',
                $f3: '1073741824'
            }
        }
    },
    'movz.s': {
        registerFiles: {
            fpu: {
                $f0: '1073741824'
            }
        }
    },
    msub: {
        registers: {
            $t2: '58'
        }
    },
    msubu: {
        registers: {
            $t2: '58'
        }
    },
    mtc0: {
        registerFiles: {
            cp0: {
                '$8 (vaddr)': '4660'
            }
        }
    },
    mtc1: {
        registerFiles: {
            fpu: {
                $f0: '1065353216'
            }
        }
    },
    'mtc1.d': {
        registerFiles: {
            fpu: {
                $f2: '0',
                $f3: '1073217536'
            }
        }
    },
    mthi: {
        registers: {
            $t2: '42'
        }
    },
    mtlo: {
        registers: {
            $t2: '42'
        }
    },
    mul: {
        registers: {
            $t2: '21'
        }
    },
    'mul.d': {
        registerFiles: {
            fpu: {
                $f6: '0',
                $f7: '1074462720'
            }
        }
    },
    'mul.s': {
        registerFiles: {
            fpu: {
                $f0: '1079508992'
            }
        }
    },
    mulo: {
        registers: {
            $t2: '21'
        }
    },
    mulou: {
        registers: {
            $t2: '21'
        }
    },
    mult: {
        registers: {
            $t2: '42',
            $t3: '0'
        }
    },
    multu: {
        registers: {
            $t2: '42',
            $t3: '0'
        }
    },
    mulu: {
        registers: {
            $t2: '21'
        }
    },
    neg: {
        registers: {
            $t2: '4294967289'
        }
    },
    'neg.d': {
        registerFiles: {
            fpu: {
                $f6: '0',
                $f7: '1073217536'
            }
        }
    },
    'neg.s': {
        registerFiles: {
            fpu: {
                $f0: '1069547520'
            }
        }
    },
    negu: {
        registers: {
            $t2: '4294967289'
        }
    },
    nop: {
        registers: {
            $t0: '7'
        }
    },
    nor: {
        registers: {
            $t2: '4294967288'
        }
    },
    not: {
        registers: {
            $t2: '4294967280'
        }
    },
    or: {
        registers: {
            $t2: '7'
        }
    },
    ori: {
        registers: {
            $t2: '53'
        }
    },
    pref: {
        memory: [
            {
                address: '0x10010000',
                bytes: [42, 0, 0, 0]
            }
        ]
    },
    rem: {
        registers: {
            $t2: '1'
        }
    },
    remu: {
        registers: {
            $t2: '1'
        }
    },
    rol: {
        registers: {
            $t2: '288'
        }
    },
    ror: {
        registers: {
            $t2: '536870913'
        }
    },
    rotr: {
        registers: {
            $t2: '536870913'
        }
    },
    rotrv: {
        registers: {
            $t2: '3758096384'
        }
    },
    'round.w.d': {
        registerFiles: {
            fpu: {
                $f8: '4294967294'
            }
        }
    },
    'round.w.s': {
        registerFiles: {
            fpu: {
                $f0: '4294967294'
            }
        }
    },
    's.d': {
        memory: [
            {
                address: '0x10010000',
                bytes: [0, 0, 0, 0, 0, 0, 12, 64]
            }
        ],
        registerFiles: {
            fpu: {
                $f2: '0',
                $f3: '1074528256'
            }
        }
    },
    's.s': {
        memory: [
            {
                address: '0x10010000',
                bytes: [0, 0, 96, 64]
            }
        ],
        registerFiles: {
            fpu: {
                $f0: '1080033280'
            }
        }
    },
    sb: {
        memory: [
            {
                address: '0x10010000',
                bytes: [120]
            }
        ]
    },
    sc: {
        registers: {
            $t0: '1'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [120, 86, 52, 18]
            }
        ]
    },
    sd: {
        memory: [
            {
                address: '0x10010000',
                bytes: [136, 119, 102, 85, 120, 86, 52, 18]
            }
        ]
    },
    sdc1: {
        memory: [
            {
                address: '0x10010000',
                bytes: [0, 0, 0, 0, 0, 0, 12, 64]
            }
        ],
        registerFiles: {
            fpu: {
                $f2: '0',
                $f3: '1074528256'
            }
        }
    },
    seb: {
        registers: {
            $t2: '4294967295'
        }
    },
    seh: {
        registers: {
            $t2: '4294934783'
        }
    },
    seq: {
        registers: {
            $t2: '0'
        }
    },
    sge: {
        registers: {
            $t2: '0'
        }
    },
    sgeu: {
        registers: {
            $t2: '1'
        }
    },
    sgt: {
        registers: {
            $t2: '0'
        }
    },
    sgtu: {
        registers: {
            $t2: '1'
        }
    },
    sh: {
        memory: [
            {
                address: '0x10010000',
                bytes: [120, 86]
            }
        ]
    },
    sle: {
        registers: {
            $t2: '1'
        }
    },
    sleu: {
        registers: {
            $t2: '0'
        }
    },
    sll: {
        registers: {
            $t2: '72'
        }
    },
    sllv: {
        registers: {
            $t2: '56'
        }
    },
    slt: {
        registers: {
            $t2: '1'
        }
    },
    slti: {
        registers: {
            $t2: '1'
        }
    },
    sltiu: {
        registers: {
            $t2: '0'
        }
    },
    sltu: {
        registers: {
            $t2: '0'
        }
    },
    sne: {
        registers: {
            $t2: '1'
        }
    },
    'sqrt.d': {
        registerFiles: {
            fpu: {
                $f6: '0',
                $f7: '1073217536'
            }
        }
    },
    'sqrt.s': {
        registerFiles: {
            fpu: {
                $f0: '1069547520'
            }
        }
    },
    sra: {
        registers: {
            $t2: '4294967292'
        }
    },
    srav: {
        registers: {
            $t2: '0'
        }
    },
    srl: {
        registers: {
            $t2: '18'
        }
    },
    srlv: {
        registers: {
            $t2: '0'
        }
    },
    sub: {
        registers: {
            $t2: '4'
        }
    },
    'sub.d': {
        registerFiles: {
            fpu: {
                $f6: '0',
                $f7: '3219652608'
            }
        }
    },
    'sub.s': {
        registerFiles: {
            fpu: {
                $f0: '3208642560'
            }
        }
    },
    subi: {
        registers: {
            $t2: '4'
        }
    },
    subiu: {
        registers: {
            $t2: '4'
        }
    },
    subu: {
        registers: {
            $t2: '4294967295'
        }
    },
    sw: {
        memory: [
            {
                address: '0x10010000',
                bytes: [120, 86, 52, 18]
            }
        ]
    },
    swc1: {
        memory: [
            {
                address: '0x10010000',
                bytes: [0, 0, 96, 64]
            }
        ],
        registerFiles: {
            fpu: {
                $f0: '1080033280'
            }
        }
    },
    swl: {
        memory: [
            {
                address: '0x10010000',
                bytes: [52, 18, 187, 170]
            }
        ]
    },
    swr: {
        memory: [
            {
                address: '0x10010000',
                bytes: [221, 120, 86, 52]
            }
        ]
    },
    sync: {
        registers: {
            $t1: '7'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [7, 0, 0, 0]
            }
        ]
    },
    syscall: {
        output: 'MIPS syscall example\n'
    },
    teq: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    teqi: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    tge: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    tgei: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    tgeiu: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    tgeu: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    tlt: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    tlti: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    tltiu: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    tltu: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    tne: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    tnei: {
        stop: 'exception',
        error: 'trap',
        registerFiles: {
            cp0: {
                '$13 (cause)': '52'
            }
        }
    },
    'trunc.w.d': {
        registerFiles: {
            fpu: {
                $f8: '4294967295'
            }
        }
    },
    'trunc.w.s': {
        registerFiles: {
            fpu: {
                $f0: '4294967295'
            }
        }
    },
    ulh: {
        registers: {
            $t0: '13330'
        }
    },
    ulhu: {
        registers: {
            $t0: '13330'
        }
    },
    ulw: {
        registers: {
            $t0: '1193046'
        }
    },
    ush: {
        memory: [
            {
                address: '0x10010000',
                bytes: [0, 120, 86]
            }
        ]
    },
    usw: {
        memory: [
            {
                address: '0x10010000',
                bytes: [0, 120, 86, 52, 18]
            }
        ]
    },
    wait: {
        registers: {
            $t2: '1'
        }
    },
    wsbh: {
        registers: {
            $t2: '65408'
        }
    },
    xor: {
        registers: {
            $t2: '4'
        }
    },
    xori: {
        registers: {
            $t2: '4'
        }
    }
}
